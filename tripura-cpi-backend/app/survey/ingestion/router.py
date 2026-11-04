from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.auth.dependencies import assert_market_in_scope, require_admin_or_supervisor
from app.config import settings
from app.database import get_pool
from app.logger import logger
from app.master_data import queries as md_queries
from app.master_data.ingestion.archive import build_zip, expand_file
from app.master_data.ingestion.models import (
    BulkBundleResponse,
    BulkRecordResult,
    BulkUploadResponse,
    FileUploadResult,
)
from app.master_data.ingestion.parser import (
    generate_data_xlsx,
    generate_template_xlsx,
    parse_content,
    parse_upload,
)
from app.survey import guards
from app.survey import queries as survey_queries
from app.survey.ingestion import export as setup_export
from app.survey.ingestion.diff import diff_fields, merge_status
from app.survey.ingestion.validators import (
    MARKET_SHOP_ITEM_SETUP_COLUMNS,
    validate_market_shop_item_setup,
)

router = APIRouter(
    prefix="/survey/ingestion",
    tags=["Survey Ingestion"],
)

XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
ZIP_MEDIA = "application/zip"

# "create" only inserts what is missing (the original behaviour); "upsert" also
# updates what is already there, and swaps a slot's shop when the sheet names a
# different one. Neither writes shop master data.
Mode = Literal["create", "upsert"]

# The three market_item columns an edit sheet may change.
_MARKET_ITEM_FIELDS = [
    "unit_of_sale",
    "product_specification",
    "market_item_description",
]

# The same three columns named the way the sheet names them, so a change preview
# points at a cell the uploader can find. market_item_description is "local name":
# the item's locally reported name, not the master item name in the grey column.
_MARKET_ITEM_LABELS = {
    "unit_of_sale": "unit",
    "product_specification": "product specification",
    "market_item_description": "local name",
}


def _is_loggable(r: BulkRecordResult) -> bool:
    return r.status in ("error", "duplicate", "updated") or bool(r.warning)


def _result_lines(r: BulkRecordResult, indent: str = "") -> list[str]:
    """The log lines one result contributes, shared by the single and bulk logs."""
    ident = r.identifier or ""
    lines: list[str] = []
    if r.status == "error":
        lines.append(f"{indent}[ERROR] Row {r.row} | {ident} | {r.detail}")
    elif r.status == "duplicate":
        lines.append(f"{indent}[DUPLICATE] Row {r.row} | {ident} | {r.detail}")
    elif r.status == "updated":
        lines.append(
            f"{indent}[UPDATED] Row {r.row} | {ident} | {'; '.join(r.changes)}"
        )
    if r.warning:
        lines.append(f"{indent}[WARNING] Row {r.row} | {ident} | {r.warning}")
    return lines


def _summary_line(results: list[BulkRecordResult]) -> str:
    counts = _count_results(results)
    return (
        f"Total: {len(results)} | Created: {counts['created']} | "
        f"Updated: {counts['updated']} | Unchanged: {counts['unchanged']} | "
        f"Duplicates: {counts['duplicates']} | Errors: {counts['errors']} | "
        f"Warnings: {counts['warnings']}"
    )


def _count_results(results: list[BulkRecordResult]) -> dict[str, int]:
    return {
        "created": sum(1 for r in results if r.status == "created"),
        "updated": sum(1 for r in results if r.status == "updated"),
        "unchanged": sum(1 for r in results if r.status == "unchanged"),
        "duplicates": sum(1 for r in results if r.status == "duplicate"),
        "errors": sum(1 for r in results if r.status == "error"),
        "warnings": sum(1 for r in results if r.warning),
    }


