from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from app.auth.dependencies import require_admin_or_supervisor
from app.database import get_pool
from app.reports import queries, service
from app.reports.catalog import REPORT_TYPES
from app.reports.models import (
    GeneratedReportOut,
    GenerateReportRequest,
    PreviewReportRequest,
    ReportColumnOut,
    ReportPreviewOut,
    ReportTypeOut,
    UpdateReportRequest,
)

router = APIRouter(prefix="/reports", tags=["Reports"])

_MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _pagination(offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=1000)):
    return offset, limit


def _assert_report_in_scope(user: dict, report: dict) -> None:
    """Admins see everything; a DS only reports stamped with their district.
    All-district reports (district_id NULL) are admin-only."""
    if user["role"] == "ADMIN":
        return
    if report["district_id"] != user["district_id"]:
        raise HTTPException(403, "Report is outside your district")


@router.get("/types", response_model=list[ReportTypeOut])
async def list_report_types(_user: dict = Depends(require_admin_or_supervisor)):
    return [
        ReportTypeOut(
            key=rt.key,
            sequence=rt.sequence,
            title=rt.title,
            description=rt.description,
            columns=[
                ReportColumnOut(
                    key=k,
                    label=c.label,
                    default=k in rt.default_columns,
                    implied_by=rt.implied_by.get(k, []),
                )
                for k, c in rt.columns.items()
            ],
            params_schema=rt.params_model.model_json_schema(),
        )
        for rt in sorted(REPORT_TYPES.values(), key=lambda rt: rt.sequence)
    ]


@router.post("", response_model=GeneratedReportOut, status_code=202)
async def generate_report(
    body: GenerateReportRequest,
    user: dict = Depends(require_admin_or_supervisor),
):
    """Queue a report. Returns the PENDING row; poll GET /reports until
    READY, then download. 409 responses are either the confirmation
    handshake (body carries requires_confirmation: true — re-submit with
    confirm=true), a not-ready report on download, or a report that already
    has a render in flight on regenerate."""
    pool = get_pool()
    async with pool.connection() as conn:
        row, job = await service.generate_report(conn, user, body)
    # Spawn only after the PENDING row is committed (context exit above)
    service.spawn_job(job)
    return row


@router.post(
    "/{generated_report_id}/regenerate",
    response_model=GeneratedReportOut,
    status_code=202,
)
async def regenerate_report(
    generated_report_id: int,
    user: dict = Depends(require_admin_or_supervisor),
    confirm: bool = Query(
        False,
        description="Re-submit with confirm=true after a 409 requires_confirmation",
    ),
):
    """Re-run an existing report against current data, in place: same id,
    title, description, format, filters and columns — only the file and the
    data are new. Reports read live data, so this is how one invalidated by a
    re-survey, a correction or a renamed market is brought up to date.

    Allowed from READY or FAILED — a report the restart sweep failed is
    recovered this way; 409 while a render is already in flight. The row goes
    back to PENDING, so the previous file stops being downloadable for the
    duration of the render and is deleted once the new one succeeds. The body
    is empty; the row-count confirmation handshake is the query param."""
    pool = get_pool()
    async with pool.connection() as conn:
        report = await queries.get_generated_report(conn, generated_report_id)
        if not report:
            raise HTTPException(404, "Report not found")
        _assert_report_in_scope(user, report)
        row, job = await service.regenerate_report(conn, user, report, confirm)
    # Spawn only after the claim is committed (context exit above)
    service.spawn_job(job)
    return row


@router.post("/preview", response_model=ReportPreviewOut)
async def preview_report(
    body: PreviewReportRequest,
    user: dict = Depends(require_admin_or_supervisor),
):
    """Dry-run a report: same validation, district scoping and data fetch as
    POST /reports, but returns a row sample plus the exact total instead of
    queueing a render. Never rejects on size — the row caps come back as
    `limits` / `allowed_formats` / `exceeds_warn_threshold` so the caller can
    narrow filters or switch format before committing."""
    pool = get_pool()
    async with pool.connection() as conn:
        return await service.preview_report(conn, user, body)


@router.get("", response_model=list[GeneratedReportOut])
async def list_reports(
    user: dict = Depends(require_admin_or_supervisor),
    pagination: tuple[int, int] = Depends(_pagination),
):
    offset, limit = pagination
    district_id = None if user["role"] == "ADMIN" else user["district_id"]
    pool = get_pool()
    async with pool.connection() as conn:
        return await queries.list_generated_reports(
            conn, district_id=district_id, offset=offset, limit=limit
        )


@router.put("/{generated_report_id}", response_model=GeneratedReportOut)
async def update_report(
    generated_report_id: int,
    body: UpdateReportRequest,
    user: dict = Depends(require_admin_or_supervisor),
):
    """Rename a report and/or edit its description. Title/description are
    display-only, so this is allowed in any status and never touches the
    generated file or background job."""
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        report = await queries.get_generated_report(conn, generated_report_id)
        if not report:
            raise HTTPException(404, "Report not found")
        _assert_report_in_scope(user, report)

        data: dict = {}
        if body.title is not None:
            data["title"] = body.title
        if "description" in body.model_fields_set:
            data["description"] = body.description or None

        row = await queries.update_generated_report(conn, generated_report_id, data)
    return row


@router.get("/{generated_report_id}/download")
async def download_report(
    generated_report_id: int,
    user: dict = Depends(require_admin_or_supervisor),
):
    pool = get_pool()
    async with pool.connection() as conn:
        report = await queries.get_generated_report(conn, generated_report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    _assert_report_in_scope(user, report)
    if report["status"] == "PENDING":
        raise HTTPException(409, "Report is not ready yet")
    if report["status"] == "FAILED":
        raise HTTPException(422, f"Report generation failed: {report['error']}")

    file_path = service.reports_dir() / report["file_path"]
    if not file_path.is_file():
        raise HTTPException(404, "Report file is missing on disk")

    safe_title = (
        "".join(
            ch if ch.isalnum() or ch in " -_" else "_" for ch in report["title"]
        ).strip()
        or "report"
    )
    return FileResponse(
        file_path,
        media_type=_MEDIA_TYPES[report["file_format"]],
        filename=f"{safe_title}.{report['file_format']}",
    )


@router.delete("/{generated_report_id}", status_code=204)
async def delete_report(
    generated_report_id: int,
    user: dict = Depends(require_admin_or_supervisor),
):
    pool = get_pool()
    async with pool.connection() as conn:
        report = await queries.get_generated_report(conn, generated_report_id)
        if not report:
            raise HTTPException(404, "Report not found")
        _assert_report_in_scope(user, report)
        await queries.delete_generated_report(conn, generated_report_id)
    # Row is gone (committed); a leftover file is harmless if unlink fails.
    (service.reports_dir() / report["file_path"]).unlink(missing_ok=True)
