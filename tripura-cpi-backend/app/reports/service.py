"""Report generation orchestration.

Synchronous in POST (instant errors): validate columns/params, district
scope, referential checks, fetch, projection (all shared with preview via
_prepare), then per-format row caps + confirm handshake. Then a PENDING
history row is inserted and rendering moves to
an in-process background task (asyncio.create_task) — the row doubles as
the job record (status/progress/error), so polling works across uvicorn
workers. Render itself runs in the worker's threadpool; a per-worker
semaphore bounds concurrent renders (global concurrency = workers × limit).

Regeneration replays a stored row through the same _prepare path and reuses
the same job, claiming the row's job slot and swapping in the new file only
once it renders — the reports read live data, so this is how a report whose
underlying prices have since changed is brought up to date in place.
"""

import asyncio
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

import anyio
from fastapi import HTTPException
from psycopg import AsyncConnection
from pydantic import BaseModel, ValidationError

from app.config import settings
from app.database import get_pool
from app.logger import logger
from app.reports import queries, renderers
from app.reports.base import ReportPayload, ReportType
from app.reports.catalog import REPORT_TYPES
from app.reports.models import GenerateReportRequest, PreviewReportRequest
from app.reports.movement import MAX_ROUND_WINDOW

_render_semaphore = asyncio.Semaphore(settings.report_max_concurrent_renders)
_jobs: set[asyncio.Task] = set()


def reports_dir() -> Path:
    return Path(settings.reports_dir).resolve()


def _validate_params(report_type: ReportType, raw: dict) -> BaseModel:
    try:
        return report_type.params_model.model_validate(raw)
    except ValidationError as exc:
        raise HTTPException(
            422,
            detail=[
                {"loc": ["params", *e["loc"]], "msg": e["msg"], "type": e["type"]}
                for e in exc.errors()
            ],
        )


def _validate_columns(
    report_type: ReportType, columns: list[str] | None, params: BaseModel | None = None
) -> list[str]:
    """Resolve the columns to render. A report whose filters imply columns
    supplies a columns_fn and owns both branches (chosen or defaults); the
    rest fall back to their static default_columns."""
    if columns is not None:
        if not columns:
            raise HTTPException(422, "columns must not be empty")
        unknown = [c for c in columns if c not in report_type.columns]
        if unknown:
            raise HTTPException(422, f"Unknown columns: {', '.join(unknown)}")
        if len(set(columns)) != len(columns):
            raise HTTPException(422, "Duplicate columns in selection")
    if report_type.columns_fn is not None and params is not None:
        return report_type.columns_fn(params, columns)
    return columns if columns is not None else report_type.default_columns


def _apply_district_scope(user: dict, params: BaseModel) -> BaseModel:
    """DS users are pinned to their own district; admins pass through."""
    if user["role"] == "ADMIN":
        return params
    if getattr(params, "district_id", None) is None:
        return params.model_copy(update={"district_id": user["district_id"]})
    if params.district_id != user["district_id"]:
        raise HTTPException(403, "District is outside your scope")
    return params


async def _round_row(conn: AsyncConnection, round_id: int, what: str) -> dict:
    row = await queries.get_round(conn, round_id)
    if not row:
        raise HTTPException(404, f"{what} not found")
    return row


def _round_label(round_row: dict) -> str:
    return round_row["round_name"] or f"Round {round_row['round_number']}"


async def _round_meta(
    conn: AsyncConnection, params: BaseModel
) -> list[tuple[str, str]]:
    """Resolve the round(s) a report is anchored to. Single-round params
    carry `round_id`; range params carry `from_round_id`/`to_round_id`, and
    the range must be same-cycle, in order, and narrow enough to render one
    column per round."""
    if hasattr(params, "round_id"):
        round_row = await _round_row(conn, params.round_id, "Survey round")
        return [
            ("Survey Round", _round_label(round_row)),
            (
                "Round Period",
                f"{round_row['round_start_date']:%d %b %Y} – {round_row['round_end_date']:%d %b %Y}",
            ),
        ]

    from_row = await _round_row(conn, params.from_round_id, "From round")
    to_row = await _round_row(conn, params.to_round_id, "To round")
    if from_row["cycle"] != to_row["cycle"]:
        raise HTTPException(422, "Rounds must belong to the same cycle")
    if from_row["round_number"] > to_row["round_number"]:
        raise HTTPException(422, "from_round must not be after to_round")
    span = to_row["round_number"] - from_row["round_number"] + 1
    if span > MAX_ROUND_WINDOW:
        raise HTTPException(
            422,
            f"Range spans {span} rounds (limit {MAX_ROUND_WINDOW}) — narrow the round range",
        )
    return [
        (
            "Rounds",
            f"{_round_label(from_row)} – {_round_label(to_row)}"
            f" ({span} round{'s' if span > 1 else ''})",
        ),
        (
            "Round Period",
            f"{from_row['round_start_date']:%d %b %Y} – {to_row['round_end_date']:%d %b %Y}",
        ),
    ]