def _write_upload_log(
    filename: str,
    results: list[BulkRecordResult],
    entity: str,
    *,
    round_id: int | None = None,
    market_id: int | None = None,
    mode: str = "create",
) -> None:
    """Write a log file for a bulk upload with all non-created results."""
    loggable = [r for r in results if _is_loggable(r)]
    if not loggable:
        return

    log_dir = Path(settings.log_dir) / "uploads"
    log_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now()
    ts = now.strftime("%Y-%m-%d_%H%M%S")
    log_path = log_dir / f"{entity}_{ts}.log"

    lines: list[str] = [
        f"Upload Log: {entity}",
        f"Timestamp:  {now.strftime('%Y-%m-%d %H:%M:%S')}",
        f"File:       {filename}",
        f"Mode:       {mode}",
    ]
    if round_id is not None:
        lines.append(f"Round ID:   {round_id}")
    if market_id is not None:
        lines.append(f"Market ID:  {market_id}")
    lines += [_summary_line(results), "=" * 80, ""]

    for r in loggable:
        lines += _result_lines(r)

    log_path.write_text("\n".join(lines) + "\n")


def _xlsx_response(content: bytes, filename: str) -> StreamingResponse:
    return _file_response(content, filename, XLSX_MEDIA)


def _file_response(content: bytes, filename: str, media_type: str) -> StreamingResponse:
    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _build_response(
    entity: str,
    results: list[BulkRecordResult],
    dry_run: bool,
    mode: str = "create",
) -> BulkUploadResponse:
    return BulkUploadResponse(
        entity=entity,
        total=len(results),
        **_count_results(results),
        dry_run=dry_run,
        mode=mode,
        results=results,
    )


# ── Template Download ──────────────────────────────────────────────────────


@router.get("/templates/market-shop-item-setup")
async def download_market_shop_item_setup_template(
    _user: dict = Depends(require_admin_or_supervisor),
):
    return _xlsx_response(
        generate_template_xlsx(MARKET_SHOP_ITEM_SETUP_COLUMNS),
        "market_shop_item_setup_template.xlsx",
    )


# ── Setup Export (edit-in-Excel round trip) ────────────────────────────────


# Well above the 107 shops of the largest market — the Instructions tab lists them
# all so a replacement code can be picked without leaving the file.
_SHOP_LIST_LIMIT = 1000


async def _build_market_sheet(conn, round_id: int, market: dict, setups) -> bytes:
    sheet = setup_export.build_setup_sheet_rows(market, setups)
    shops = await md_queries.list_shops(
        conn, market["market_id"], limit=_SHOP_LIST_LIMIT
    )
    return generate_data_xlsx(
        MARKET_SHOP_ITEM_SETUP_COLUMNS,
        sheet.rows,
        sheet_name="Setup",
        extra_sheets=setup_export.instructions_sheet(sheet, shops),
    )


@router.get("/rounds/{round_id}/markets/{market_id}/market-shop-item-setup/export")
async def export_market_shop_item_setup(
    round_id: int,
    market_id: int,
    user: dict = Depends(require_admin_or_supervisor),
):
    """One market's current setups in the upload sheet layout.

    Edit the file in Excel and send it back to the upload endpoint with
    `mode=upsert` to apply the changes.
    """
    pool = get_pool()
    async with pool.connection() as conn:
        round_row = await guards.get_round_or_404(conn, round_id)
        await assert_market_in_scope(conn, user, market_id)
        market = await md_queries.get_market(conn, market_id)
        if not market:
            raise HTTPException(404, "Market not found")
        setups = await survey_queries.list_setups_for_export(conn, round_id, market_id)
        content = await _build_market_sheet(conn, round_id, market, setups)

    return _xlsx_response(content, setup_export.export_filename(market, round_row))


