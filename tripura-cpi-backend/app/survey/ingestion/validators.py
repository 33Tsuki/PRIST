import re
from dataclasses import dataclass

from fastapi import HTTPException
from psycopg import AsyncConnection

from app.master_data.ingestion.models import BulkRecordResult


def _canon(s: str) -> str:
    """Canonicalize a header for format-agnostic matching.

    Collapses case, spaces, underscores, and hyphens so that "Market Code",
    "market_code", "market-code", and "marketcode" all map to "marketcode".
    """
    return re.sub(r"[^a-z0-9]", "", s.lower())


# `role` drives how a column's header is styled and what the Instructions tab says
# about it. IDENTITY columns are the natural key of a row — the sheet is edited by
# hand, so it has to be obvious that changing one adds an entry rather than renaming
# one. IGNORED columns are printed for readability and never read back when editing:
# a shop's name and location are master data owned by the shops upload, so a setup
# sheet shows them but must not be able to rewrite them. Everything else is editable,
# which is the default when `role` is absent (the master-data column lists have none,
# so their templates are unaffected).
ROLE_IDENTITY = "identity"
ROLE_IGNORED = "ignored"

MARKET_SHOP_ITEM_SETUP_COLUMNS = [
    {
        "name": "district name",
        "required": False,
        "example": "West Tripura",
        "role": ROLE_IGNORED,
    },
    {"name": "district code", "required": False, "example": "08", "role": ROLE_IGNORED},
    {
        "name": "market name",
        "required": False,
        "example": "Agartala Main Market",
        "role": ROLE_IGNORED,
    },
    {
        "name": "market code",
        "required": True,
        "example": "RNT001",
        "role": ROLE_IDENTITY,
    },
    {"name": "itemcode", "required": True, "example": "0101", "role": ROLE_IDENTITY},
    # The master item name, owned by the items upload. Printed so a human can tell
    # the rows apart without decoding item codes; never read back.
    {"name": "item name", "required": False, "example": "Rice", "role": ROLE_IGNORED},
    # The locally reported name -> CPI_TRIPURA_MARKET_ITEM.market_item_description.
    # `required` is a header check, not a cell check: the column must be present (a
    # sheet predating the rename carries `itemname` instead, and silently clearing
    # every local name would be worse than rejecting the file), but a blank cell is
    # legitimate — the DB column is nullable and an item may have no local name.
    {"name": "local name", "required": True, "example": "Binni Chaul"},
    {
        "name": "shopnameoriginal",
        "required": True,
        "example": "ABC General Store",
        "role": ROLE_IGNORED,
    },
    {"name": "shopcodeoriginal", "required": True, "example": "1A"},
    {
        "name": "shopdescriptionandlocationoriginal",
        "required": True,
        "example": "Near main road",
        "role": ROLE_IGNORED,
    },
    {
        "name": "productspecificationoriginal",
        "required": False,
        "example": "Basmati 25kg",
    },
    {"name": "unit", "required": True, "example": "Kg"},
    {
        "name": "substitute1",
        "required": False,
        "example": "XYZ Store",
        "role": ROLE_IGNORED,
    },
    {"name": "substitute1shopcode", "required": False, "example": "2A"},
    {
        "name": "substitute1shopdescriptionandlocation",
        "required": False,
        "example": "Near bus stand",
        "role": ROLE_IGNORED,
    },
    {
        "name": "productspecificationsubstitute1",
        "required": False,
        "example": "Basmati 25kg",
    },
    {
        "name": "substitute2",
        "required": False,
        "example": "PQR Store",
        "role": ROLE_IGNORED,
    },
    {"name": "substitute2shopcode", "required": False, "example": "3A"},
    {
        "name": "substitute2shopdescriptionandlocation",
        "required": False,
        "example": "Market area",
        "role": ROLE_IGNORED,
    },
    {
        "name": "productspecificationsubstitute2",
        "required": False,
        "example": "Basmati 25kg",
    },
]

NOT_SELECTED = "NOT SELECTED"

