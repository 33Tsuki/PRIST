"""Unit tests for the setup export/upsert round trip: sheet layout, field diffing,
and the validator's upsert behaviour. No DB — the validator runs against a stub
connection that answers the three lookups it makes."""

import asyncio
import io
import re

import pytest
from fastapi import HTTPException
from openpyxl import load_workbook

from app.master_data.ingestion.parser import (
    generate_data_xlsx,
    generate_template_xlsx,
    parse_content,
)
from app.survey.ingestion.diff import diff_fields, merge_status
from app.survey.ingestion.export import (
    build_setup_sheet_rows,
    export_filename,
    instructions_sheet,
)
from app.survey.ingestion.router import (
    _MARKET_ITEM_FIELDS,
    _MARKET_ITEM_LABELS,
    _plan_item,
)
from app.survey.ingestion.validators import (
    MARKET_SHOP_ITEM_SETUP_COLUMNS,
    MARKET_SHOP_ITEM_SETUP_SLOTS,
    ROLE_IDENTITY,
    ROLE_IGNORED,
    _canon,
    validate_market_shop_item_setup,
)

MARKET = {
    "market_id": 1,
    "market_code": "RNT001",
    "selected_market": "Agartala Main",
    "district_name": "West Tripura",
    "district_code": "08",
}


def setup_row(**over):
    row = {
        "setup_id": 1,
        "shop_selection_status": "ORIGINALLY SELECTED",
        "item_id": 10,
        "item_code": "0101",
        "item_name": "Rice",
        "shop_id": 100,
        "shop_serial_no": "1A",
        "shop_name": "ABC Store",
        "shop_description_and_location": "Near main road",
        "market_item_id": 500,
        "unit_of_sale": "kg",
        "product_specification": "Basmati 25kg",
        "market_item_description": "Rice loose",
        "market_item_count": 1,
    }
    row.update(over)
    return row


# ── Sheet layout ─────────────────────────────────────────────────────


def test_three_slots_collapse_into_one_row():
    sheet = build_setup_sheet_rows(
        MARKET,
        [
            setup_row(),
            setup_row(
                setup_id=2,
                shop_selection_status="SUBSTITUTE 1",
                shop_id=101,
                shop_serial_no="2A",
                shop_name="XYZ Store",
                market_item_id=501,
            ),
            setup_row(
                setup_id=3,
                shop_selection_status="SUBSTITUTE 2",
                shop_id=102,
                shop_serial_no="3A",
                shop_name="PQR Store",
                market_item_id=502,
            ),
        ],
    )
    assert len(sheet.rows) == 1
    row = sheet.rows[0]
    assert row["market code"] == "RNT001"
    assert row["itemcode"] == "0101"
    assert row["item name"] == "Rice"
    assert row["local name"] == "Rice loose"
    assert row["unit"] == "kg"
    assert row["shopcodeoriginal"] == "1A"
    assert row["substitute1shopcode"] == "2A"
    assert row["substitute2shopcode"] == "3A"
    assert sheet.notes == []


def test_two_shops_in_one_slot_overflow_to_a_second_row():
    sheet = build_setup_sheet_rows(
        MARKET,
        [
            setup_row(),
            setup_row(setup_id=2, shop_id=101, shop_serial_no="2A", market_item_id=501),
            setup_row(
                setup_id=3,
                shop_selection_status="SUBSTITUTE 1",
                shop_id=102,
                shop_serial_no="3A",
                market_item_id=502,
            ),
        ],
    )
    assert [r["shopcodeoriginal"] for r in sheet.rows] == ["1A", "2A"]
    # The substitute only exists once, so it must not be repeated on the overflow row.
    assert [r.get("substitute1shopcode", "") for r in sheet.rows] == ["3A", ""]


def test_item_level_unit_comes_from_the_originally_selected_shop():
    sheet = build_setup_sheet_rows(
        MARKET,
        [
            setup_row(
                setup_id=2,
                shop_selection_status="SUBSTITUTE 1",
                shop_id=101,
                shop_serial_no="2A",
                unit_of_sale="Gram",
                market_item_id=501,
            ),
            setup_row(),
        ],
    )
    assert sheet.rows[0]["unit"] == "kg"
    assert any("disagree on unit" in n for n in sheet.notes)