@router.get("/rounds/{round_id}/market-shop-item-setup/export")
async def export_round_setups(
    round_id: int,
    district_id: int | None = None,
    user: dict = Depends(require_admin_or_supervisor),
):
    """Every market's setups for a round, as a zip of one sheet per market —
    the inverse of the bulk upload, which accepts exactly this zip back."""
    if user["role"] != "ADMIN":
        if district_id not in (None, user["district_id"]):
            raise HTTPException(403, "District is outside your scope")
        district_id = user["district_id"]

    pool = get_pool()
    async with pool.connection() as conn:
        round_row = await guards.get_round_or_404(conn, round_id)
        markets = await survey_queries.list_markets_by_round(
            conn, round_id, district_id
        )
        if len(markets) > settings.max_bulk_files:
            raise HTTPException(
                400,
                f"Round has {len(markets)} markets in scope; "
                f"export at most {settings.max_bulk_files} at a time",
            )

        members: list[tuple[str, bytes]] = []
        for row in markets:
            market = await md_queries.get_market(conn, row["market_id"])
            if not market:
                continue
            setups = await survey_queries.list_setups_for_export(
                conn, round_id, market["market_id"]
            )
            if not setups:
                continue  # nothing set up yet; an empty sheet would fail on re-upload
            members.append(
                (
                    setup_export.export_filename(market, round_row),
                    await _build_market_sheet(conn, round_id, market, setups),
                )
            )

    if not members:
        raise HTTPException(404, "No markets with setups found for this round")

    return _file_response(
        build_zip(members),
        f"setups_round{round_row['round_number']}.zip",
        ZIP_MEDIA,
    )


# ── Market-Shop-Item Setup Upload ──────────────────────────────────────────


def _record(r: BulkRecordResult, status: str, changes=()) -> None:
    r.status = merge_status(r.status, status)
    r.changes.extend(changes)


def _fail(r: BulkRecordResult, detail: str) -> None:
    r.status = "error"
    r.detail = detail


def _resolve_market_item(candidates):
    """The market item a sheet slot refers to, or (None, 0) to create one.

    A sheet row names its slot by item code + shop code, which is the setup's whole
    identity. It is not quite the market item's: that table additionally keys on
    specification and unit, so a shop can hold two specifications of one item. The
    lowest id wins — the same one the export writes out — and the count lets the
    caller mention the others if it is about to overwrite one.
    """
    if not candidates:
        return None, 0
    return candidates[0], len(candidates)


def _market_item_payload(slot: dict, item_id: int, shop_id: int, round_id: int) -> dict:
    data = {
        "item_id": item_id,
        "shop_id": shop_id,
        "round_id": round_id,
        "unit_of_sale": slot["unit_of_sale"],
    }
    if slot["product_specification"]:
        data["product_specification"] = slot["product_specification"]
    if slot["market_item_description"]:
        data["market_item_description"] = slot["market_item_description"]
    return data


# ── Upsert: reconcile each item's shops ────────────────────────────────────


@dataclass
class _Displaced:
    """A shop pushed out of a slot because the sheet put a different one there."""

    serial: str
    setup_id: int
    market_item_ids: list[int]
    has_collected_price: bool
    result_index: int  # the slot that replaced it
    new_serial: str


@dataclass
class _ItemPlan:
    matched: list[tuple[dict, dict]]  # (sheet slot, stored shop state)
    to_create: list[dict]  # sheet slots naming a shop the item does not have yet
    displaced: list[_Displaced]
    blocked: set[int]  # result indexes that must not be written at all


def _plan_item(slots, existing, *, allow_deletes: bool) -> _ItemPlan:
    """Reconcile one item's shops: what the sheet asks for against what is stored.

    Keyed on the shop rather than the slot, so moving a shop between substitute
    slots stays a cheap status update instead of a delete plus a create. A stored
    shop the sheet never names is displaced only when another shop has taken the
    slot it held — a blank cell always means "leave this alone".

    Pure: `slots` are validated sheet slots (each carrying `shop_id`), `existing`
    is `{shop_id: stored state}` from `_load_existing_items`.
    """
    desired = {s["shop_id"]: s for s in slots}
    filled = {s["shop_selection_status"] for s in slots}

    matched = [(s, existing[sid]) for sid, s in desired.items() if sid in existing]
    to_create = [s for sid, s in desired.items() if sid not in existing]

    displaced: list[_Displaced] = []
    if allow_deletes:
        for shop_id, stored in existing.items():
            if shop_id in desired:
                continue
            status = stored["shop_selection_status"]
            if status not in filled:
                continue  # nobody took its slot — leave it alone
            replacer = min(
                (s for s in slots if s["shop_selection_status"] == status),
                key=lambda s: s["result_index"],
            )
            displaced.append(
                _Displaced(
                    serial=stored["shop_serial_no"],
                    setup_id=stored["setup_id"],
                    market_item_ids=[
                        m["market_item_id"] for m in stored["market_items"]
                    ],
                    has_collected_price=stored["has_collected_price"],
                    result_index=replacer["result_index"],
                    new_serial=replacer["shop_serial_no"],
                )
            )

    blocked = {d.result_index for d in displaced if d.has_collected_price}
    return _ItemPlan(matched, to_create, displaced, blocked)


