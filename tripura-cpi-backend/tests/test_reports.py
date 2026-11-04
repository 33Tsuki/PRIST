"""Unit tests for the reports module: params validation, column
validation/projection, catalog integrity, and renderer output. No DB."""

import asyncio
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.reports import service
from app.reports.base import (
    Col,
    MarketSurveyDetailParams,
    ReportPayload,
    ReportSection,
    RoundRangeParams,
    RoundScopeParams,
)
from app.reports.catalog import REPORT_TYPES
from app.reports.models import PreviewReportRequest
from app.reports.movement import MAX_ROUND_WINDOW, pivot_movement
from app.reports.renderers import render_docx, render_pdf, render_xlsx, section_view

# ── Params models ────────────────────────────────────────────────────


def test_params_requires_round_id():
    with pytest.raises(ValidationError):
        RoundScopeParams.model_validate({})


def test_params_rejects_unknown_keys():
    with pytest.raises(ValidationError):
        RoundScopeParams.model_validate({"round_id": 1, "bogus": True})


def test_params_market_requires_district():
    with pytest.raises(ValidationError):
        RoundScopeParams.model_validate({"round_id": 1, "market_id": 5})


def test_params_valid_full_scope():
    p = RoundScopeParams.model_validate(
        {"round_id": 1, "district_id": 2, "market_id": 5}
    )
    assert (p.round_id, p.district_id, p.market_id) == (1, 2, 5)


def test_validate_params_maps_to_422():
    rt = REPORT_TYPES["market_survey_detailed_report"]
    with pytest.raises(HTTPException) as exc:
        service._validate_params(rt, {"round_id": "not-a-number"})
    assert exc.value.status_code == 422
    assert exc.value.detail[0]["loc"][0] == "params"


def test_detail_params_defaults_all_filters_off():
    p = MarketSurveyDetailParams.model_validate({"round_id": 1})
    assert (p.only_alerts, p.only_ds_remarks, p.only_pc_remarks) == (
        False,
        False,
        False,
    )


def test_detail_params_rejects_unknown_keys():
    with pytest.raises(ValidationError):
        MarketSurveyDetailParams.model_validate({"round_id": 1, "bogus": True})


def test_detail_params_inherits_market_requires_district():
    with pytest.raises(ValidationError):
        MarketSurveyDetailParams.model_validate({"round_id": 1, "market_id": 5})


def test_range_params_rejects_unknown_keys():
    with pytest.raises(ValidationError):
        RoundRangeParams.model_validate(
            {"from_round_id": 1, "to_round_id": 2, "bogus": True}
        )


def test_range_params_market_requires_district():
    with pytest.raises(ValidationError):
        RoundRangeParams.model_validate(
            {"from_round_id": 1, "to_round_id": 2, "market_id": 5}
        )


def test_range_params_allows_single_round_window():
    p = RoundRangeParams.model_validate({"from_round_id": 3, "to_round_id": 3})
    assert p.from_round_id == p.to_round_id == 3


# ── Column selection ─────────────────────────────────────────────────


def test_columns_default_when_none():
    rt = REPORT_TYPES["market_survey_detailed_report"]
    assert service._validate_columns(rt, None) == rt.default_columns


def test_columns_unknown_rejected():
    rt = REPORT_TYPES["market_survey_detailed_report"]
    with pytest.raises(HTTPException) as exc:
        service._validate_columns(rt, ["item_code", "nope"])
    assert exc.value.status_code == 422
    assert "nope" in exc.value.detail


def test_columns_empty_rejected():
    rt = REPORT_TYPES["market_survey_detailed_report"]
    with pytest.raises(HTTPException) as exc:
        service._validate_columns(rt, [])
    assert exc.value.status_code == 422


def test_columns_duplicates_rejected():
    rt = REPORT_TYPES["market_survey_detailed_report"]
    with pytest.raises(HTTPException) as exc:
        service._validate_columns(rt, ["item_code", "item_code"])
    assert exc.value.status_code == 422


def test_detail_columns_added_for_checked_filters():
    rt = REPORT_TYPES["market_survey_detailed_report"]
    params = MarketSurveyDetailParams(
        round_id=1, only_alerts=True, only_pc_remarks=True
    )
    cols = service._validate_columns(rt, None, params)
    assert cols[: len(rt.default_columns)] == rt.default_columns
    assert cols[len(rt.default_columns) :] == ["price_alert", "price_remark"]