MARKET_SHOP_ITEM_SETUP_SLOTS = [
    {
        "shop_name_col": "shopnameoriginal",
        "shop_code_col": "shopcodeoriginal",
        "shop_desc_col": "shopdescriptionandlocationoriginal",
        "prod_spec_col": "productspecificationoriginal",
        "status": "ORIGINALLY SELECTED",
    },
    {
        "shop_name_col": "substitute1",
        "shop_code_col": "substitute1shopcode",
        "shop_desc_col": "substitute1shopdescriptionandlocation",
        "prod_spec_col": "productspecificationsubstitute1",
        "status": "SUBSTITUTE 1",
    },
    {
        "shop_name_col": "substitute2",
        "shop_code_col": "substitute2shopcode",
        "shop_desc_col": "substitute2shopdescriptionandlocation",
        "prod_spec_col": "productspecificationsubstitute2",
        "status": "SUBSTITUTE 2",
    },
]


@dataclass
class MarketShopItemSetupValidation:
    market_id: int
    shops: (
        dict  # shop_serial_no -> {"shop_serial_no", "shop_name", ...}; create mode only
    )
    market_items: list  # each: {"item_code", "shop_serial_no", "shop_selection_status", "unit_of_sale", "product_specification", "market_item_description", "result_index"}
    shop_setups: list  # unique dicts: {"item_code", "shop_serial_no", "shop_selection_status", "result_index"}
    results: list[BulkRecordResult]
    existing_shops: dict  # shop_serial_no -> DB row
    items_with_errors: set  # item codes with at least one bad slot anywhere in the file