async def _load_existing_items(conn, round_id: int, market_id: int) -> dict:
    """`{item_id: {shop_id: stored state}}` for a market in a round."""
    market_items: dict[tuple[int, int], list[dict]] = {}
    for row in await survey_queries.list_market_items_for_round_market(
        conn, round_id, market_id
    ):
        market_items.setdefault((row["item_id"], row["shop_id"]), []).append(row)

    existing: dict[int, dict] = {}
    for row in await survey_queries.list_setup_keys_for_round_market(
        conn, round_id, market_id
    ):
        mis = market_items.get((row["item_id"], row["shop_id"]), [])
        existing.setdefault(row["item_id"], {})[row["shop_id"]] = {
            "setup_id": row["setup_id"],
            "shop_selection_status": row["shop_selection_status"],
            "shop_serial_no": row["shop_serial_no"],
            "market_items": mis,
            # A shop holding two specifications counts as collected if either is.
            "has_collected_price": any(m["has_collected_price"] for m in mis),
        }
    return existing


async def _update_market_item(conn, stored, slot, r, *, dry_run) -> None:
    """Diff and apply the three editable market_item fields for a matched shop."""
    existing_mi, candidate_count = _resolve_market_item(stored["market_items"])
    r.id = existing_mi["market_item_id"]

    desired = {k: slot[k] for k in _MARKET_ITEM_FIELDS}
    changed, changes = diff_fields(
        existing_mi, desired, _MARKET_ITEM_FIELDS, _MARKET_ITEM_LABELS
    )
    if not changed:
        _record(r, "unchanged")
        return

    # Warn only when a write actually follows, so a clean round trip of an export
    # stays quiet even for the shops holding two specifications.
    warnings: list[str] = []
    if candidate_count > 1:
        warnings.append(
            f"{candidate_count} entries exist for this item and shop; "
            "the first was updated. Edit the others in the app."
        )
    if stored["has_collected_price"] and (
        changed.keys() & {"unit_of_sale", "product_specification"}
    ):
        warnings.append(
            "a price has already been collected against this entry; "
            "it now refers to a different unit/specification"
        )
    if warnings:
        r.warning = " ".join(warnings)

    if not dry_run:
        try:
            async with conn.transaction():
                await md_queries.update_market_item(
                    conn, existing_mi["market_item_id"], changed
                )
        except psycopg.errors.UniqueViolation:
            _fail(
                r,
                "another entry for this shop and item already uses that unit "
                "and specification",
            )
            return
        except Exception as exc:
            logger.warning("Setup update error for '%s': %s", r.identifier, exc)
            _fail(r, "Unexpected error")
            return
    _record(r, "updated", changes)


