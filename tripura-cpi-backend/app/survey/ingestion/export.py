"""Render a market's stored setups back into the upload sheet layout.

Pure functions — the caller supplies the market row and the rows from
`survey.queries.list_setups_for_export`. The output feeds
`parser.generate_data_xlsx(MARKET_SHOP_ITEM_SETUP_COLUMNS, ...)` and re-imports
through the same upload endpoint it came from, which is what makes bulk editing
in Excel a round trip rather than a re-entry.
"""

import re
from dataclasses import dataclass, field
from itertools import zip_longest

from app.survey.ingestion.validators import (
    MARKET_SHOP_ITEM_SETUP_COLUMNS,
    MARKET_SHOP_ITEM_SETUP_SLOTS,
    NOT_SELECTED,
    ROLE_IDENTITY,
    ROLE_IGNORED,
)

INSTRUCTIONS_SHEET = "Instructions"
INSTRUCTIONS_HEADERS = ["how to use this file"]


@dataclass
class SetupSheet:
    rows: list[dict] = field(default_factory=list)
    not_selected: list[dict] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def _text(value) -> str:
    return "" if value is None else str(value)


def _market_columns(market: dict) -> dict:
    return {
        "district name": _text(market.get("district_name")),
        "district code": _text(market.get("district_code")),
        "market name": _text(market.get("selected_market")),
        "market code": _text(market.get("market_code")),
    }


def _first_nonblank(setups: list[dict], key: str) -> str:
    for s in setups:
        if _text(s.get(key)).strip():
            return _text(s[key])
    return ""


def _item_level_value(ordered: list[dict], key: str):
    """Pick the one value the sheet carries per item row, preferring the originally
    selected shop. `unit_of_sale` and `market_item_description` are modelled per item
    within a market+round; the per-shop storage is a denormalisation.

    A blank stays blank. The local name used to fall back to the master item name,
    which meant every export/re-upload cycle wrote the master name into
    `market_item_description` — the two are separate values and stay separate."""
    return _first_nonblank(ordered, key)


def _disagreements(setups: list[dict], key: str) -> list[str]:
    seen = {_text(s.get(key)).strip() for s in setups if _text(s.get(key)).strip()}
    return sorted(seen)


def build_setup_sheet_rows(market: dict, setups: list[dict]) -> SetupSheet:
    """Fold per-setup rows into the wide one-row-per-item sheet layout."""
    sheet = SetupSheet()

    live = []
    for s in setups:
        if s["shop_selection_status"] == NOT_SELECTED:
            sheet.not_selected.append(s)
        else:
            live.append(s)

    if sheet.not_selected:
        sheet.notes.append(
            f"{len(sheet.not_selected)} setup(s) are marked '{NOT_SELECTED}'. "
            "The sheet has no column for them, so they are listed on this tab only "
            "and are left untouched when this file is re-uploaded."
        )

    market_cols = _market_columns(market)

    groups: dict[str, list[dict]] = {}
    for s in live:
        groups.setdefault(s["item_code"], []).append(s)

    for item_code, group in groups.items():
        buckets = {
            slot["status"]: sorted(
                (s for s in group if s["shop_selection_status"] == slot["status"]),
                key=lambda s: s["shop_serial_no"],
            )
            for slot in MARKET_SHOP_ITEM_SETUP_SLOTS
        }
        # Originally-selected first, so it wins the item-level unit/description.
        ordered = [
            s for slot in MARKET_SHOP_ITEM_SETUP_SLOTS for s in buckets[slot["status"]]
        ]

        unit = _item_level_value(ordered, "unit_of_sale")
        local_name = _item_level_value(ordered, "market_item_description")
        # The master item name is the same for every setup on this item code.
        item_name = _first_nonblank(ordered, "item_name")

        for key, label in (
            ("unit_of_sale", "unit"),
            ("market_item_description", "local name"),
        ):
            values = _disagreements(group, key)
            if len(values) > 1:
                sheet.notes.append(
                    f"Item {item_code}: shops disagree on {label} ({', '.join(values)}). "
                    f"The sheet carries one value per item, so re-uploading this file "
                    f"sets every shop to '{unit if key == 'unit_of_sale' else local_name}'."
                )

        missing_mi = [s for s in group if not s.get("market_item_id")]
        if missing_mi:
            sheet.notes.append(
                f"Item {item_code}: {len(missing_mi)} setup(s) have no market item "
                f"({', '.join(s['shop_serial_no'] for s in missing_mi)}), so unit and "
                "specification are blank. Fill in the unit before re-uploading — the "
                "upload rejects rows without one."
            )

        split_mi = [s for s in group if (s.get("market_item_count") or 0) > 1]
        if split_mi:
            sheet.notes.append(
                f"Item {item_code}: {len(split_mi)} shop(s) hold more than one market "
                f"item ({', '.join(s['shop_serial_no'] for s in split_mi)}); the "
                "lowest-numbered one is exported. Edit the others in the app."
            )

        for slot_setups in zip_longest(
            *(buckets[slot["status"]] for slot in MARKET_SHOP_ITEM_SETUP_SLOTS)
        ):
            row = dict(market_cols)
            row["itemcode"] = item_code
            row["item name"] = item_name
            row["local name"] = local_name
            row["unit"] = unit
            for slot, setup in zip(
                MARKET_SHOP_ITEM_SETUP_SLOTS, slot_setups, strict=True
            ):
                if setup is None:
                    continue
                row[slot["shop_name_col"]] = _text(setup["shop_name"])
                row[slot["shop_code_col"]] = _text(setup["shop_serial_no"])
                row[slot["shop_desc_col"]] = _text(
                    setup["shop_description_and_location"]
                )
                row[slot["prod_spec_col"]] = _text(setup["product_specification"])
            sheet.rows.append(row)

    return sheet