async def validate_market_shop_item_setup(
    rows: list[dict[str, str]],
    conn: AsyncConnection,
    *,
    mode: str = "create",
) -> MarketShopItemSetupValidation:
    # Match headers in a format-agnostic way (case/space/underscore-insensitive)
    crows = [{_canon(k): v for k, v in r.items()} for r in rows]

    required = {
        _canon(c["name"]) for c in MARKET_SHOP_ITEM_SETUP_COLUMNS if c["required"]
    }
    missing = required - set(crows[0].keys())
    if missing:
        # Report the header as it is printed in the sheet, not its canonical form —
        # someone holding a stale file needs to know which cell to add.
        names = {_canon(c["name"]): c["name"] for c in MARKET_SHOP_ITEM_SETUP_COLUMNS}
        raise HTTPException(
            400,
            f"Missing required columns: "
            f"{', '.join(sorted(names.get(m, m) for m in missing))}",
        )

    # Look up market by market code from first row
    market_code = crows[0].get(_canon("market code"), "").strip().upper()
    if not market_code:
        raise HTTPException(400, "market code is required in the first row")

    # One file is one market. Only row 1 decides which, so a single edited cell would
    # otherwise retarget the whole file silently and turn every row into a creation.
    # Blanks are fine — a hand-made file may fill the code on the first row only.
    other_codes = {
        code
        for crow in crows[1:]
        if (code := crow.get(_canon("market code"), "").strip().upper())
        and code != market_code
    }
    if other_codes:
        raise HTTPException(
            400,
            f"Rows name more than one market code: "
            f"{', '.join(sorted([market_code, *other_codes]))}. "
            "Each file must cover a single market.",
        )

    cur = await conn.execute(
        "SELECT market_id FROM cpi_tripura_market WHERE market_code = %s",
        [market_code],
    )
    market_row = await cur.fetchone()
    if not market_row:
        raise HTTPException(404, f"Market with code '{market_code}' not found")
    market_id = market_row["market_id"]

    # Build existing lookup sets
    cur = await conn.execute("SELECT item_code FROM cpi_tripura_item")
    existing_items: set[str] = {r["item_code"].strip() for r in await cur.fetchall()}

    cur = await conn.execute(
        """
        SELECT shop_id, shop_serial_no, shop_name, shop_description_and_location
        FROM cpi_tripura_market_shop WHERE market_id = %s
        """,
        [market_id],
    )
    existing_shops: dict[str, dict] = {
        r["shop_serial_no"]: r for r in await cur.fetchall()
    }

    upsert = mode == "upsert"

    results: list[BulkRecordResult] = []
    shops: dict[str, dict] = {}
    market_items: list[dict] = []
    shop_setups: list[dict] = []
    seen_setups: set[tuple[str, str]] = set()  # (item_code, shop_serial_no)
    items_with_errors: set[str] = set()

    for i, crow in enumerate(crows, start=2):
        item_code = crow.get("itemcode", "").strip()
        local_name = crow.get(_canon("local name"), "").strip()
        unit = crow.get("unit", "").strip()

        for slot in MARKET_SHOP_ITEM_SETUP_SLOTS:
            shop_code = crow.get(slot["shop_code_col"], "").strip().upper()
            shop_name = crow.get(slot["shop_name_col"], "").strip()
            shop_desc = crow.get(slot["shop_desc_col"], "").strip()
            prod_spec = crow.get(slot["prod_spec_col"], "").strip()

            # A slot is filled by its shop code. When editing, the name is decoration
            # that is never read back, so a name without a code is an empty slot —
            # and an empty slot always means "leave this alone".
            if not shop_code and (upsert or not shop_name):
                continue

            identifier = f"{item_code}/{shop_code}"

            # Validate
            errors: list[str] = []
            if not re.match(r"^[0-9]{4}$", item_code):
                errors.append(f"invalid itemcode '{item_code}' (must be 4 digits)")
            elif item_code not in existing_items:
                errors.append(
                    f"itemcode '{item_code}' not found; load it via the items upload first"
                )
            if not re.match(r"^[0-9]+[A-Z]$", shop_code):
                errors.append(
                    f"invalid shopcode '{shop_code}' (must match ^[0-9]+[A-Z]$)"
                )
            elif upsert and shop_code not in existing_shops:
                # Editing never writes shop master data, so there is nothing here to
                # create a shop from — the shops upload owns that.
                errors.append(
                    f"shop '{shop_code}' is not in this market; "
                    "add it with the shops upload first"
                )
            if not unit:
                errors.append("unit is required")
            if not upsert and not shop_name:
                errors.append("shop name is required")
            if not upsert and not shop_desc:
                errors.append("shop description and location is required")
            # UNIQUE(item_id, shop_id, round_id) forbids one shop twice on an item, as
            # does the app's own editor. Scope the check to the item across the whole
            # file, not the row: one item may legitimately span two rows.
            if (item_code, shop_code) in seen_setups:
                errors.append(
                    f"shop '{shop_code}' is already used for item '{item_code}'"
                )

            if errors:
                items_with_errors.add(item_code)
                results.append(
                    BulkRecordResult(
                        row=i,
                        status="error",
                        identifier=identifier,
                        detail="; ".join(errors),
                    )
                )
                continue

            result_index = len(results)
            results.append(
                BulkRecordResult(
                    row=i,
                    status="skipped",
                    identifier=identifier,
                )
            )

            # Shops are only ever created by the initial load; upsert resolves codes
            # against the market and errors above on anything it does not recognise.
            if (
                not upsert
                and shop_code not in shops
                and shop_code not in existing_shops
            ):
                shops[shop_code] = {
                    "shop_serial_no": shop_code,
                    "shop_name": shop_name,
                    "shop_description_and_location": shop_desc,
                    "result_index": result_index,
                }

            market_items.append(
                {
                    "item_code": item_code,
                    "shop_serial_no": shop_code,
                    "shop_selection_status": slot["status"],
                    "unit_of_sale": unit,
                    "product_specification": prod_spec or None,
                    "market_item_description": local_name or None,
                    "result_index": result_index,
                }
            )

            # (item, shop) pairs are unique by now — a repeat errored out above.
            seen_setups.add((item_code, shop_code))
            shop_setups.append(
                {
                    "item_code": item_code,
                    "shop_serial_no": shop_code,
                    "shop_selection_status": slot["status"],
                    "result_index": result_index,
                }
            )

    return MarketShopItemSetupValidation(
        market_id=market_id,
        shops=shops,
        market_items=market_items,
        shop_setups=shop_setups,
        results=results,
        existing_shops=existing_shops,
        items_with_errors=items_with_errors,
    )