async def _assert_references(
    conn: AsyncConnection, params: BaseModel
) -> list[tuple[str, str]]:
    """Check the validated ids exist and cohere; return the meta rows
    (round/district/market names) for the document header."""
    meta = await _round_meta(conn, params)

    district_id = getattr(params, "district_id", None)
    if district_id is not None:
        district = await queries.get_district(conn, district_id)
        if not district:
            raise HTTPException(404, "District not found")
        meta.append(("District", district["name"]))
    else:
        meta.append(("District", "All districts"))

    market_id = getattr(params, "market_id", None)
    if market_id is not None:
        market = await queries.get_market(conn, market_id)
        if not market:
            raise HTTPException(404, "Market not found")
        if market["district_id"] != district_id:
            raise HTTPException(422, "Market does not belong to the given district")
        meta.append(
            ("Market", f"{market['selected_market']} ({market['market_code']})")
        )

    return meta


def format_availability(total_rows: int) -> dict:
    """Advisory twin of _assert_row_caps: which formats this row count is
    still allowed for, and whether generation will demand confirm=true.
    Reads the same settings, so preview and POST /reports never disagree."""
    caps = {
        "pdf": settings.report_max_rows,
        "docx": settings.report_max_rows,
        "xlsx": settings.report_max_rows_xlsx,
    }
    return {
        "allowed_formats": [f for f, cap in caps.items() if total_rows <= cap],
        "exceeds_warn_threshold": total_rows > settings.report_warn_rows,
    }


def _assert_row_caps(total_rows: int, file_format: str, confirm: bool) -> None:
    """Hard cap per format (422); above the warn threshold, require an
    explicit confirm=true re-request (409 with requires_confirmation)."""
    hard_cap = (
        settings.report_max_rows_xlsx
        if file_format == "xlsx"
        else settings.report_max_rows
    )
    if total_rows > hard_cap:
        raise HTTPException(
            422,
            f"Report would contain {total_rows} rows (limit {hard_cap} for {file_format}) — narrow your filters, or use Excel",
        )
    if total_rows > settings.report_warn_rows and not confirm:
        raise HTTPException(
            409,
            detail={
                "message": (
                    f"Report will contain {total_rows} rows and may take a while "
                    "to generate. Re-submit with confirm=true to proceed."
                ),
                "rows": total_rows,
                "requires_confirmation": True,
            },
        )


def _project(payload: ReportPayload, columns: list[str]) -> None:
    """Narrow each section to the chosen columns, in the chosen order.
    Sections that don't carry a chosen column simply omit it."""
    for section in payload.sections:
        section.columns = {
            k: section.columns[k] for k in columns if k in section.columns
        }


def spawn_job(job) -> None:
    """Start a render job coroutine. Must be called AFTER the connection
    that inserted the PENDING row has committed (i.e. outside the router's
    pool.connection() block), or the job could update an invisible row."""
    task = asyncio.create_task(job)
    _jobs.add(task)
    task.add_done_callback(_jobs.discard)


async def _prepare(
    conn: AsyncConnection,
    user: dict,
    report_type_key: str,
    raw_params: dict,
    raw_columns: list[str] | None,
):
    """Validate, scope, fetch and project — everything generate and preview
    share, with no side effects. Projection is column-only, so doing it here
    (before the caller's row caps) cannot change any row count."""
    report_type = REPORT_TYPES.get(report_type_key)
    if not report_type:
        raise HTTPException(404, f"Unknown report type: {report_type_key}")

    # Params first: a report's chosen filters can decide its columns.
    params = _validate_params(report_type, raw_params)
    params = _apply_district_scope(user, params)
    columns = _validate_columns(report_type, raw_columns, params)
    meta = await _assert_references(conn, params)

    payload = await report_type.fetch(conn, params)
    _project(payload, columns)
    return report_type, params, columns, meta, payload