def test_detail_columns_unchanged_when_no_filter_checked():
    rt = REPORT_TYPES["market_survey_detailed_report"]
    params = MarketSurveyDetailParams(round_id=1)
    assert service._validate_columns(rt, None, params) == rt.default_columns


def test_detail_columns_appended_to_explicit_selection():
    rt = REPORT_TYPES["market_survey_detailed_report"]
    params = MarketSurveyDetailParams(round_id=1, only_ds_remarks=True)
    cols = service._validate_columns(rt, ["item_code", "current_period_price"], params)
    assert cols == ["item_code", "current_period_price", "ds_remark"]


def test_detail_columns_not_duplicated_when_already_chosen():
    rt = REPORT_TYPES["market_survey_detailed_report"]
    params = MarketSurveyDetailParams(round_id=1, only_alerts=True)
    cols = service._validate_columns(rt, ["item_code", "price_alert"], params)
    assert cols == ["item_code", "price_alert"]


def test_projection_respects_request_order():
    payload = ReportPayload(
        sections=[
            ReportSection(
                columns={"a": Col("A"), "b": Col("B"), "c": Col("C")},
                rows=[{"a": 1, "b": 2, "c": 3}],
            )
        ]
    )
    service._project(payload, ["c", "a"])
    assert list(payload.sections[0].columns.keys()) == ["c", "a"]


# ── Catalog integrity ────────────────────────────────────────────────


def test_catalog_defaults_are_subset_of_columns():
    for rt in REPORT_TYPES.values():
        missing = [c for c in rt.default_columns if c not in rt.columns]
        assert not missing, f"{rt.key}: defaults not in catalog: {missing}"


def test_catalog_keys_match_entries():
    for key, rt in REPORT_TYPES.items():
        assert key == rt.key


def test_catalog_implied_by_references_real_columns_and_params():
    """implied_by is published to clients, so a typo would silently stop a
    column from ever locking. Pin both halves to the real catalog."""
    for rt in REPORT_TYPES.values():
        params = rt.params_model.model_fields
        for column, flags in rt.implied_by.items():
            assert column in rt.columns, f"{rt.key}: unknown column {column}"
            for flag in flags:
                assert flag in params, f"{rt.key}: unknown param {flag}"


def test_catalog_sequences_are_contiguous_and_1_based():
    sequences = sorted(rt.sequence for rt in REPORT_TYPES.values())
    assert sequences == list(range(1, len(REPORT_TYPES) + 1))


# ── District scope pinning ───────────────────────────────────────────

_DS = {"role": "DISTRICT_SUPERVISOR", "district_id": 7}
_ADMIN = {"role": "ADMIN", "district_id": None}


def test_scope_admin_pass_through():
    p = RoundScopeParams(round_id=1)
    assert service._apply_district_scope(_ADMIN, p).district_id is None


def test_scope_ds_pinned_to_own_district():
    p = RoundScopeParams(round_id=1)
    assert service._apply_district_scope(_DS, p).district_id == 7


def test_scope_ds_other_district_forbidden():
    p = RoundScopeParams(round_id=1, district_id=8)
    with pytest.raises(HTTPException) as exc:
        service._apply_district_scope(_DS, p)
    assert exc.value.status_code == 403


# ── Renderers ────────────────────────────────────────────────────────


def _payload():
    return ReportPayload(
        meta=[("Survey Round", "Round 3"), ("District", "West Tripura")],
        sections=[
            ReportSection(
                columns={"item_name": Col("Item"), "price": Col("Price")},
                rows=[
                    {"item_name": "Rice", "price": Decimal("42.50")},
                    {
                        "item_name": "Dal",
                        "price": None,
                        "extra_unprojected": "ignored",
                    },
                ],
            )
        ],
    )


def test_render_pdf_produces_pdf_bytes():
    out = render_pdf(_payload(), "Test Report", "A description")
    assert out[:5] == b"%PDF-"


def test_render_docx_produces_docx_bytes():
    out = render_docx(_payload(), "Test Report", None)
    assert out[:2] == b"PK"  # docx is a zip container


def test_render_empty_section_mentions_no_data():
    payload = ReportPayload(sections=[ReportSection(columns={"a": Col("A")}, rows=[])])
    out = render_pdf(payload, "Empty", None)
    assert out[:5] == b"%PDF-"