def test_an_item_with_no_local_name_exports_blank_not_the_item_name():
    """The two names are separate values. The export used to fall back to the master
    item name, so every export/re-upload cycle invented a local name."""
    sheet = build_setup_sheet_rows(MARKET, [setup_row(market_item_description=None)])
    assert sheet.rows[0]["local name"] == ""
    assert sheet.rows[0]["item name"] == "Rice"


def test_the_local_name_disagreement_note_names_the_sheet_column():
    sheet = build_setup_sheet_rows(
        MARKET,
        [
            setup_row(),
            setup_row(
                setup_id=2,
                shop_selection_status="SUBSTITUTE 1",
                shop_id=101,
                shop_serial_no="2A",
                market_item_id=501,
                market_item_description="Binni Chaul",
            ),
        ],
    )
    assert any("disagree on local name" in n for n in sheet.notes)


def test_not_selected_setups_are_kept_off_the_data_sheet():
    sheet = build_setup_sheet_rows(
        MARKET,
        [setup_row(), setup_row(setup_id=2, shop_selection_status="NOT SELECTED")],
    )
    assert len(sheet.rows) == 1
    assert len(sheet.not_selected) == 1
    assert any("NOT SELECTED" in n for n in sheet.notes)


def test_setup_without_a_market_item_is_flagged():
    sheet = build_setup_sheet_rows(
        MARKET,
        [setup_row(market_item_id=None, unit_of_sale=None, product_specification=None)],
    )
    assert sheet.rows[0]["unit"] == ""
    assert any("no market item" in n for n in sheet.notes)


def test_split_market_items_are_flagged():
    sheet = build_setup_sheet_rows(MARKET, [setup_row(market_item_count=2)])
    assert any("more than one market" in n for n in sheet.notes)


def test_export_filename_strips_unsafe_characters():
    assert (
        export_filename({"market_code": "RN/01 01"}, {"round_number": 3})
        == "setup_RN0101_round3.xlsx"
    )


# ── xlsx writer ──────────────────────────────────────────────────────


def test_generate_data_xlsx_writes_headers_and_values():
    sheet = build_setup_sheet_rows(MARKET, [setup_row()])
    content = generate_data_xlsx(
        MARKET_SHOP_ITEM_SETUP_COLUMNS,
        sheet.rows,
        sheet_name="Setup",
        extra_sheets=[("Notes", ["note"], [["hello"]])],
    )
    wb = load_workbook(io.BytesIO(content))
    assert wb.active.title == "Setup"  # re-upload reads the active sheet
    assert wb.sheetnames == ["Setup", "Notes"]
    headers = [c.value for c in wb.active[1]]
    assert headers == [c["name"] for c in MARKET_SHOP_ITEM_SETUP_COLUMNS]
    assert wb.active.cell(row=2, column=headers.index("itemcode") + 1).value == "0101"
    assert wb["Notes"].cell(row=2, column=1).value == "hello"


def _header_style(content: bytes, column: str):
    wb = load_workbook(io.BytesIO(content))
    idx = [c["name"] for c in MARKET_SHOP_ITEM_SETUP_COLUMNS].index(column) + 1
    cell = wb.active.cell(row=1, column=idx)
    return cell.fill.start_color.rgb[-6:], cell.comment


def test_header_roles_are_colour_coded_and_annotated():
    content = generate_data_xlsx(MARKET_SHOP_ITEM_SETUP_COLUMNS, [])
    identity_fill, identity_comment = _header_style(content, "itemcode")
    editable_fill, editable_comment = _header_style(content, "unit")
    ignored_fill, ignored_comment = _header_style(content, "market name")

    assert len({identity_fill, editable_fill, ignored_fill}) == 3
    assert identity_comment is not None and "NEW entry" in identity_comment.text
    assert editable_comment is None and ignored_comment is None