async def preview_report(
    conn: AsyncConnection, user: dict, body: PreviewReportRequest
) -> dict:
    """Dry run: the same data the document would carry, truncated to a
    sample, plus the exact total and what it means for each output format.
    Never raises on size — the caps come back as data."""
    report_type, _params, _columns, meta, payload = await _prepare(
        conn, user, body.report_type, body.params, body.columns
    )
    total_rows = sum(len(s.rows) for s in payload.sections)

    sections = []
    budget = body.limit  # a global row budget, not per-section
    for section in payload.sections:
        view = renderers.section_view(section, limit=budget)
        budget -= len(view["rows"])
        sections.append(
            {
                "heading": view["heading"],
                "columns": [
                    {"key": k, "label": c.label} for k, c in section.columns.items()
                ],
                "rows": view["rows"],
                "total_rows": len(section.rows),
            }
        )

    returned_rows = body.limit - budget
    return {
        "report_type": report_type.key,
        "report_title": report_type.title,
        "meta": meta,
        "sections": sections,
        "total_rows": total_rows,
        "returned_rows": returned_rows,
        "truncated": returned_rows < total_rows,
        "limits": {
            "warn_rows": settings.report_warn_rows,
            "max_rows_pdf_docx": settings.report_max_rows,
            "max_rows_xlsx": settings.report_max_rows_xlsx,
        },
        **format_availability(total_rows),
    }


async def generate_report(
    conn: AsyncConnection, user: dict, body: GenerateReportRequest
):
    report_type, params, columns, meta, payload = await _prepare(
        conn, user, body.report_type, body.params, body.columns
    )
    total_rows = sum(len(s.rows) for s in payload.sections)
    _assert_row_caps(total_rows, body.file_format, body.confirm)

    generated_at = datetime.now(UTC)
    payload.meta = meta + [
        ("Generated By", user["full_name"] or user["username"]),
        ("Generated At", f"{generated_at:%d %b %Y %H:%M} UTC"),
    ]

    file_name = f"{uuid.uuid4().hex}.{body.file_format}"
    row = await queries.insert_generated_report(
        conn,
        {
            "report_type": report_type.key,
            "title": body.title,
            "description": body.description,
            "file_format": body.file_format,
            "file_path": file_name,
            "params": {
                "filters": params.model_dump(),
                "columns": columns,
            },
            "status": "PENDING",
            "progress": 0,
            "generated_by_user_id": user["user_id"],
            "generated_by_username": user["username"],
            "district_id": getattr(params, "district_id", None),
        },
    )
    job = _render_job(
        row["generated_report_id"],
        payload,
        body.title,
        body.description,
        body.file_format,
        file_name,
    )
    logger.info(
        "Queued report %s (%s, %s, %d rows) by '%s'",
        row["generated_report_id"],
        report_type.key,
        body.file_format,
        total_rows,
        user["username"],
    )
    return row, job


async def regenerate_report(
    conn: AsyncConnection, user: dict, report: dict, confirm: bool = False
):
    """Re-run a stored report against current data, in place. Strict replay:
    report_type, title, description, file_format, filters and columns all come
    from the row — the only knob is the confirm handshake, because row counts
    drift with the data the report reads.

    Every check runs before the row is claimed, so a rejected regeneration
    leaves the existing report untouched and downloadable."""
    if report["status"] == "PENDING":
        raise HTTPException(409, "Report is already being generated")

    stored = report["params"] or {}
    report_type, _params, _columns, meta, payload = await _prepare(
        conn,
        user,
        report["report_type"],
        stored.get("filters") or {},
        stored.get("columns"),
    )
    total_rows = sum(len(s.rows) for s in payload.sections)
    _assert_row_caps(total_rows, report["file_format"], confirm)

    generated_at = datetime.now(UTC)
    payload.meta = meta + [
        ("Generated By", user["full_name"] or user["username"]),
        ("Generated At", f"{generated_at:%d %b %Y %H:%M} UTC"),
    ]

    file_name = f"{uuid.uuid4().hex}.{report['file_format']}"
    # Claimed last: params/columns/district_id are never written back, so a
    # strict replay stays read-only on the stored report definition.
    row = await queries.claim_report_for_regeneration(
        conn, report["generated_report_id"], user["user_id"], user["username"]
    )
    if row is None:
        # another regeneration claimed it between our fetch and here
        raise HTTPException(409, "Report is already being generated")

    job = _render_job(
        row["generated_report_id"],
        payload,
        row["title"],
        row["description"],
        row["file_format"],
        file_name,
        replaces_file=report["file_path"],
    )
    logger.info(
        "Queued regeneration of report %s (%s, %s, %d rows) by '%s'",
        row["generated_report_id"],
        report_type.key,
        row["file_format"],
        total_rows,
        user["username"],
    )
    return row, job