def test_render_xlsx_native_types_roundtrip():
    import io

    from openpyxl import load_workbook

    out = render_xlsx(_payload(), "Test Report", "desc")
    assert out[:2] == b"PK"
    ws = load_workbook(io.BytesIO(out)).active
    cells = [
        [c.value for c in row] for row in ws.iter_rows(min_row=1, max_row=ws.max_row)
    ]
    flat = [v for row in cells for v in row]
    assert "Item" in flat and "Price" in flat  # header labels
    assert 42.5 in flat  # Decimal written as a native number, not a string


def test_render_xlsx_reports_progress():
    calls = []
    render_xlsx(_payload(), "T", None, progress_cb=lambda d, t: calls.append((d, t)))
    assert calls == [(1, 2), (2, 2)]


# ── Row caps + confirmation handshake ────────────────────────────────


def test_hard_cap_by_format(monkeypatch):
    monkeypatch.setattr(service.settings, "report_max_rows", 10)
    monkeypatch.setattr(service.settings, "report_max_rows_xlsx", 100)
    with pytest.raises(HTTPException) as exc:
        service._assert_row_caps(50, "pdf", confirm=True)
    assert exc.value.status_code == 422
    # same row count passes as xlsx (higher cap)
    service._assert_row_caps(50, "xlsx", confirm=True)


def test_warn_threshold_requires_confirmation(monkeypatch):
    monkeypatch.setattr(service.settings, "report_warn_rows", 10)
    with pytest.raises(HTTPException) as exc:
        service._assert_row_caps(50, "pdf", confirm=False)
    assert exc.value.status_code == 409
    assert exc.value.detail["requires_confirmation"] is True
    assert exc.value.detail["rows"] == 50
    # confirm=true proceeds
    service._assert_row_caps(50, "pdf", confirm=True)


def test_below_warn_needs_no_confirmation():
    service._assert_row_caps(5, "pdf", confirm=False)


# ── Preview ──────────────────────────────────────────────────────────


def test_section_view_truncates_and_formats():
    section = _payload().sections[0]
    view = section_view(section, limit=1)
    assert view["labels"] == ["Item", "Price"]
    assert view["rows"] == [["Rice", "42.5"]]  # Decimal normalized
    # unlimited keeps every row; None renders as an empty cell
    assert section_view(section)["rows"][1] == ["Dal", ""]


def test_format_availability(monkeypatch):
    monkeypatch.setattr(service.settings, "report_warn_rows", 10)
    monkeypatch.setattr(service.settings, "report_max_rows", 100)
    monkeypatch.setattr(service.settings, "report_max_rows_xlsx", 1000)

    assert service.format_availability(5) == {
        "allowed_formats": ["pdf", "docx", "xlsx"],
        "exceeds_warn_threshold": False,
    }
    assert service.format_availability(50)["exceeds_warn_threshold"] is True
    assert service.format_availability(500)["allowed_formats"] == ["xlsx"]
    assert service.format_availability(5000)["allowed_formats"] == []


def test_preview_request_limit_bounds():
    assert PreviewReportRequest(report_type="x").limit == 100
    for bad in (0, 501):
        with pytest.raises(ValidationError):
            PreviewReportRequest(report_type="x", limit=bad)


def test_preview_budget_is_global_across_sections(monkeypatch):
    """limit is a budget over the whole document, not per section."""
    payload = ReportPayload(
        meta=[("Survey Round", "Round 3")],
        sections=[
            ReportSection(columns={"a": Col("A")}, rows=[{"a": i} for i in range(5)]),
            ReportSection(columns={"a": Col("A")}, rows=[{"a": i} for i in range(5)]),
        ],
    )
    rt = REPORT_TYPES["market_survey_detailed_report"]
    monkeypatch.setattr(service, "_prepare", _fake_prepare(rt, payload))

    out = _preview(PreviewReportRequest(report_type=rt.key, limit=7))
    assert [len(s["rows"]) for s in out["sections"]] == [5, 2]
    assert out["sections"][0]["total_rows"] == 5  # untruncated section total
    assert (out["total_rows"], out["returned_rows"], out["truncated"]) == (10, 7, True)
    assert out["report_title"] == rt.title
    assert out["meta"] == [("Survey Round", "Round 3")]
    assert out["sections"][0]["columns"] == [{"key": "a", "label": "A"}]