def test_shop_codes_are_editable_and_shop_names_are_not():
    content = generate_data_xlsx(MARKET_SHOP_ITEM_SETUP_COLUMNS, [])
    editable_fill, _ = _header_style(content, "unit")
    ignored_fill, _ = _header_style(content, "market name")

    for column in ("shopcodeoriginal", "substitute1shopcode", "substitute2shopcode"):
        assert _header_style(content, column) == (editable_fill, None)
    for column in (
        "shopnameoriginal",
        "substitute1",
        "shopdescriptionandlocationoriginal",
        "substitute2shopdescriptionandlocation",
    ):
        assert _header_style(content, column) == (ignored_fill, None)


def test_blank_template_carries_the_same_role_styling():
    identity_fill, identity_comment = _header_style(
        generate_template_xlsx(MARKET_SHOP_ITEM_SETUP_COLUMNS), "itemcode"
    )
    assert identity_comment is not None
    assert (
        identity_fill
        == _header_style(
            generate_data_xlsx(MARKET_SHOP_ITEM_SETUP_COLUMNS, []), "itemcode"
        )[0]
    )


def test_master_data_columns_without_roles_keep_the_default_header():
    plain = [{"name": "item code", "required": True, "example": "0101"}]
    wb = load_workbook(io.BytesIO(generate_template_xlsx(plain)))
    cell = wb.active.cell(row=1, column=1)
    assert cell.fill.start_color.rgb[-6:] == "4472C4"
    assert cell.comment is None


def test_no_ref_columns_remain():
    names = [c["name"] for c in MARKET_SHOP_ITEM_SETUP_COLUMNS]
    assert not [n for n in names if n.startswith("ref")]


def test_every_column_role_is_known():
    roles = {c.get("role") for c in MARKET_SHOP_ITEM_SETUP_COLUMNS}
    assert roles == {None, ROLE_IDENTITY, ROLE_IGNORED}


# ── Instructions tab ─────────────────────────────────────────────────


def _instructions_text(sheet, shops=None):
    return "\n".join(line[0] for line in instructions_sheet(sheet, shops)[0][2])


def test_instructions_tab_always_explains_the_identity_columns():
    sheet = build_setup_sheet_rows(MARKET, [setup_row()])
    (title, headers, lines) = instructions_sheet(sheet)[0]
    text = "\n".join(line[0] for line in lines)
    assert title == "Instructions"
    assert "ADDS A NEW ENTRY" in text
    assert "itemcode" in text and "market name" in text
    assert "Notes about this market" not in text  # nothing to report here


def test_instructions_tab_explains_the_shop_code_rules():
    text = _instructions_text(build_setup_sheet_rows(MARKET, [setup_row()]))
    assert "CHANGING A SHOP CODE replaces that shop for this item" in text
    assert "The shop itself is not deleted" in text
    assert "rejected" in text  # the collected-price guard
    assert "Clearing a shop code changes nothing" in text
    # Shop names moved to the read-only list and the blanket promise is now false.
    assert "shopnameoriginal" in text
    assert "never deletes anything" not in text


def test_instructions_tab_lists_the_market_shops():
    sheet = build_setup_sheet_rows(MARKET, [setup_row()])
    text = _instructions_text(sheet, [EXISTING_SHOP, SECOND_SHOP])
    assert "Shops in this market" in text
    assert "1A — ABC Store" in text and "2A — XYZ Store" in text


def test_instructions_tab_appends_market_specific_notes():
    sheet = build_setup_sheet_rows(MARKET, [setup_row(market_item_count=2)])
    text = _instructions_text(sheet)
    assert "Notes about this market:" in text
    assert "more than one market" in text


# ── Diffing ──────────────────────────────────────────────────────────


def test_diff_treats_blank_and_null_as_equal():
    changed, changes = diff_fields({"a": None}, {"a": ""}, ["a"])
    assert changed == {} and changes == []


def test_diff_is_case_sensitive():
    changed, changes = diff_fields({"a": "kg"}, {"a": "Kg"}, ["a"])
    assert changed == {"a": "Kg"}
    assert changes == ["a: 'kg' -> 'Kg'"]