async def _apply_item_plan(
    conn, round_id: int, item_id: int, plan: _ItemPlan, results, *, dry_run: bool
) -> None:
    """Write one item's plan. Deletions go last so a failed replacement can never
    leave a slot empty."""
    for slot, stored in plan.matched:
        if slot["result_index"] in plan.blocked:
            continue
        r = results[slot["result_index"]]
        status = slot["shop_selection_status"]

        if stored["shop_selection_status"] != status:
            if not dry_run:
                try:
                    async with conn.transaction():
                        await survey_queries.update_setup(
                            conn, stored["setup_id"], {"shop_selection_status": status}
                        )
                except Exception as exc:
                    logger.warning(
                        "Setup status update failed for '%s': %s", r.identifier, exc
                    )
                    _fail(r, "Could not change the shop selection status")
                    continue
            _record(
                r,
                "updated",
                [
                    "shop_selection_status: "
                    f"'{stored['shop_selection_status']}' -> '{status}'"
                ],
            )

        if stored["market_items"]:
            await _update_market_item(conn, stored, slot, r, dry_run=dry_run)
        else:
            await _create_entry(
                conn, round_id, item_id, slot, results, dry_run=dry_run, setup=False
            )

    for slot in plan.to_create:
        if slot["result_index"] in plan.blocked:
            continue
        await _create_entry(conn, round_id, item_id, slot, results, dry_run=dry_run)

    for d in plan.displaced:
        r = results[d.result_index]
        if d.has_collected_price:
            _fail(
                r,
                f"{d.serial} already has a collected price for this item; "
                "change the shop in the app instead",
            )
            continue
        if r.status == "error":
            continue  # the replacement itself failed — leave the old shop in place
        if not dry_run:
            try:
                # One savepoint: a setup removed but its entry stranded would be
                # worse than the whole replacement not happening.
                async with conn.transaction():
                    await survey_queries.delete_setup(conn, d.setup_id)
                    for mi_id in d.market_item_ids:
                        await survey_queries.delete_uncollected_market_item(conn, mi_id)
            except Exception as exc:
                logger.warning("Could not remove shop '%s': %s", d.serial, exc)
                _fail(r, f"Could not remove the previous shop '{d.serial}'")
                continue
        _record(r, "updated", [f"shop_serial_no: '{d.serial}' -> '{d.new_serial}'"])


async def _create_entry(
    conn, round_id: int, item_id: int, slot: dict, results, *, dry_run: bool, setup=True
) -> None:
    """Create a market_item (and, unless it already exists, its setup) for a slot."""
    r = results[slot["result_index"]]
    if dry_run:
        _record(r, "created")
        return

    try:
        async with conn.transaction():
            row = await md_queries.create_market_item(
                conn, _market_item_payload(slot, item_id, slot["shop_id"], round_id)
            )
        r.id = row["market_item_id"]
        _record(r, "created")
    except psycopg.errors.UniqueViolation:
        _record(r, "duplicate")
        r.detail = f"market item '{r.identifier}' already exists"
    except Exception as exc:
        logger.warning("Setup ingestion error for '%s': %s", r.identifier, exc)
        _fail(r, "Unexpected error")
        return

    if setup:
        try:
            async with conn.transaction():
                await survey_queries.create_setup(
                    conn,
                    {
                        "item_id": item_id,
                        "shop_id": slot["shop_id"],
                        "shop_selection_status": slot["shop_selection_status"],
                        "round_id": round_id,
                    },
                )
        except psycopg.errors.UniqueViolation:
            pass  # already set up for this round


async def _ingest_upsert(
    conn,
    round_id: int,
    market_id: int,
    validation,
    item_code_to_id: dict,
    *,
    dry_run: bool,
) -> None:
    """Apply an edited sheet: update what is there, add what is missing, and swap a
    slot's shop when the sheet names a different one. Never writes shop master data
    and never touches a stored shop the sheet leaves alone."""
    shop_id_by_serial = {
        serial: row["shop_id"] for serial, row in validation.existing_shops.items()
    }
    existing_items = await _load_existing_items(conn, round_id, market_id)

    slots_by_item: dict[str, list[dict]] = {}
    for slot in validation.market_items:
        slots_by_item.setdefault(slot["item_code"], []).append(
            {**slot, "shop_id": shop_id_by_serial[slot["shop_serial_no"]]}
        )

    for item_code, slots in slots_by_item.items():
        item_id = item_code_to_id.get(item_code)
        if not item_id:
            for slot in slots:
                _fail(
                    validation.results[slot["result_index"]],
                    f"Could not resolve item_code '{item_code}'",
                )
            continue

        plan = _plan_item(
            slots,
            existing_items.get(item_id, {}),
            # One bad slot anywhere on an item holds back every deletion for it:
            # deletions are the only step that cannot be undone by re-uploading.
            allow_deletes=item_code not in validation.items_with_errors,
        )
        await _apply_item_plan(
            conn, round_id, item_id, plan, validation.results, dry_run=dry_run
        )