def test_preview_never_rejects_oversized(monkeypatch):
    monkeypatch.setattr(service.settings, "report_max_rows", 2)
    monkeypatch.setattr(service.settings, "report_warn_rows", 1)
    payload = ReportPayload(
        sections=[
            ReportSection(columns={"a": Col("A")}, rows=[{"a": i} for i in range(9)])
        ]
    )
    rt = REPORT_TYPES["market_survey_detailed_report"]
    monkeypatch.setattr(service, "_prepare", _fake_prepare(rt, payload))

    out = _preview(PreviewReportRequest(report_type=rt.key))
    assert out["total_rows"] == 9
    assert out["allowed_formats"] == ["xlsx"]
    assert out["exceeds_warn_threshold"] is True
    assert out["limits"]["max_rows_pdf_docx"] == 2


def _fake_prepare(report_type, payload):
    """Stand in for the DB-backed validate+fetch half of the pipeline."""

    async def _prepare(conn, user, key, raw_params, raw_columns):
        return report_type, None, [], payload.meta, payload

    return _prepare


def _preview(body):
    return asyncio.run(service.preview_report(None, {"role": "ADMIN"}, body))


# ── Progress callback throttling ─────────────────────────────────────


def test_progress_cb_throttles(monkeypatch):
    import anyio.from_thread

    updates = []
    monkeypatch.setattr(anyio.from_thread, "run", lambda fn, *a: updates.append(a))
    cb = service._make_progress_cb(report_id=1)
    cb(1, 100)  # pct 5: fires (first update)
    cb(50, 100)  # pct 47: suppressed — within 1s of the last write
    assert updates == [(1, 5)]


# ── Multi-round price movement ───────────────────────────────────────


def _window(n, names=None):
    return [
        {
            "slot": s,
            "round_id": s,
            "round_number": s,
            "round_name": (names or {}).get(s),
        }
        for s in range(1, n + 1)
    ]


def _long(slot, price, *, spec="Sona", local="Binni", item_id=1, shops=2):
    return {
        "district_name": "West Tripura",
        "subdivision": "Sadar",
        "market_id": 4,
        "market_code": "UO0001",
        "market_name": "Agartala",
        "domain": "Urban",
        "item_id": item_id,
        "item_code": "0101",
        "item_name": "Rice",
        "unit_of_sale": "Kg",
        "product_specification": spec,
        "slot": slot,
        "avg_price": None if price is None else Decimal(price),
        "shop_count": shops,
        "local_name": local,
    }


def test_pivot_columns_trimmed_and_labelled():
    cols, _rows = pivot_movement([_long(1, "40")], _window(2, {1: "March 2026"}), 50)
    assert cols["round_1_price"].label == "March 2026"
    assert cols["round_2_price"].label == "Round 2"  # no round_name in the DB
    assert cols["round_2_change_pct"].label == "Round 2 Change %"
    assert "round_1_change_pct" not in cols  # oldest slot has no predecessor
    assert "round_3_price" not in cols  # window is only 2 rounds long


def test_pivot_gap_compares_against_previous_populated_slot():
    rows = pivot_movement([_long(1, "40"), _long(3, "50")], _window(3), 50)[1]
    row = rows[0]
    assert row["round_2_price"] is None
    assert row["round_2_change_pct"] is None
    assert row["round_3_change_pct"] == Decimal("25.00")  # 40 -> 50, skipping the gap


def test_pivot_single_slot_window_has_no_change_columns():
    cols, rows = pivot_movement([_long(1, "40")], _window(1), 50)
    assert [k for k in cols if k.endswith("_change_pct")] == []
    assert rows[0]["overall_change"] == Decimal("0.00")
    assert rows[0]["overall_change_percentage"] == Decimal("0.00")


def test_pivot_zero_previous_price_does_not_divide():
    rows = pivot_movement([_long(1, "0"), _long(2, "10")], _window(2), 50)[1]
    assert rows[0]["round_2_change_pct"] is None
    assert rows[0]["overall_change"] == Decimal("10.00")
    assert rows[0]["overall_change_percentage"] is None
    assert rows[0]["volatility_percentage"] is None
    assert rows[0]["price_alert"] is False