def test_diff_clearing_a_field_writes_null():
    changed, changes = diff_fields({"a": "x"}, {"a": ""}, ["a"])
    assert changed == {"a": None}
    assert changes == ["a: 'x' -> (blank)"]


def test_diff_ignores_fields_absent_from_the_sheet():
    assert diff_fields({"a": "x"}, {}, ["a"]) == ({}, [])


def test_diff_labels_point_at_the_sheet_column_not_the_db_column():
    _, changes = diff_fields(
        {"market_item_description": "Rice"},
        {"market_item_description": "Binni Chaul"},
        _MARKET_ITEM_FIELDS,
        _MARKET_ITEM_LABELS,
    )
    assert changes == ["local name: 'Rice' -> 'Binni Chaul'"]


def test_merge_status_keeps_the_most_consequential():
    assert merge_status("skipped", "unchanged") == "unchanged"
    assert merge_status("updated", "unchanged") == "updated"
    assert merge_status("updated", "error") == "error"
    assert merge_status("error", "created") == "error"


# ── Validator ────────────────────────────────────────────────────────


class FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    async def fetchall(self):
        return self._rows

    async def fetchone(self):
        return self._rows[0] if self._rows else None


class FakeConn:
    """Answers the three lookups validate_market_shop_item_setup makes, matched on
    a distinctive fragment of each statement."""

    def __init__(self, shops=()):
        self.shops = list(shops)

    async def execute(self, sql, params=None):
        if "cpi_tripura_market " in sql or "FROM cpi_tripura_market\n" in sql:
            return FakeCursor([{"market_id": 1}])
        if "FROM cpi_tripura_item" in sql:
            return FakeCursor([{"item_code": "0101"}, {"item_code": "0102"}])
        if "cpi_tripura_market_shop" in sql:
            return FakeCursor(self.shops)
        raise AssertionError(f"unexpected query: {sql}")


EXISTING_SHOP = {
    "shop_id": 100,
    "shop_serial_no": "1A",
    "shop_name": "ABC Store",
    "shop_description_and_location": "Near main road",
}

SECOND_SHOP = {
    "shop_id": 101,
    "shop_serial_no": "2A",
    "shop_name": "XYZ Store",
    "shop_description_and_location": "Near bus stand",
}


def sheet_row(**over):
    row = {
        "market code": "RNT001",
        "itemcode": "0101",
        "local name": "Rice loose",
        "unit": "kg",
        "shopnameoriginal": "ABC Store",
        "shopcodeoriginal": "1A",
        "shopdescriptionandlocationoriginal": "Near main road",
        "productspecificationoriginal": "Basmati 25kg",
    }
    row.update(over)
    return row


def validate(rows, *, mode="create", shops=(EXISTING_SHOP,)):
    return asyncio.run(
        validate_market_shop_item_setup(rows, FakeConn(shops), mode=mode)
    )


def test_create_mode_skips_shops_already_in_the_database():
    assert validate([sheet_row()]).shops == {}


def test_upsert_never_stages_a_shop_write():
    """Editing a setup sheet must not be able to touch shop master data."""
    v = validate([sheet_row(shopnameoriginal="Renamed")], mode="upsert")
    assert v.shops == {}
    assert v.existing_shops["1A"]["shop_id"] == 100


def test_create_mode_stages_an_unknown_shop_for_creation():
    v = validate([sheet_row(shopcodeoriginal="9Z")])
    assert set(v.shops) == {"9Z"}


def test_upsert_rejects_a_shop_the_market_does_not_have():
    v = validate([sheet_row(shopcodeoriginal="9Z")], mode="upsert")
    assert v.results[0].status == "error"
    assert "not in this market" in v.results[0].detail
    assert "0101" in v.items_with_errors


def test_upsert_accepts_a_blank_shop_name_and_description():
    v = validate(
        [sheet_row(shopnameoriginal="", shopdescriptionandlocationoriginal="")],
        mode="upsert",
    )
    assert [r.status for r in v.results] == ["skipped"]


