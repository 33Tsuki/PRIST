from enum import StrEnum

from fastapi import HTTPException
from psycopg import AsyncConnection
from pydantic import ValidationError

from app.common.models import CpiDomain
from app.master_data.ingestion.models import BulkRecordResult
from app.master_data.models import ItemCreate, MarketCreate, ShopCreate


def _enum_lookup(enum_cls: type[StrEnum]) -> dict[str, str]:
    """Build a case-insensitive lookup: lowered value → canonical value."""
    return {member.value.lower(): member.value for member in enum_cls}


_DOMAIN_LOOKUP = _enum_lookup(CpiDomain)

# ── Market Header Remapping ────────────────────────────────────────────────

_MARKET_HEADER_MAP: dict[str, str] = {
    "vill/town_mmdc": "vill_town_mmdc",
    "village/town": "village_town",
    "selected market": "selected_market",
    "market code": "market_code",
    "district code": "district_code",
    "sub-division name": "subdivision",
    "sub-division lgd code": "subdivision_lgd_code",
    "market day": "market_day",
    "market time": "market_time",
    "block/ulb name": "block_ulb_name",
    "block lgd code/city code": "block_lgd_code",
    "name of dso office": "dso_office",
}


def remap_market_headers(rows: list[dict[str, str]]) -> None:
    """Rename Excel header keys to internal field names, in-place."""
    for row in rows:
        for old_key, new_key in _MARKET_HEADER_MAP.items():
            if old_key in row:
                row[new_key] = row.pop(old_key)


# ── Column Definitions (for templates) ──────────────────────────────────────

ITEM_COLUMNS = [
    {"name": "item_code", "required": True, "example": "0101"},
    {"name": "item_name", "required": True, "example": "Rice"},
    {"name": "notes", "required": False, "example": ""},
]

MARKET_COLUMNS = [
    {
        "name": "domain",
        "required": True,
        "example": "Rural Non Tribal|Rural Tribal|Urban",
    },
    {"name": "district", "required": True, "example": "West Tripura"},
    {"name": "selected_market", "required": True, "example": "Agartala Main Market"},
    {"name": "market_code", "required": True, "example": "RN0101"},
    # {"name": "des_corrected", "required": False, "example": ""},
    {"name": "district_code", "required": False, "example": "08"},
    {"name": "vill_town_mmdc", "required": False, "example": "123456"},
    {"name": "tehsil", "required": False, "example": "Sadar"},
    {"name": "teh_mmdc", "required": False, "example": "01931"},
    {"name": "subdivision", "required": False, "example": "Sadar"},
    {"name": "subdivision_lgd_code", "required": False, "example": "6696"},
    {"name": "market_day", "required": False, "example": "Sunday/ Thursday"},
    {"name": "market_time", "required": False, "example": "Morning to Afternoon"},
    {"name": "block_ulb_name", "required": False, "example": "Dukli"},
    {"name": "block_lgd_code", "required": False, "example": "2438"},
    {"name": "dso_office", "required": False, "example": "DSO West"},
    {"name": "village_town", "required": False, "example": ""},
    {"name": "address", "required": False, "example": ""},
    {"name": "notes", "required": False, "example": ""},
]

SHOP_DIRECT_COLUMNS = [
    {"name": "market_code", "required": True, "example": "RN0101"},
    {"name": "shop_serial_no", "required": True, "example": "1A"},
    {"name": "shop_name", "required": True, "example": "ABC General Store"},
    {
        "name": "shop_description_and_location",
        "required": True,
        "example": "Near main road",
    },
    {
        "name": "general_description_of_items_sold",
        "required": True,
        "example": "Groceries",
    },
    {"name": "shop_phone_number", "required": False, "example": "9876543210"},
    {"name": "notes", "required": False, "example": ""},
]

SHOP_COLUMNS = [
    {"name": "shop_serial_no", "required": True, "example": "1A"},
    {"name": "shop_name", "required": True, "example": "ABC General Store"},
    {
        "name": "shop_description_and_location",
        "required": True,
        "example": "Near main road",
    },
    {
        "name": "general_description_of_items_sold",
        "required": True,
        "example": "Groceries",
    },
    {"name": "shop_phone_number", "required": False, "example": "9876543210"},
    {"name": "notes", "required": False, "example": ""},
]


def _normalize_enum(data: dict, field: str, lookup: dict[str, str]) -> None:
    """Normalize an enum field in-place to its canonical case, if present."""
    val = data.get(field)
    if val and isinstance(val, str):
        canonical = lookup.get(val.strip().lower())
        if canonical:
            data[field] = canonical


def _check_required_columns(
    rows: list[dict[str, str]],
    columns: list[dict],
) -> None:
    """Raise HTTP 400 if any required column is missing from the file headers."""
    required = {c["name"] for c in columns if c["required"]}
    present = set(rows[0].keys())
    missing = required - present
    if missing:
        raise HTTPException(
            400,
            f"Missing required columns: {', '.join(sorted(missing))}",
        )