# ── Background job ───────────────────────────────────────────────────


async def _set_progress(report_id: int, progress: int) -> None:
    pool = get_pool()
    async with pool.connection() as conn:
        await queries.update_report_progress(conn, report_id, progress)


def _make_progress_cb(report_id: int):
    """Throttled callback for the render thread: ≥5 points AND ≥1s between
    DB writes. Runs in the threadpool; hops to the loop via from_thread."""
    state = {"pct": 0, "t": 0.0}

    def cb(done: int, total: int) -> None:
        pct = 5 + int(done * 85 / max(total, 1))  # rows map to 5..90
        now = time.monotonic()
        if pct - state["pct"] >= 5 and now - state["t"] >= 1.0:
            state["pct"], state["t"] = pct, now
            anyio.from_thread.run(_set_progress, report_id, pct)

    return cb


async def _render_job(
    report_id: int,
    payload: ReportPayload,
    title: str,
    description: str | None,
    file_format: str,
    file_name: str,
    replaces_file: str | None = None,
) -> None:
    """Render into a fresh file, then swap: file_path flips to the new file in
    the same UPDATE that marks the row READY, and only then is the file it
    replaced unlinked. So a job only ever deletes the file it wrote (when it
    fails or loses the race) or the file it replaced (when it wins), and no
    path can orphan a file or leave file_path dangling. replaces_file is None
    for a first generation, where the row already names this file."""
    async with _render_semaphore:
        file_path = reports_dir() / file_name
        try:
            if file_format == "pdf":
                # WeasyPrint is one opaque call — stage-based progress only
                await _set_progress(report_id, 15)
                content = await anyio.to_thread.run_sync(
                    renderers.render_pdf, payload, title, description
                )
            else:
                render = (
                    renderers.render_docx
                    if file_format == "docx"
                    else renderers.render_xlsx
                )
                content = await anyio.to_thread.run_sync(
                    render, payload, title, description, _make_progress_cb(report_id)
                )
            await _set_progress(report_id, 95)
            await anyio.to_thread.run_sync(file_path.write_bytes, content)

            pool = get_pool()
            async with pool.connection() as conn:
                row = await queries.finish_report(
                    conn, report_id, "READY", file_path=file_name
                )
            if row is None:
                # deleted while rendering, or superseded by a newer job — drop
                # what we wrote and leave the row's own file alone
                file_path.unlink(missing_ok=True)
            else:
                if replaces_file and replaces_file != file_name:
                    (reports_dir() / replaces_file).unlink(missing_ok=True)
                logger.info("Report %s ready (%s)", report_id, file_name)
        except Exception as exc:
            logger.exception("Report %s failed", report_id)
            file_path.unlink(missing_ok=True)  # never the file we replaced
            try:
                pool = get_pool()
                async with pool.connection() as conn:
                    await queries.finish_report(
                        conn, report_id, "FAILED", str(exc)[:500]
                    )
            except Exception:
                logger.exception("Report %s: could not record failure", report_id)


# ── Lifespan hooks (called from app.main) ────────────────────────────


async def sweep_stale_jobs() -> None:
    """Fail PENDING rows orphaned by a crash/redeploy. Age-guarded so a
    late-booting worker can't kill a sibling worker's live job."""
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.sweep_stale_pending(conn)
    if rows:
        logger.warning("Swept %d stale PENDING report job(s)", len(rows))


async def wait_for_jobs(timeout: float = 10.0) -> None:
    """Give in-flight render jobs a grace period on shutdown; stragglers
    are handled by the next boot's sweep."""
    if _jobs:
        await asyncio.wait(set(_jobs), timeout=timeout)