def test_create_still_requires_a_shop_name_and_description():
    v = validate(
        [sheet_row(shopnameoriginal="", shopdescriptionandlocationoriginal="")]
    )
    assert v.results[0].status == "error"
    assert "shop name is required" in v.results[0].detail


def test_upsert_treats_a_name_without_a_code_as_an_empty_slot():
    v = validate(
        [sheet_row(shopcodeoriginal="", shopnameoriginal="Ghost")], mode="upsert"
    )
    assert v.results == []


def test_create_still_errors_on_a_name_without_a_code():
    v = validate([sheet_row(shopcodeoriginal="", shopnameoriginal="Ghost")])
    assert v.results[0].status == "error"


def test_same_shop_twice_on_one_item_errors_on_the_second_slot():
    v = validate(
        [sheet_row(substitute1="ABC Store", substitute1shopcode="1A")], mode="upsert"
    )
    assert [r.status for r in v.results] == ["skipped", "error"]
    assert "already used for item" in v.results[1].detail
    assert "0101" in v.items_with_errors


def test_duplicate_shop_for_an_item_is_caught_across_rows_too():
    v = validate([sheet_row(), sheet_row()], mode="upsert")
    assert [r.status for r in v.results] == ["skipped", "error"]


def test_market_items_carry_their_slot_status():
    v = validate(
        [sheet_row(substitute1="XYZ", substitute1shopcode="2A")],
        mode="upsert",
        shops=(EXISTING_SHOP, SECOND_SHOP),
    )
    assert [mi["shop_selection_status"] for mi in v.market_items] == [
        "ORIGINALLY SELECTED",
        "SUBSTITUTE 1",
    ]


def test_rows_naming_two_market_codes_are_rejected():
    with pytest.raises(HTTPException) as exc:
        validate([sheet_row(), sheet_row(**{"market code": "RNT002"})])
    assert exc.value.status_code == 400
    assert "more than one market code" in exc.value.detail


def test_market_code_on_the_first_row_only_is_fine():
    v = validate([sheet_row(), sheet_row(**{"market code": ""})])
    assert v.market_id == 1


def test_setups_carry_the_row_they_came_from():
    v = validate([sheet_row()], mode="upsert")
    assert v.shop_setups[0]["result_index"] == 0
    assert v.shop_setups[0]["shop_selection_status"] == "ORIGINALLY SELECTED"


def test_missing_required_column_rejects_the_file():
    with pytest.raises(HTTPException) as exc:
        validate([{k: v for k, v in sheet_row().items() if k != "unit"}])
    assert exc.value.status_code == 400


def test_the_missing_column_message_uses_the_printed_header():
    """'localname' is the canonical form; the uploader is looking for 'local name'."""
    with pytest.raises(HTTPException) as exc:
        validate([{k: v for k, v in sheet_row().items() if k != "market code"}])
    assert "Missing required columns: market code" in exc.value.detail


def test_a_blank_local_name_is_accepted_and_stored_as_null():
    """An item may have no local name — the column is nullable, and on upsert a
    blank cell is a deliberate erase that diff_fields turns into NULL."""
    v = validate([sheet_row(**{"local name": ""})], mode="upsert")
    assert not [r for r in v.results if r.status == "error"]
    assert v.market_items[0]["market_item_description"] is None


def test_a_sheet_still_using_the_old_itemname_column_is_rejected():
    """Hard break: 'itemname' used to mean the local name. It now canonicalizes onto
    the read-only 'item name' column, so a stale file is missing 'local name' rather
    than silently writing the wrong value."""
    row = {k: v for k, v in sheet_row().items() if k != "local name"}
    row["itemname"] = "Rice"
    with pytest.raises(HTTPException) as exc:
        validate([row])
    assert exc.value.status_code == 400
    assert "local name" in exc.value.detail


def test_the_item_name_column_is_never_written_to_the_local_name():
    v = validate([sheet_row(**{"item name": "Rice", "local name": ""})], mode="upsert")
    assert v.market_items[0]["market_item_description"] is None


# ── Round trip ───────────────────────────────────────────────────────