def test_pivot_summary_measures():
    rows = pivot_movement(
        [_long(1, "40"), _long(2, "50"), _long(3, "45")], _window(3), 50
    )[1]
    row = rows[0]
    assert (row["min_price"], row["max_price"]) == (Decimal("40.00"), Decimal("50.00"))
    assert row["avg_price"] == Decimal("45.00")
    assert row["volatility_percentage"] == Decimal("25.00")
    assert row["overall_change"] == Decimal("5.00")
    assert row["overall_change_percentage"] == Decimal("12.50")


def test_pivot_alert_fires_at_exactly_the_threshold():
    rows = pivot_movement([_long(1, "40"), _long(2, "60")], _window(2), 50)[1]
    assert rows[0]["price_alert"] is True  # +50% is >= the 50 threshold

    rows = pivot_movement([_long(1, "40"), _long(2, "59")], _window(2), 50)[1]
    assert rows[0]["price_alert"] is False


def test_pivot_flags_superseded_spec():
    rows = pivot_movement(
        [
            _long(1, "40", spec="Sona"),
            _long(2, "44", spec="Basmati"),
        ],
        _window(2),
        50,
    )[1]
    by_spec = {r["product_specification"]: r for r in rows}
    assert by_spec["Sona"]["spec_changed"] is True  # not priced in the latest round
    assert by_spec["Basmati"]["spec_changed"] is False


def test_pivot_flags_renamed_local_name_and_keeps_the_latest():
    rows = pivot_movement(
        [_long(1, "40", local="Binni"), _long(2, "44", local="Binni Chaul")],
        _window(2),
        50,
    )[1]
    assert rows[0]["spec_changed"] is True
    assert rows[0]["local_name"] == "Binni Chaul"


def test_pivot_separates_series_and_keeps_sql_order():
    rows = pivot_movement(
        [_long(1, "40", item_id=1), _long(1, "90", item_id=2)], _window(1), 50
    )[1]
    assert [r["round_1_price"] for r in rows] == [Decimal("40"), Decimal("90")]


# ── Round-range referential checks ───────────────────────────────────


def _round(round_id, number, cycle="MONTHLY"):
    from datetime import date

    return {
        "round_id": round_id,
        "round_number": number,
        "round_name": f"Round {number}",
        "cycle": cycle,
        "round_start_date": date(2026, 1, 1),
        "round_end_date": date(2026, 1, 31),
    }


def _stub_rounds(monkeypatch, rounds):
    async def get_round(conn, round_id):
        return rounds.get(round_id)

    monkeypatch.setattr(service.queries, "get_round", get_round)


def _meta(params):
    return asyncio.run(service._round_meta(None, params))


def test_round_meta_range_ok(monkeypatch):
    _stub_rounds(monkeypatch, {1: _round(1, 1), 2: _round(2, 3)})
    meta = _meta(RoundRangeParams(from_round_id=1, to_round_id=2))
    assert meta[0] == ("Rounds", "Round 1 – Round 3 (3 rounds)")


def test_round_meta_range_rejects_cycle_mismatch(monkeypatch):
    _stub_rounds(monkeypatch, {1: _round(1, 1), 2: _round(2, 3, cycle="QUARTERLY")})
    with pytest.raises(HTTPException) as exc:
        _meta(RoundRangeParams(from_round_id=1, to_round_id=2))
    assert exc.value.status_code == 422


def test_round_meta_range_rejects_reversed_range(monkeypatch):
    _stub_rounds(monkeypatch, {1: _round(1, 5), 2: _round(2, 2)})
    with pytest.raises(HTTPException) as exc:
        _meta(RoundRangeParams(from_round_id=1, to_round_id=2))
    assert exc.value.status_code == 422


def test_round_meta_range_rejects_oversized_window(monkeypatch):
    _stub_rounds(monkeypatch, {1: _round(1, 1), 2: _round(2, MAX_ROUND_WINDOW + 1)})
    with pytest.raises(HTTPException) as exc:
        _meta(RoundRangeParams(from_round_id=1, to_round_id=2))
    assert exc.value.status_code == 422
    assert str(MAX_ROUND_WINDOW) in exc.value.detail


def test_round_meta_range_missing_round_is_404(monkeypatch):
    _stub_rounds(monkeypatch, {1: _round(1, 1)})
    with pytest.raises(HTTPException) as exc:
        _meta(RoundRangeParams(from_round_id=1, to_round_id=99))
    assert exc.value.status_code == 404


