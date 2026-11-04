import psycopg
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.auth.dependencies import require_admin
from app.database import get_pool
from app.logger import logger
from app.master_data import queries
from app.master_data.ingestion.models import BulkRecordResult, BulkUploadResponse
from app.master_data.ingestion.parser import generate_template_xlsx, parse_upload
from app.master_data.ingestion.validators import (
    _DOMAIN_LOOKUP,
    ITEM_COLUMNS,
    MARKET_COLUMNS,
    SHOP_COLUMNS,
    SHOP_DIRECT_COLUMNS,
    _normalize_enum,
    remap_market_headers,
    validate_items,
    validate_markets,
    validate_shops,
    validate_shops_direct,
)

router = APIRouter(
    prefix="/master-data/ingestion",
    tags=["Master Data Ingestion"],
)


# ── Template Downloads ──────────────────────────────────────────────────────


XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx_response(content: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        iter([content]),
        media_type=XLSX_MEDIA,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/templates/items")
async def download_items_template(_admin: dict = Depends(require_admin)):
    return _xlsx_response(generate_template_xlsx(ITEM_COLUMNS), "items_template.xlsx")


@router.get("/templates/markets")
async def download_markets_template(_admin: dict = Depends(require_admin)):
    return _xlsx_response(
        generate_template_xlsx(MARKET_COLUMNS),
        "markets_template.xlsx",
    )


@router.get("/templates/shops")
async def download_shops_template(_admin: dict = Depends(require_admin)):
    return _xlsx_response(generate_template_xlsx(SHOP_COLUMNS), "shops_template.xlsx")


@router.get("/templates/shops-direct")
async def download_shops_direct_template(_admin: dict = Depends(require_admin)):
    return _xlsx_response(
        generate_template_xlsx(SHOP_DIRECT_COLUMNS),
        "shops_direct_template.xlsx",
    )


# ── Upload Helpers ──────────────────────────────────────────────────────────


def _build_response(
    entity: str,
    results: list[BulkRecordResult],
    dry_run: bool,
) -> BulkUploadResponse:
    return BulkUploadResponse(
        entity=entity,
        total=len(results),
        created=sum(1 for r in results if r.status == "created"),
        duplicates=sum(1 for r in results if r.status == "duplicate"),
        errors=sum(1 for r in results if r.status == "error"),
        warnings=sum(1 for r in results if r.warning),
        dry_run=dry_run,
        results=results,
    )


# ── Item Upload ─────────────────────────────────────────────────────────────


@router.post("/items", response_model=BulkUploadResponse)
async def upload_items(
    file: UploadFile,
    dry_run: bool = False,
    _admin: dict = Depends(require_admin),
):
    rows = await parse_upload(file)
    results = validate_items(rows)

    if dry_run:
        return _build_response("item", results, dry_run=True)

    pool = get_pool()
    async with pool.connection() as conn:
        for r in results:
            if r.status != "skipped":
                continue
            raw = rows[
                r.row - 2
            ]  # row is 1-indexed, rows list is 0-indexed, header is row 1
            data = {
                k: v
                for k, v in raw.items()
                if k in {"item_code", "item_name", "notes"} and v
            }
            try:
                async with conn.transaction():
                    row = await queries.create_item(conn, data)
                r.status = "created"
                r.id = row["item_id"]
            except psycopg.errors.UniqueViolation:
                r.status = "duplicate"
                r.detail = f"item_code '{r.identifier}' already exists in database"
            except Exception as exc:
                r.status = "error"
                logger.warning("Ingestion error for '%s': %s", r.identifier, exc)
                r.detail = "Unexpected error"

    return _build_response("item", results, dry_run=False)


# ── Market Upload ───────────────────────────────────────────────────────────


@router.post("/markets", response_model=BulkUploadResponse)
async def upload_markets(
    file: UploadFile,
    dry_run: bool = False,
    _admin: dict = Depends(require_admin),
):
    rows = await parse_upload(file)
    remap_market_headers(rows)
    pool = get_pool()

    async with pool.connection() as conn:
        results = await validate_markets(rows, conn)

        if dry_run:
            return _build_response("market", results, dry_run=True)

        # Build tehsil + district lookup maps for insert phase
        cur = await conn.execute(
            "SELECT tehsil_id, name, teh_mmdc FROM cpi_tripura_tehsil",
        )
        tehsil_rows = await cur.fetchall()
        tehsil_by_name = {
            r["name"].strip().lower(): r["tehsil_id"] for r in tehsil_rows
        }
        tehsil_by_code = {
            r["teh_mmdc"].strip(): r["tehsil_id"] for r in tehsil_rows if r["teh_mmdc"]
        }

        cur = await conn.execute(
            "SELECT subdivision_id, name, lgd_code FROM cpi_tripura_subdivision",
        )
        subdivision_rows = await cur.fetchall()
        subdivision_by_name = {
            r["name"].strip().lower(): r["subdivision_id"] for r in subdivision_rows
        }
        subdivision_by_code = {
            str(r["lgd_code"]): r["subdivision_id"] for r in subdivision_rows
        }

        cur = await conn.execute(
            "SELECT district_id, name, code FROM cpi_tripura_district",
        )
        district_rows = await cur.fetchall()
        district_by_name = {
            r["name"].strip().lower(): r["district_id"] for r in district_rows
        }
        district_by_code = {r["code"]: r["district_id"] for r in district_rows}

        for r in results:
            if r.status != "skipped":
                continue
            raw = rows[r.row - 2]

            tehsil_name = raw.get("tehsil", "").strip()
            teh_mmdc = raw.get("teh_mmdc", "").strip()
            if tehsil_name.upper() == "NA":
                tehsil_name = ""
            if teh_mmdc.upper() == "NA":
                teh_mmdc = ""

            subdivision_name = raw.get("subdivision", "").strip()
            subdivision_lgd = raw.get("subdivision_lgd_code", "").strip()
            if subdivision_name.upper() == "NA":
                subdivision_name = ""
            if subdivision_lgd.upper() == "NA":
                subdivision_lgd = ""

            district_name = raw.get("district", "").strip()
            district_code = (
                raw.get("district_code", "").strip().zfill(2)
                if raw.get("district_code")
                else ""
            )
            did = district_by_name.get(district_name.lower()) if district_name else None
            if did is None and district_code:
                did = district_by_code.get(district_code)

            data: dict = {
                k: v
                for k, v in raw.items()
                if k
                in {
                    "domain",
                    "vill_town_mmdc",
                    "village_town",
                    "selected_market",
                    "market_code",
                    "market_day",
                    "market_time",
                    "block_ulb_name",
                    "block_lgd_code",
                    "dso_office",
                    "address",
                    "notes",
                }
                and v
            }
            if did is not None:
                data["district_id"] = did
            _normalize_enum(data, "domain", _DOMAIN_LOOKUP)
            # Zero-pad numeric code fields
            if teh_mmdc:
                teh_mmdc = teh_mmdc.zfill(5)
            if "vill_town_mmdc" in data:
                data["vill_town_mmdc"] = str(data["vill_town_mmdc"]).strip().zfill(6)
            if "market_code" in data:
                data["market_code"] = str(data["market_code"]).strip().upper()
            # xlsx integer cells stringify as e.g. '2438.0' — strip the float suffix
            if "block_lgd_code" in data:
                data["block_lgd_code"] = int(
                    str(data["block_lgd_code"]).removesuffix(".0")
                )
            if tehsil_name or teh_mmdc:
                tid = tehsil_by_name.get(tehsil_name.lower()) if tehsil_name else None
                if tid is None and teh_mmdc:
                    tid = tehsil_by_code.get(teh_mmdc)
                if tid:
                    data["tehsil_id"] = tid
            if subdivision_name or subdivision_lgd:
                subdivision_lgd = subdivision_lgd.removesuffix(".0")
                sid = (
                    subdivision_by_name.get(subdivision_name.lower())
                    if subdivision_name
                    else None
                )
                if sid is None and subdivision_lgd:
                    sid = subdivision_by_code.get(subdivision_lgd)
                if sid:
                    data["subdivision_id"] = sid

            try:
                async with conn.transaction():
                    row = await queries.create_market(conn, data)
                r.status = "created"
                r.id = row["market_id"]
            except psycopg.errors.UniqueViolation:
                r.status = "duplicate"
                r.detail = f"market_code '{r.identifier}' already exists in database"
            except Exception as exc:
                r.status = "error"
                logger.warning("Ingestion error for '%s': %s", r.identifier, exc)
                r.detail = "Unexpected error"

    return _build_response("market", results, dry_run=False)


# ── Shop Upload ─────────────────────────────────────────────────────────────


@router.post("/markets/{market_id}/shops", response_model=BulkUploadResponse)
async def upload_shops(
    market_id: int,
    file: UploadFile,
    dry_run: bool = False,
    _admin: dict = Depends(require_admin),
):
    pool = get_pool()

    async with pool.connection() as conn:
        market = await queries.get_market(conn, market_id)
        if not market:
            raise HTTPException(404, f"Market {market_id} not found")

        rows = await parse_upload(file)
        results = validate_shops(rows)

        if dry_run:
            return _build_response("shop", results, dry_run=True)

        for r in results:
            if r.status != "skipped":
                continue
            raw = rows[r.row - 2]

            data: dict = {
                k: v
                for k, v in raw.items()
                if k
                in {
                    "shop_serial_no",
                    "shop_name",
                    "shop_phone_number",
                    "shop_description_and_location",
                    "general_description_of_items_sold",
                    "notes",
                }
                and v
            }

            try:
                async with conn.transaction():
                    row = await queries.create_shop(conn, market_id, data)
                r.status = "created"
                r.id = row["shop_id"]
            except psycopg.errors.UniqueViolation:
                r.status = "duplicate"
                r.detail = f"shop_serial_no '{r.identifier}' already exists for this market in database"
            except Exception as exc:
                r.status = "error"
                logger.warning("Ingestion error for '%s': %s", r.identifier, exc)
                r.detail = "Unexpected error"

    return _build_response("shop", results, dry_run=False)


# ── Direct Shop Upload (with market_code) ─────────────────────────────────


@router.post("/shops", response_model=BulkUploadResponse)
async def upload_shops_direct(
    file: UploadFile,
    dry_run: bool = False,
    _admin: dict = Depends(require_admin),
):
    rows = await parse_upload(file)
    pool = get_pool()

    async with pool.connection() as conn:
        results = await validate_shops_direct(rows, conn)

        if dry_run:
            return _build_response("shop", results, dry_run=True)

        for r in results:
            if r.status != "skipped":
                continue
            raw = rows[r.row - 2]

            data: dict = {
                k: v
                for k, v in raw.items()
                if k
                in {
                    "shop_serial_no",
                    "shop_name",
                    "shop_phone_number",
                    "shop_description_and_location",
                    "general_description_of_items_sold",
                    "notes",
                }
                and v
            }

            try:
                async with conn.transaction():
                    row = await queries.create_shop(conn, r.market_id, data)
                r.status = "created"
                r.id = row["shop_id"]
            except psycopg.errors.UniqueViolation:
                r.status = "duplicate"
                r.detail = f"shop_serial_no '{r.identifier}' already exists for this market in database"
            except Exception as exc:
                r.status = "error"
                logger.warning("Ingestion error for '%s': %s", r.identifier, exc)
                r.detail = "Unexpected error"

    return _build_response("shop", results, dry_run=False)