def test_exported_sheet_reimports_to_the_same_setups():
    setups = [
        setup_row(),
        setup_row(
            setup_id=2,
            shop_selection_status="SUBSTITUTE 1",
            shop_id=101,
            shop_serial_no="2A",
            shop_name="XYZ Store",
            market_item_id=501,
        ),
    ]
    sheet = build_setup_sheet_rows(MARKET, setups)
    content = generate_data_xlsx(MARKET_SHOP_ITEM_SETUP_COLUMNS, sheet.rows)
    rows = parse_content("export.xlsx", content)

    v = validate(rows, mode="upsert", shops=(EXISTING_SHOP, SECOND_SHOP))
    assert not [r for r in v.results if r.status == "error"]
    assert {
        (s["item_code"], s["shop_serial_no"], s["shop_selection_status"])
        for s in v.shop_setups
    } == {
        ("0101", "1A", "ORIGINALLY SELECTED"),
        ("0101", "2A", "SUBSTITUTE 1"),
    }
    assert [mi["unit_of_sale"] for mi in v.market_items] == ["kg", "kg"]
    assert [mi["product_specification"] for mi in v.market_items] == [
        "Basmati 25kg",
        "Basmati 25kg",
    ]
    assert [mi["market_item_description"] for mi in v.market_items] == [
        "Rice loose",
        "Rice loose",
    ]


def test_an_item_without_a_local_name_round_trips_as_null():
    """The regression this rename exists to kill: the export used to write the master
    item name into the local-name cell, so re-uploading an untouched export turned
    'Rice' into the local name of an item that never had one."""
    sheet = build_setup_sheet_rows(MARKET, [setup_row(market_item_description=None)])
    content = generate_data_xlsx(MARKET_SHOP_ITEM_SETUP_COLUMNS, sheet.rows)
    rows = parse_content("export.xlsx", content)

    v = validate(rows, mode="upsert")
    assert not [r for r in v.results if r.status == "error"]
    assert v.market_items[0]["market_item_description"] is None


# ── Per-item reconciliation ──────────────────────────────────────────


def slot(shop_id, status, *, index=0, serial=None, **over):
    row = {
        "item_code": "0101",
        "shop_id": shop_id,
        "shop_serial_no": serial or f"{shop_id}X",
        "shop_selection_status": status,
        "unit_of_sale": "kg",
        "product_specification": "Basmati 25kg",
        "market_item_description": "Rice loose",
        "result_index": index,
    }
    row.update(over)
    return row


def stored(shop_id, status, *, serial=None, collected=False, market_items=1):
    return {
        "setup_id": 900 + shop_id,
        "shop_selection_status": status,
        "shop_serial_no": serial or f"{shop_id}X",
        "market_items": [
            {"market_item_id": 500 + shop_id + i, "has_collected_price": collected}
            for i in range(market_items)
        ],
        "has_collected_price": collected,
    }


def test_swapping_two_substitutes_is_only_a_status_change():
    """The property that keeps a slot swap cheap: both shops are still present, so
    neither is displaced and no row is deleted."""
    plan = _plan_item(
        [slot(1, "SUBSTITUTE 2", index=0), slot(2, "SUBSTITUTE 1", index=1)],
        {1: stored(1, "SUBSTITUTE 1"), 2: stored(2, "SUBSTITUTE 2")},
        allow_deletes=True,
    )
    assert len(plan.matched) == 2
    assert plan.to_create == [] and plan.displaced == [] and plan.blocked == set()


def test_a_new_code_in_a_filled_slot_displaces_the_old_shop():
    plan = _plan_item(
        [slot(9, "ORIGINALLY SELECTED", index=3, serial="4A")],
        {1: stored(1, "ORIGINALLY SELECTED", serial="1A")},
        allow_deletes=True,
    )
    assert [s["shop_id"] for s in plan.to_create] == [9]
    assert len(plan.displaced) == 1
    d = plan.displaced[0]
    assert (d.serial, d.new_serial, d.result_index) == ("1A", "4A", 3)
    assert d.market_item_ids == [501]
    assert plan.blocked == set()