def test_round_meta_single_round_unchanged(monkeypatch):
    _stub_rounds(monkeypatch, {1: _round(1, 4)})
    meta = _meta(RoundScopeParams(round_id=1))
    assert meta[0] == ("Survey Round", "Round 4")


# ── Regeneration ─────────────────────────────────────────────────────

_REGEN_USER = {"role": "ADMIN", "user_id": 9, "username": "admin", "full_name": "Ada"}


def _report_row(**over):
    """A stored generated_report row, the sole input to a strict replay."""
    return {
        "generated_report_id": 5,
        "report_type": "market_survey_detailed_report",
        "title": "T",
        "description": None,
        "file_format": "xlsx",
        "file_path": "old.xlsx",
        "status": "READY",
        "params": {
            "filters": {"round_id": 2, "district_id": 3},
            "columns": ["item_code"],
        },
        "district_id": 3,
    } | over


def _stub_regen(monkeypatch, *, rows=1, claim="row"):
    """Stub the DB-backed halves of regenerate_report; returns a recorder of
    what _prepare, the claim and the job were called with."""
    seen: dict = {"prepare": None, "claim": None, "job": None}
    payload = ReportPayload(
        sections=[
            ReportSection(columns={"a": Col("A")}, rows=[{"a": i} for i in range(rows)])
        ]
    )
    rt = REPORT_TYPES["market_survey_detailed_report"]

    async def _prepare(conn, user, key, raw_params, raw_columns):
        seen["prepare"] = (key, raw_params, raw_columns)
        return rt, None, [], [], payload

    async def _claim(conn, report_id, user_id, username):
        seen["claim"] = (report_id, user_id, username)
        return None if claim is None else _report_row(status="PENDING")

    def _job(report_id, payload, title, description, file_format, file_name, **kw):
        seen["job"] = {"file_name": file_name, "meta": payload.meta, **kw}
        return "job-sentinel"

    monkeypatch.setattr(service, "_prepare", _prepare)
    monkeypatch.setattr(service.queries, "claim_report_for_regeneration", _claim)
    monkeypatch.setattr(service, "_render_job", _job)
    return seen


def _regen(row, user=None, confirm=False):
    return asyncio.run(
        service.regenerate_report(None, user or _REGEN_USER, row, confirm=confirm)
    )