# ── Create: the original first-load path ───────────────────────────────────


async def _ingest_create(
    conn, round_id: int, market_id: int, validation, item_code_to_id: dict
) -> None:
    """Insert what is missing and report everything else as a duplicate. This is the
    initial data load, so it is the one path that creates shops from the sheet."""
    shop_serial_to_id: dict[str, int] = {
        serial: row["shop_id"] for serial, row in validation.existing_shops.items()
    }

    for serial, shop_data in validation.shops.items():
        try:
            async with conn.transaction():
                row = await md_queries.create_shop(
                    conn,
                    market_id,
                    {
                        "shop_serial_no": serial,
                        "shop_name": shop_data["shop_name"],
                        "shop_description_and_location": shop_data[
                            "shop_description_and_location"
                        ],
                    },
                )
            shop_serial_to_id[serial] = row["shop_id"]
        except psycopg.errors.UniqueViolation:
            cur = await conn.execute(
                "SELECT shop_id FROM cpi_tripura_market_shop WHERE market_id = %s AND shop_serial_no = %s",
                [market_id, serial],
            )
            row = await cur.fetchone()
            if row:
                shop_serial_to_id[serial] = row["shop_id"]

    for mi in validation.market_items:
        r = validation.results[mi["result_index"]]
        item_id = item_code_to_id.get(mi["item_code"])
        shop_id = shop_serial_to_id.get(mi["shop_serial_no"])

        if not item_id:
            _fail(r, f"Could not resolve item_code '{mi['item_code']}'")
            continue
        if not shop_id:
            _fail(r, f"Could not resolve shop_serial_no '{mi['shop_serial_no']}'")
            continue

        try:
            async with conn.transaction():
                row = await md_queries.create_market_item(
                    conn, _market_item_payload(mi, item_id, shop_id, round_id)
                )
            _record(r, "created")
            r.id = row["market_item_id"]
        except psycopg.errors.UniqueViolation:
            _record(r, "duplicate")
            r.detail = f"market item '{r.identifier}' already exists"
        except Exception as exc:
            _fail(r, "Unexpected error")
            logger.warning("Setup ingestion error for '%s': %s", r.identifier, exc)

    for setup in validation.shop_setups:
        item_id = item_code_to_id.get(setup["item_code"])
        shop_id = shop_serial_to_id.get(setup["shop_serial_no"])
        if not item_id or not shop_id:
            continue
        try:
            async with conn.transaction():
                await survey_queries.create_setup(
                    conn,
                    {
                        "item_id": item_id,
                        "shop_id": shop_id,
                        "shop_selection_status": setup["shop_selection_status"],
                        "round_id": round_id,
                    },
                )
        except psycopg.errors.UniqueViolation:
            pass  # Already set up for this round


