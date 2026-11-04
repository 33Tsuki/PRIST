"""Code-defined report registry. Adding a report type means adding an entry
here: its selectable columns, its params model, and a fetch function that
returns a ReportPayload (see base.py). No SQL or templates live in the DB."""

from psycopg import AsyncConnection

from app.config import settings
from app.reports import queries
from app.reports.base import (
    Col,
    MarketSurveyDetailParams,
    ReportPayload,
    ReportSection,
    ReportType,
    RoundDistrictParams,
    RoundRangeParams,
)
from app.reports.movement import (
    DEFAULT_MOVEMENT_COLUMNS,
    MOVEMENT_COLUMNS,
    pivot_movement,
)

_PRICE_COLUMNS = {
    "district_name": Col("District"),
    "market_code": Col("Market Code"),
    "market_name": Col("Market"),
    "domain": Col("Domain"),
    "item_code": Col("Item Code"),
    "item_name": Col("Item"),
    "local_name": Col("Local Name"),
    "shop_serial_no": Col("Shop No."),
    "shop_name": Col("Shop"),
    "shop_selection_status": Col("Shop Selection"),
    "item_availability_code": Col("Availability"),
    "unit_of_sale": Col("Unit"),
    "product_specification": Col("Specification"),
    "previous_period_price": Col("Previous Price"),
    "current_period_price": Col("Current Price"),
    "price_change": Col("Change"),
    "price_change_percentage": Col("Change %"),
    "price_alert": Col("Alert"),
    "price_recording_date": Col("Recorded On"),
    "price_remark": Col("PC Remark"),
    "ds_remark": Col("DS Remark"),
}

_SUMMARY_COLUMNS = {
    "district_name": Col("District"),
    "subdivision": Col("Subdivision"),
    "market_code": Col("Market Code"),
    "market_name": Col("Market"),
    "domain": Col("Domain"),
    "status": Col("Status"),
    "total_items": Col("Total Items"),
    "collected_items": Col("Collected"),
    "pending_items": Col("Pending"),
    "alert_count": Col("Alerts"),
    "surveyor_name": Col("Surveyor"),
    "surveyor_phone": Col("Surveyor Phone"),
    "submitted_at": Col("Submitted At"),
    "submitted_by_name": Col("Submitted By"),
}


_DETAIL_DEFAULT_COLUMNS = [
    "district_name",
    "market_name",
    "item_code",
    "item_name",
    "shop_name",
    "shop_selection_status",
    "unit_of_sale",
    "previous_period_price",
    "current_period_price",
    "price_change_percentage",
]

# Each row filter has a column that explains why a row is in the result, so a
# checked filter pulls its column in whether or not the caller chose columns.
# Keyed by column because that is also the shape GET /reports/types publishes —
# one source of truth for the server-side append and the client-side lock.
_DETAIL_IMPLIED_BY = {
    "price_alert": ["only_alerts"],
    "ds_remark": ["only_ds_remarks"],
    "price_remark": ["only_pc_remarks"],
}


def _detail_columns(
    params: MarketSurveyDetailParams, chosen: list[str] | None
) -> list[str]:
    columns = list(chosen if chosen is not None else _DETAIL_DEFAULT_COLUMNS)
    columns += [
        col
        for col, flags in _DETAIL_IMPLIED_BY.items()
        if col not in columns and any(getattr(params, flag) for flag in flags)
    ]
    return columns


async def _fetch_price_report(
    conn: AsyncConnection, params: MarketSurveyDetailParams
) -> ReportPayload:
    rows = await queries.price_report_rows(
        conn,
        params.round_id,
        params.district_id,
        params.market_id,
        only_alerts=params.only_alerts,
        only_ds_remarks=params.only_ds_remarks,
        only_pc_remarks=params.only_pc_remarks,
    )
    return ReportPayload(sections=[ReportSection(columns=_PRICE_COLUMNS, rows=rows)])


async def _fetch_market_summary(
    conn: AsyncConnection, params: RoundDistrictParams
) -> ReportPayload:
    rows = await queries.market_summary_rows(conn, params.round_id, params.district_id)
    return ReportPayload(sections=[ReportSection(columns=_SUMMARY_COLUMNS, rows=rows)])


async def _fetch_price_movement(
    conn: AsyncConnection, params: RoundRangeParams
) -> ReportPayload:
    window = await queries.round_window(conn, params.from_round_id, params.to_round_id)
    rows = await queries.price_movement_rows(
        conn,
        params.from_round_id,
        params.to_round_id,
        params.district_id,
        params.market_id,
    )
    columns, wide_rows = pivot_movement(
        rows, window, settings.price_alert_threshold_pct
    )
    return ReportPayload(sections=[ReportSection(columns=columns, rows=wide_rows)])


REPORT_TYPES: dict[str, ReportType] = {
    "market_survey_detailed_report": ReportType(
        key="market_survey_detailed_report",
        sequence=1,
        title="Market Survey Detailed Report",
        description=(
            "Item-wise prices collected in a round — one row per item, naming "
            "the shop actually used — with previous-round comparison. "
            "Optionally narrowed to rows carrying alerts or remarks."
        ),
        columns=_PRICE_COLUMNS,
        default_columns=_DETAIL_DEFAULT_COLUMNS,
        columns_fn=_detail_columns,
        implied_by=_DETAIL_IMPLIED_BY,
        params_model=MarketSurveyDetailParams,
        fetch=_fetch_price_report,
    ),
    "market_summary_report": ReportType(
        key="market_summary_report",
        sequence=2,
        title="Market Survey Summary",
        description="Per-market completion and approval status for a round, with surveyor details.",
        columns=_SUMMARY_COLUMNS,
        default_columns=[
            "district_name",
            "market_name",
            "status",
            "total_items",
            "collected_items",
            "pending_items",
            "alert_count",
            "surveyor_name",
        ],
        params_model=RoundDistrictParams,
        fetch=_fetch_market_summary,
    ),
    "round_price_movement_report": ReportType(
        key="round_price_movement_report",
        sequence=3,
        title="Round Price Movement Report",
        description=(
            "Item-wise average price variation across a range of rounds, "
            "one column per round, per market."
        ),
        columns=MOVEMENT_COLUMNS,
        default_columns=DEFAULT_MOVEMENT_COLUMNS,
        params_model=RoundRangeParams,
        fetch=_fetch_price_movement,
    ),
}