def test_a_blank_slot_never_displaces_anything():
    plan = _plan_item(
        [slot(1, "ORIGINALLY SELECTED")],
        {1: stored(1, "ORIGINALLY SELECTED"), 2: stored(2, "SUBSTITUTE 1")},
        allow_deletes=True,
    )
    assert plan.displaced == []
    assert len(plan.matched) == 1


def test_a_shop_moved_into_another_slot_displaces_that_slots_holder():
    plan = _plan_item(
        [slot(2, "SUBSTITUTE 1", index=0, serial="2A")],
        {
            1: stored(1, "SUBSTITUTE 1", serial="1A"),
            2: stored(2, "SUBSTITUTE 2", serial="2A"),
        },
        allow_deletes=True,
    )
    assert [st["shop_serial_no"] for _, st in plan.matched] == ["2A"]
    assert [d.serial for d in plan.displaced] == ["1A"]


def test_a_collected_price_blocks_the_slot_that_would_replace_it():
    plan = _plan_item(
        [slot(9, "ORIGINALLY SELECTED", index=2, serial="4A")],
        {1: stored(1, "ORIGINALLY SELECTED", serial="1A", collected=True)},
        allow_deletes=True,
    )
    assert plan.blocked == {2}
    assert plan.displaced[0].has_collected_price is True


def test_allow_deletes_off_suppresses_every_displacement():
    plan = _plan_item(
        [slot(9, "ORIGINALLY SELECTED", serial="4A")],
        {1: stored(1, "ORIGINALLY SELECTED", serial="1A")},
        allow_deletes=False,
    )
    assert plan.displaced == [] and plan.blocked == set()
    assert [s["shop_id"] for s in plan.to_create] == [9]


def test_a_not_selected_holder_is_never_displaced():
    plan = _plan_item(
        [slot(9, "ORIGINALLY SELECTED", serial="4A")],
        {
            1: stored(1, "ORIGINALLY SELECTED", serial="1A"),
            2: stored(2, "NOT SELECTED", serial="2A"),
        },
        allow_deletes=True,
    )
    assert [d.serial for d in plan.displaced] == ["1A"]


def test_a_not_selected_shop_the_sheet_names_again_is_matched():
    plan = _plan_item(
        [slot(2, "SUBSTITUTE 1", serial="2A")],
        {2: stored(2, "NOT SELECTED", serial="2A")},
        allow_deletes=True,
    )
    assert len(plan.matched) == 1
    assert plan.displaced == [] and plan.to_create == []


# ── Reporting contract ───────────────────────────────────────────────

# The frontend parses changes[] with this shape; it is the real contract.
_CHANGE_RE = re.compile(r"^(\w+): (\(blank\)|'.*') -> (\(blank\)|'.*')$")


def test_change_strings_match_the_shape_the_frontend_parses():
    for change in (
        "shop_serial_no: '1A' -> '4A'",
        "shop_selection_status: 'SUBSTITUTE 1' -> 'SUBSTITUTE 2'",
        diff_fields({"unit_of_sale": "kg"}, {"unit_of_sale": "Kg"}, ["unit_of_sale"])[
            1
        ][0],
        diff_fields(
            {"product_specification": "x"},
            {"product_specification": ""},
            ["product_specification"],
        )[1][0],
    ):
        assert _CHANGE_RE.match(change), change


# ── Role pinning ─────────────────────────────────────────────────────


def test_ignored_columns_are_never_read_when_editing():
    """A column marked grey must not be one the upsert path actually consumes —
    otherwise a new column could silently become live."""
    read_when_editing = {
        _canon(name)
        for slot_def in MARKET_SHOP_ITEM_SETUP_SLOTS
        for name in (slot_def["shop_code_col"], slot_def["prod_spec_col"])
    } | {_canon(n) for n in ("market code", "itemcode", "local name", "unit")}

    ignored = {
        _canon(c["name"])
        for c in MARKET_SHOP_ITEM_SETUP_COLUMNS
        if c.get("role") == ROLE_IGNORED
    }
    assert ignored & read_when_editing == set()