async def process_setup_rows(
    conn,
    round_id: int,
    rows: list[dict],
    *,
    dry_run: bool,
    mode: str = "create",
    user: dict | None = None,
) -> list[BulkRecordResult]:
    """Validate and ingest one market's setup rows; return per-row results.

    Assumes the round has already been confirmed editable. Shared by the
    single-file and bulk endpoints. On dry_run, validation runs but nothing
    is written — in upsert mode that makes the returned per-row `changes` a
    preview of the edit.

    `mode="create"` is the first load: it creates shops, market items and setups,
    and reports anything already present as a duplicate. `mode="upsert"` edits an
    exported sheet — local name, unit, product specification and which shop fills
    each slot. It never writes shop master data, never touches a slot the sheet
    leaves blank, and only removes a shop's assignment when another shop has taken
    its slot and nothing was ever collected against it.

    Each write takes its own savepoint, so a bad row fails alone — which also means
    two concurrent uploads for one market can interleave; setups are edited by one
    district at a time in practice.
    """
    validation = await validate_market_shop_item_setup(rows, conn, mode=mode)
    results = validation.results
    market_id = validation.market_id

    # Row 1 resolved the market, so scope can finally be checked — before the dry-run
    # exit, so a supervisor cannot even preview another district's data.
    if user is not None:
        await assert_market_in_scope(conn, user, market_id)
    if mode == "upsert":
        await guards.assert_market_editable(conn, round_id, market_id)

    if dry_run and mode != "upsert":
        return results

    # Items must already exist; the validator errors on unknown codes.
    cur = await conn.execute("SELECT item_id, item_code FROM cpi_tripura_item")
    item_code_to_id: dict[str, int] = {
        r["item_code"].strip(): r["item_id"] for r in await cur.fetchall()
    }

    if mode == "upsert":
        await _ingest_upsert(
            conn, round_id, market_id, validation, item_code_to_id, dry_run=dry_run
        )
    else:
        await _ingest_create(conn, round_id, market_id, validation, item_code_to_id)

    return results


@router.post(
    "/rounds/{round_id}/market-shop-item-setup",
    response_model=BulkUploadResponse,
)
async def upload_market_shop_item_setup(
    round_id: int,
    file: UploadFile,
    dry_run: bool = False,
    mode: Mode = "create",
    user: dict = Depends(require_admin_or_supervisor),
):
    """Ingest one market's setup sheet. `mode=upsert` also applies edits to rows
    that already exist — pair it with `dry_run=true` to preview the diff first."""
    rows = await parse_upload(file)
    pool = get_pool()

    async with pool.connection() as conn:
        await guards.assert_round_editable(conn, round_id)
        results = await process_setup_rows(
            conn, round_id, rows, dry_run=dry_run, mode=mode, user=user
        )

    if not dry_run:
        _write_upload_log(
            file.filename or "unknown",
            results,
            "market_shop_item_setup",
            round_id=round_id,
            mode=mode,
        )
    return _build_response(
        "market_shop_item_setup", results, dry_run=dry_run, mode=mode
    )


# ── Bulk Market-Shop-Item Setup Upload (multiple files / zip) ───────────────


def _build_bundle_response(
    entity: str,
    file_results: list[FileUploadResult],
    dry_run: bool,
    mode: str = "create",
) -> BulkBundleResponse:
    # Grand counters sum row-level outcomes; file-level failures (bad zip,
    # parse/validate errors) are visible via each file's status="error".
    return BulkBundleResponse(
        entity=entity,
        dry_run=dry_run,
        mode=mode,
        file_count=len(file_results),
        total=sum(f.total for f in file_results),
        created=sum(f.created for f in file_results),
        updated=sum(f.updated for f in file_results),
        unchanged=sum(f.unchanged for f in file_results),
        duplicates=sum(f.duplicates for f in file_results),
        errors=sum(f.errors for f in file_results),
        warnings=sum(f.warnings for f in file_results),
        files=file_results,
    )