def _format_validation_error(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors():
        field = ".".join(str(loc) for loc in err["loc"])
        parts.append(f"{field}: {err['msg']}")
    return "; ".join(parts)


# ── Item Validation ─────────────────────────────────────────────────────────


def validate_items(rows: list[dict[str, str]]) -> list[BulkRecordResult]:
    _check_required_columns(rows, ITEM_COLUMNS)
    results: list[BulkRecordResult] = []
    seen_codes: dict[str, int] = {}

    for i, raw in enumerate(rows, start=2):  # row 1 is header
        code = raw.get("item_code", "").strip()
        data = {
            k: v
            for k, v in raw.items()
            if k in {"item_code", "item_name", "notes"} and v
        }

        try:
            model = ItemCreate(**data)
        except ValidationError as exc:
            results.append(
                BulkRecordResult(
                    row=i,
                    status="error",
                    identifier=code or None,
                    detail=_format_validation_error(exc),
                )
            )
            continue

        if model.item_code in seen_codes:
            results.append(
                BulkRecordResult(
                    row=i,
                    status="error",
                    identifier=model.item_code,
                    detail=f"Duplicate item_code '{model.item_code}' in file (first seen at row {seen_codes[model.item_code]})",
                )
            )
            continue

        seen_codes[model.item_code] = i
        results.append(
            BulkRecordResult(
                row=i,
                status="skipped",
                identifier=model.item_code,
            )
        )

    return results


# ── Market Validation ───────────────────────────────────────────────────────


async def validate_markets(
    rows: list[dict[str, str]],
    conn: AsyncConnection,
) -> list[BulkRecordResult]:
    _check_required_columns(rows, MARKET_COLUMNS)

    # Build tehsil lookup maps: name → id and teh_mmdc → id
    cur = await conn.execute(
        "SELECT tehsil_id, name, teh_mmdc FROM cpi_tripura_tehsil",
    )
    tehsil_rows = await cur.fetchall()
    tehsil_by_name: dict[str, int] = {
        r["name"].strip().lower(): r["tehsil_id"] for r in tehsil_rows
    }
    tehsil_by_code: dict[str, int] = {
        r["teh_mmdc"].strip(): r["tehsil_id"] for r in tehsil_rows if r["teh_mmdc"]
    }

    # Build subdivision lookup maps: name → id and lgd_code → id
    cur = await conn.execute(
        "SELECT subdivision_id, name, lgd_code FROM cpi_tripura_subdivision",
    )
    subdivision_rows = await cur.fetchall()
    subdivision_by_name: dict[str, int] = {
        r["name"].strip().lower(): r["subdivision_id"] for r in subdivision_rows
    }
    subdivision_by_code: dict[str, int] = {
        str(r["lgd_code"]): r["subdivision_id"] for r in subdivision_rows
    }

    # Build district lookup maps: name → id and code → id
    cur = await conn.execute(
        "SELECT district_id, name, code FROM cpi_tripura_district",
    )
    district_rows = await cur.fetchall()
    district_by_name: dict[str, int] = {
        r["name"].strip().lower(): r["district_id"] for r in district_rows
    }
    district_by_code: dict[str, int] = {
        r["code"]: r["district_id"] for r in district_rows
    }

    results: list[BulkRecordResult] = []
    seen_codes: dict[str, int] = {}

    for i, raw in enumerate(rows, start=2):
        code = raw.get("market_code", "").strip()

        # Resolve tehsil: try name first, then teh_mmdc code
        tehsil_name = raw.get("tehsil", "").strip()
        teh_mmdc = raw.get("teh_mmdc", "").strip()

        # Treat "NA" (case-insensitive) as blank
        if tehsil_name.upper() == "NA":
            tehsil_name = ""
        if teh_mmdc.upper() == "NA":
            teh_mmdc = ""

        # Resolve subdivision: try name first, then LGD code
        subdivision_name = raw.get("subdivision", "").strip()
        subdivision_lgd = raw.get("subdivision_lgd_code", "").strip()
        if subdivision_name.upper() == "NA":
            subdivision_name = ""
        if subdivision_lgd.upper() == "NA":
            subdivision_lgd = ""

        # Resolve district: prefer name, fall back to code
        district_name = raw.get("district", "").strip()
        district_code = (
            raw.get("district_code", "").strip().zfill(2)
            if raw.get("district_code")
            else ""
        )
        did = district_by_name.get(district_name.lower()) if district_name else None
        if did is None and district_code:
            did = district_by_code.get(district_code)
        if did is None:
            label = district_name or district_code or "(missing)"
            results.append(
                BulkRecordResult(
                    row=i,
                    status="error",
                    identifier=code or None,
                    detail=f"district '{label}' not found in database",
                )
            )
            continue

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
        data["district_id"] = did

        # Normalize enum fields to canonical case
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
            data["block_lgd_code"] = str(data["block_lgd_code"]).removesuffix(".0")
        if subdivision_lgd:
            subdivision_lgd = subdivision_lgd.removesuffix(".0")

        tehsil_warning = None
        if tehsil_name or teh_mmdc:
            tid = tehsil_by_name.get(tehsil_name.lower()) if tehsil_name else None
            if tid is None and teh_mmdc:
                tid = tehsil_by_code.get(teh_mmdc)
            if tid is None:
                label = tehsil_name or teh_mmdc
                tehsil_warning = f"tehsil '{label}' not found in database; market will be added without tehsil"
            else:
                data["tehsil_id"] = tid

        subdivision_warning = None
        if subdivision_name or subdivision_lgd:
            sid = (
                subdivision_by_name.get(subdivision_name.lower())
                if subdivision_name
                else None
            )
            if sid is None and subdivision_lgd:
                sid = subdivision_by_code.get(subdivision_lgd)
            if sid is None:
                label = subdivision_name or subdivision_lgd
                subdivision_warning = f"subdivision '{label}' not found in database; market will be added without subdivision"
            else:
                data["subdivision_id"] = sid

        try:
            model = MarketCreate(**data)
        except ValidationError as exc:
            results.append(
                BulkRecordResult(
                    row=i,
                    status="error",
                    identifier=code or None,
                    detail=_format_validation_error(exc),
                )
            )
            continue

        if model.market_code in seen_codes:
            results.append(
                BulkRecordResult(
                    row=i,
                    status="error",
                    identifier=model.market_code,
                    detail=f"Duplicate market_code '{model.market_code}' in file (first seen at row {seen_codes[model.market_code]})",
                )
            )
            continue

        seen_codes[model.market_code] = i
        warnings = [w for w in (tehsil_warning, subdivision_warning) if w]
        results.append(
            BulkRecordResult(
                row=i,
                status="skipped",
                identifier=model.market_code,
                warning="; ".join(warnings) or None,
            )
        )

    return results


# ── Shop Validation ─────────────────────────────────────────────────────────


def validate_shops(rows: list[dict[str, str]]) -> list[BulkRecordResult]:
    _check_required_columns(rows, SHOP_COLUMNS)

    results: list[BulkRecordResult] = []
    seen_serials: dict[str, int] = {}  # shop_serial_no → row

    for i, raw in enumerate(rows, start=2):
        serial = raw.get("shop_serial_no", "").strip()

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
            model = ShopCreate(**data)
        except ValidationError as exc:
            results.append(
                BulkRecordResult(
                    row=i,
                    status="error",
                    identifier=serial or None,
                    detail=_format_validation_error(exc),
                )
            )
            continue

        if model.shop_serial_no in seen_serials:
            results.append(
                BulkRecordResult(
                    row=i,
                    status="error",
                    identifier=model.shop_serial_no,
                    detail=f"Duplicate shop_serial_no '{model.shop_serial_no}' in file (first seen at row {seen_serials[model.shop_serial_no]})",
                )
            )
            continue

        seen_serials[model.shop_serial_no] = i
        results.append(
            BulkRecordResult(
                row=i,
                status="skipped",
                identifier=model.shop_serial_no,
                warning=None,
            )
        )

    return results


# ── Direct Shop Validation (with market_code lookup) ──────────────────────


async def validate_shops_direct(
    rows: list[dict[str, str]],
    conn: AsyncConnection,
) -> list[BulkRecordResult]:
    _check_required_columns(rows, SHOP_DIRECT_COLUMNS)

    # Build market_code → market_id lookup
    cur = await conn.execute(
        "SELECT market_id, market_code FROM cpi_tripura_market",
    )
    market_rows = await cur.fetchall()
    market_by_code: dict[str, int] = {
        r["market_code"]: r["market_id"] for r in market_rows
    }

    results: list[BulkRecordResult] = []
    seen_keys: dict[tuple[str, str], int] = {}  # (market_code, shop_serial_no) → row

    for i, raw in enumerate(rows, start=2):
        market_code = raw.get("market_code", "").strip().upper()
        serial = raw.get("shop_serial_no", "").strip()
        identifier = (
            f"{market_code}/{serial}"
            if market_code and serial
            else serial or market_code or None
        )

        # Resolve market_id from market_code
        resolved_market_id = market_by_code.get(market_code)
        if not resolved_market_id:
            results.append(
                BulkRecordResult(
                    row=i,
                    status="error",
                    identifier=identifier,
                    detail=f"market_code '{market_code}' not found in database",
                )
            )
            continue

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
            model = ShopCreate(**data)
        except ValidationError as exc:
            results.append(
                BulkRecordResult(
                    row=i,
                    status="error",
                    identifier=identifier,
                    detail=_format_validation_error(exc),
                )
            )
            continue

        dedup_key = (market_code, model.shop_serial_no)
        if dedup_key in seen_keys:
            results.append(
                BulkRecordResult(
                    row=i,
                    status="error",
                    identifier=identifier,
                    detail=f"Duplicate (market_code, shop_serial_no) '{market_code}/{model.shop_serial_no}' in file (first seen at row {seen_keys[dedup_key]})",
                )
            )
            continue

        seen_keys[dedup_key] = i
        results.append(
            BulkRecordResult(
                row=i,
                status="skipped",
                identifier=identifier,
                warning=None,
                market_id=resolved_market_id,
            )
        )

    return results