def test_regenerate_rejects_while_pending(monkeypatch):
    seen = _stub_regen(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        _regen(_report_row(status="PENDING"))
    assert exc.value.status_code == 409
    assert seen["claim"] is None  # row never touched


def test_regenerate_allowed_from_failed(monkeypatch):
    """The restart sweep's 'Interrupted by restart — regenerate' dead end."""
    seen = _stub_regen(monkeypatch)
    _regen(_report_row(status="FAILED", error="Interrupted by restart — regenerate"))
    assert seen["claim"] == (5, 9, "admin")


def test_regenerate_replays_stored_type_filters_and_columns(monkeypatch):
    seen = _stub_regen(monkeypatch)
    _regen(_report_row())
    assert seen["prepare"] == (
        "market_survey_detailed_report",
        {"round_id": 2, "district_id": 3},
        ["item_code"],
    )


def test_regenerate_row_caps_run_before_claim(monkeypatch):
    """A rejected regeneration must leave the existing report downloadable."""
    monkeypatch.setattr(service.settings, "report_warn_rows", 0)
    seen = _stub_regen(monkeypatch, rows=3)
    with pytest.raises(HTTPException) as exc:
        _regen(_report_row())
    assert exc.value.status_code == 409
    assert exc.value.detail["requires_confirmation"] is True
    assert seen["claim"] is None


def test_regenerate_confirm_true_proceeds(monkeypatch):
    monkeypatch.setattr(service.settings, "report_warn_rows", 0)
    seen = _stub_regen(monkeypatch, rows=3)
    _regen(_report_row(), confirm=True)
    assert seen["claim"] == (5, 9, "admin")


def test_regenerate_lost_claim_race_is_409(monkeypatch):
    seen = _stub_regen(monkeypatch, claim=None)
    with pytest.raises(HTTPException) as exc:
        _regen(_report_row())
    assert exc.value.status_code == 409
    assert seen["claim"] is not None  # it was attempted, and lost


def test_regenerate_stamps_regenerating_user_in_meta(monkeypatch):
    seen = _stub_regen(monkeypatch)
    _regen(
        _report_row(),
        user={**_REGEN_USER, "user_id": 4, "username": "ds001", "full_name": None},
    )
    assert seen["job"]["meta"][-2] == ("Generated By", "ds001")
    assert seen["job"]["meta"][-1][0] == "Generated At"
    assert seen["claim"] == (5, 4, "ds001")


def test_regenerate_writes_new_file_and_replaces_old(monkeypatch):
    seen = _stub_regen(monkeypatch)
    _regen(_report_row())
    assert seen["job"]["file_name"].endswith(".xlsx")  # format from the row
    assert seen["job"]["file_name"] != "old.xlsx"
    assert seen["job"]["replaces_file"] == "old.xlsx"


# ── Render job file swap ─────────────────────────────────────────────


def _stub_job_env(monkeypatch, tmp_path, *, finish="row", fail=False):
    """Run _render_job against a temp REPORTS_DIR and a fake pool, recording
    the finish_report call."""
    import contextlib

    seen: dict = {"finish": None}

    async def _finish(conn, report_id, status, error=None, file_path=None):
        seen["finish"] = {"status": status, "error": error, "file_path": file_path}
        return None if finish is None else {"generated_report_id": report_id}

    @contextlib.asynccontextmanager
    async def _conn():
        yield None

    class _Pool:
        def connection(self):
            return _conn()

    def _render(payload, title, description, cb=None):
        if fail:
            raise RuntimeError("boom")
        return b"xlsx-bytes"

    monkeypatch.setattr(service, "reports_dir", lambda: tmp_path)
    monkeypatch.setattr(service, "get_pool", lambda: _Pool())

    async def _progress(conn, report_id, progress):
        return None

    monkeypatch.setattr(service.queries, "finish_report", _finish)
    monkeypatch.setattr(service.queries, "update_report_progress", _progress)
    monkeypatch.setattr(service.renderers, "render_xlsx", _render)
    return seen


def _run_job(tmp_path, new_name="new.xlsx", replaces=None):
    payload = ReportPayload(sections=[ReportSection(columns={"a": Col("A")}, rows=[])])
    asyncio.run(
        service._render_job(
            5, payload, "T", None, "xlsx", new_name, replaces_file=replaces
        )
    )


def test_render_job_success_swaps_file_and_deletes_replaced(tmp_path, monkeypatch):
    seen = _stub_job_env(monkeypatch, tmp_path)
    (tmp_path / "old.xlsx").write_bytes(b"stale")
    _run_job(tmp_path, replaces="old.xlsx")
    assert (tmp_path / "new.xlsx").is_file()
    assert not (tmp_path / "old.xlsx").exists()
    assert seen["finish"] == {"status": "READY", "error": None, "file_path": "new.xlsx"}


def test_render_job_failure_keeps_replaced_file(tmp_path, monkeypatch):
    seen = _stub_job_env(monkeypatch, tmp_path, fail=True)
    (tmp_path / "old.xlsx").write_bytes(b"stale")
    _run_job(tmp_path, replaces="old.xlsx")
    assert not (tmp_path / "new.xlsx").exists()  # only what it wrote
    assert (tmp_path / "old.xlsx").is_file()  # previous report survives
    assert seen["finish"]["status"] == "FAILED"
    assert seen["finish"]["file_path"] is None  # row stays on the old file


def test_render_job_lost_race_unlinks_only_its_own_file(tmp_path, monkeypatch):
    _stub_job_env(monkeypatch, tmp_path, finish=None)
    (tmp_path / "old.xlsx").write_bytes(b"stale")
    _run_job(tmp_path, replaces="old.xlsx")
    assert not (tmp_path / "new.xlsx").exists()
    assert (tmp_path / "old.xlsx").is_file()


def test_render_job_first_generation_unchanged(tmp_path, monkeypatch):
    """replaces_file=None: nothing but the file it wrote is touched."""
    seen = _stub_job_env(monkeypatch, tmp_path)
    (tmp_path / "unrelated.xlsx").write_bytes(b"keep")
    _run_job(tmp_path, replaces=None)
    assert (tmp_path / "new.xlsx").is_file()
    assert (tmp_path / "unrelated.xlsx").is_file()
    assert seen["finish"]["file_path"] == "new.xlsx"