def _write_bulk_log(
    file_results: list[FileUploadResult], round_id: int, mode: str = "create"
) -> None:
    """Write one combined log for a bulk upload, with a section per file."""
    log_dir = Path(settings.log_dir) / "uploads"
    log_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now()
    ts = now.strftime("%Y-%m-%d_%H%M%S")
    log_path = log_dir / f"market_shop_item_setup_bulk_{ts}.log"

    lines: list[str] = [
        "Upload Log: market_shop_item_setup (bulk)",
        f"Timestamp:  {now.strftime('%Y-%m-%d %H:%M:%S')}",
        f"Round ID:   {round_id}",
        f"Mode:       {mode}",
        f"Files:      {len(file_results)}",
        "=" * 80,
        "",
    ]

    for f in file_results:
        if f.status == "error":
            lines.append(f"[FILE ERROR] {f.filename} | {f.detail}")
            continue
        lines.append(
            f"[FILE] {f.filename} | total={f.total} created={f.created} "
            f"updated={f.updated} unchanged={f.unchanged} "
            f"duplicates={f.duplicates} errors={f.errors} warnings={f.warnings}"
        )
        for r in f.results:
            lines += _result_lines(r, indent="    ")

    log_path.write_text("\n".join(lines) + "\n")


async def _process_bulk_member(
    pool,
    round_id: int,
    name: str,
    content: bytes,
    *,
    dry_run: bool,
    mode: str = "create",
    user: dict | None = None,
) -> FileUploadResult:
    """Parse + ingest one spreadsheet payload on its own connection.

    A fresh connection per file isolates DB/transaction state, so one file's
    failure cannot poison the next. A file for a market outside the caller's
    district raises out of `process_setup_rows` and lands here as this file's
    own error, leaving the rest of the bundle to proceed.
    """
    try:
        rows = parse_content(name, content)
    except HTTPException as exc:
        return FileUploadResult(filename=name, status="error", detail=str(exc.detail))

    try:
        async with pool.connection() as conn:
            results = await process_setup_rows(
                conn, round_id, rows, dry_run=dry_run, mode=mode, user=user
            )
    except HTTPException as exc:
        return FileUploadResult(filename=name, status="error", detail=str(exc.detail))
    except Exception:
        logger.exception("Bulk setup ingest failed for '%s'", name)
        return FileUploadResult(
            filename=name, status="error", detail="Unexpected error"
        )

    return FileUploadResult(
        filename=name,
        status="processed",
        total=len(results),
        **_count_results(results),
        results=results,
    )


@router.post(
    "/rounds/{round_id}/market-shop-item-setup/bulk",
    response_model=BulkBundleResponse,
)
async def upload_market_shop_item_setup_bulk(
    round_id: int,
    files: list[UploadFile],
    dry_run: bool = False,
    mode: Mode = "create",
    user: dict = Depends(require_admin_or_supervisor),
):
    """Ingest many markets' setups at once from multiple files and/or zips.

    Each file (or zip member) is one market. Files are processed independently:
    one failing (bad zip, parse error, unknown market, another district's market)
    is reported in its own slot and does not abort the rest. `mode=upsert` applies
    edits to existing rows as well; it pairs with the round export, which returns
    exactly this bundle shape as a zip.
    """
    pool = get_pool()

    # Confirm the round is editable once before processing any file.
    async with pool.connection() as conn:
        await guards.assert_round_editable(conn, round_id)

    file_results: list[FileUploadResult] = []
    produced = 0

    for upload in files:
        fname = upload.filename or "unnamed"
        try:
            members = await expand_file(upload)
        except HTTPException as exc:
            file_results.append(
                FileUploadResult(filename=fname, status="error", detail=str(exc.detail))
            )
            continue
        except Exception:
            logger.exception("Failed to expand bulk upload '%s'", fname)
            file_results.append(
                FileUploadResult(
                    filename=fname, status="error", detail="Failed to read file"
                )
            )
            continue

        produced += len(members)
        if produced > settings.max_bulk_files:
            raise HTTPException(
                400, f"Too many files in request (max {settings.max_bulk_files})"
            )

        for mname, content in members:
            file_results.append(
                await _process_bulk_member(
                    pool,
                    round_id,
                    mname,
                    content,
                    dry_run=dry_run,
                    mode=mode,
                    user=user,
                )
            )

    if not dry_run:
        _write_bulk_log(file_results, round_id, mode)

    return _build_bundle_response("market_shop_item_setup", file_results, dry_run, mode)