def _columns_with_role(role: str | None) -> str:
    return ", ".join(
        c["name"] for c in MARKET_SHOP_ITEM_SETUP_COLUMNS if c.get("role") == role
    )


def _how_to_lines() -> list[str]:
    """The standing guidance, ahead of anything specific to this market's data."""
    return [
        "Edit this file and upload it back with 'Update existing' selected.",
        "Always preview first — the check run lists every change before it is applied.",
        "",
        f"ORANGE columns ({_columns_with_role(ROLE_IDENTITY)}) identify the row.",
        "  Changing one of them ADDS A NEW ENTRY; it does not rename the old one.",
        "  To add an item, fill a new row at the bottom of the sheet.",
        "",
        f"GREY columns ({_columns_with_role(ROLE_IGNORED)}) are for reading only "
        "and are ignored on upload.",
        "  Shop names and locations are shown so you can tell the shops apart. "
        "Correct them with the shops upload, not here.",
        "  item name is the standard item name; it is shown so you can tell the rows "
        "apart. Correct it with the items upload, not here.",
        "",
        "BLUE columns are the ones to edit: local name, unit, the product "
        "specifications, and the shop codes.",
        "  local name is what this item is called locally in this market. It is "
        "separate from item name, and it may be left blank.",
        "  Clearing an optional cell (product specification, local name) clears the "
        "stored value.",
        "  unit and local name are one value per item: whatever the row says is "
        "applied to all three shops on that row.",
        "",
        "CHANGING A SHOP CODE replaces that shop for this item — the old shop's entry "
        "for this item is removed.",
        "  The shop itself is not deleted; it stays in the market and keeps its other "
        "items.",
        "  If a price has already been collected from the old shop for this item, the "
        "row is rejected. Change the shop in the app instead.",
        "  Clearing a shop code changes nothing — a blank slot is left exactly as it is.",
        "  The code you type must already exist in this market; see the list below.",
    ]


def shop_reference_lines(shops: list[dict]) -> list[str]:
    """Every shop code in the market, so a replacement can be picked without
    leaving the file."""
    if not shops:
        return []
    return [
        "",
        "Shops in this market (code — name):",
        *(
            f"  {_text(s['shop_serial_no'])} — {_text(s['shop_name'])}"
            for s in sorted(shops, key=lambda s: _text(s["shop_serial_no"]))
        ),
    ]


def instructions_sheet(
    sheet: SetupSheet, shops: list[dict] | None = None
) -> list[tuple[str, list[str], list[list]]]:
    """The informational tab: how to use the file, then this market's caveats."""
    lines = [[line] for line in _how_to_lines()]

    if sheet.notes:
        lines.append([""])
        lines.append(["Notes about this market:"])
        lines += [[n] for n in sheet.notes]

    if sheet.not_selected:
        lines.append([""])
        lines.append([f"{NOT_SELECTED} setups (item code / shop code / shop name):"])
        lines += [
            [f"{s['item_code']} / {s['shop_serial_no']} / {_text(s['shop_name'])}"]
            for s in sheet.not_selected
        ]

    lines += [[line] for line in shop_reference_lines(shops or [])]

    return [(INSTRUCTIONS_SHEET, INSTRUCTIONS_HEADERS, lines)]


def export_filename(market: dict, round_row: dict) -> str:
    code = re.sub(r"[^A-Za-z0-9_-]", "", _text(market.get("market_code"))) or "market"
    return f"setup_{code}_round{round_row['round_number']}.xlsx"
