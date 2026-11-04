"""Multi-round price movement: column catalog and the long → wide fold.

The catalog's column dict has to be static (it is what column selections are
validated against, and what `GET /reports/types` publishes as JSON Schema),
but a movement report has one column per round in the chosen range. The fixed
`round_N_*` slot keys below bridge that: the catalog offers slots 1..12 with
generic labels, and `pivot_movement` hands back a section column dict holding
only the slots the chosen range actually has, relabelled with the real round
names. `service._project` drops the keys a section doesn't carry, so a short
range simply renders fewer columns.

Everything here is pure — no DB, no settings lookups — so the arithmetic is
unit-testable on its own.
"""

from collections.abc import Iterable, Sequence
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.reports.base import Col

# One column per round, so the window has to stay narrow enough to render.
# 12 slots is already ~30 columns wide once the change columns are picked.
MAX_ROUND_WINDOW = 12

_TWO_DP = Decimal("0.01")

# Identity of a series: which market, which item, in what unit, to what spec.
_IDENTITY_COLUMNS = {
    "district_name": Col("District"),
    "subdivision": Col("Subdivision"),
    "market_code": Col("Market Code"),
    "market_name": Col("Market"),
    "domain": Col("Domain"),
    "item_code": Col("Item Code"),
    "item_name": Col("Item"),
    "local_name": Col("Local Name"),
    "unit_of_sale": Col("Unit"),
    "product_specification": Col("Specification"),
    "shop_count": Col("Shops"),
    "spec_changed": Col("Spec Changed"),
}

_SUMMARY_COLUMNS = {
    "overall_change": Col("Overall Change"),
    "overall_change_percentage": Col("Overall Change %"),
    "min_price": Col("Min Price"),
    "max_price": Col("Max Price"),
    "avg_price": Col("Avg Price"),
    "volatility_percentage": Col("Volatility %"),
    "price_alert": Col("Alert"),
}


def price_key(slot: int) -> str:
    return f"round_{slot}_price"


def change_key(slot: int) -> str:
    return f"round_{slot}_change_pct"


def _round_columns() -> dict[str, Col]:
    """Slot 1 is the oldest round in the window and has no in-window
    predecessor, so it gets no change column."""
    cols: dict[str, Col] = {}
    for slot in range(1, MAX_ROUND_WINDOW + 1):
        cols[price_key(slot)] = Col(f"Round {slot}")
        if slot > 1:
            cols[change_key(slot)] = Col(f"Round {slot} Change %")
    return cols


MOVEMENT_COLUMNS: dict[str, Col] = {
    **_IDENTITY_COLUMNS,
    **_round_columns(),
    **_SUMMARY_COLUMNS,
}

# Kept deliberately narrow: one column per round already eats the page, so
# the default is the price series plus the whole-window movement. Item name,
# market code, per-round change %, and the min/max/avg block stay selectable.
DEFAULT_MOVEMENT_COLUMNS: list[str] = [
    "district_name",
    "market_name",
    "item_code",
    "local_name",
    "unit_of_sale",
    "product_specification",
    *[price_key(slot) for slot in range(1, MAX_ROUND_WINDOW + 1)],
    "overall_change_percentage",
    "price_alert",
]


def _round_label(round_row: dict) -> str:
    return round_row["round_name"] or f"Round {round_row['round_number']}"


def section_columns(window: Sequence[dict]) -> dict[str, Col]:
    """The catalog columns, with the round slots trimmed to the window and
    relabelled with real round names."""
    cols: dict[str, Col] = dict(_IDENTITY_COLUMNS)
    for round_row in window:
        slot = round_row["slot"]
        label = _round_label(round_row)
        cols[price_key(slot)] = Col(label)
        if slot > 1:
            cols[change_key(slot)] = Col(f"{label} Change %")
    cols.update(_SUMMARY_COLUMNS)
    return cols


def _quantize(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(_TWO_DP, rounding=ROUND_HALF_UP)


def _pct_change(previous: Decimal, current: Decimal) -> Decimal | None:
    if previous == 0:
        return None
    return _quantize((current - previous) * 100 / previous)


def pivot_movement(
    long_rows: Iterable[dict],
    window: Sequence[dict],
    alert_pct: float | int | Decimal,
) -> tuple[dict[str, Col], list[dict[str, Any]]]:
    """Fold `(series, slot)` rows from queries.price_movement_rows into one
    wide row per series, computing the movement measures along the way.

    Returns the section's column dict alongside the rows; the caller wraps
    both in a ReportSection.
    """
    threshold = Decimal(str(alert_pct))
    slots = [r["slot"] for r in window]

    # Group into series, preserving the SQL's ORDER BY (dicts keep insertion
    # order, so the output rows come out already sorted).
    series: dict[tuple, dict[str, Any]] = {}
    for row in long_rows:
        key = (
            row["market_id"],
            row["item_id"],
            row["unit_of_sale"],
            row["product_specification"],
        )
        entry = series.get(key)
        if entry is None:
            entry = series[key] = {
                "identity": {
                    k: row[k]
                    for k in (
                        "district_name",
                        "subdivision",
                        "market_code",
                        "market_name",
                        "domain",
                        "item_code",
                        "item_name",
                        "unit_of_sale",
                        "product_specification",
                    )
                },
                "group_key": (row["market_id"], row["item_id"], row["unit_of_sale"]),
                "prices": {},
                "shop_counts": {},
                "local_names": {},
            }
        entry["prices"][row["slot"]] = row["avg_price"]
        entry["shop_counts"][row["slot"]] = row["shop_count"]
        if row["local_name"] is not None:
            entry["local_names"][row["slot"]] = row["local_name"]

    # The latest slot each (market, item, unit) was priced in at all — a
    # series missing from it has been superseded by another specification.
    group_last_slot: dict[tuple, int] = {}
    for entry in series.values():
        last = max(entry["prices"], default=None)
        if last is None:
            continue
        group = entry["group_key"]
        group_last_slot[group] = max(group_last_slot.get(group, 0), last)

    rows: list[dict[str, Any]] = []
    for entry in series.values():
        prices = entry["prices"]
        populated = [s for s in slots if prices.get(s) is not None]
        if not populated:
            continue

        out: dict[str, Any] = dict(entry["identity"])

        local_names = entry["local_names"]
        latest_named = max(local_names, default=None)
        out["local_name"] = None if latest_named is None else local_names[latest_named]
        out["shop_count"] = entry["shop_counts"].get(populated[-1])

        # Superseded specification, or the local name was edited mid-window.
        renamed = len(set(local_names.values())) > 1
        superseded = populated[-1] < group_last_slot[entry["group_key"]]
        out["spec_changed"] = renamed or superseded

        alert = False
        previous_slot: int | None = None
        for slot in slots:
            price = prices.get(slot)
            out[price_key(slot)] = price
            if slot > 1:
                out[change_key(slot)] = None
            if price is None:
                continue
            if previous_slot is not None:
                pct = _pct_change(prices[previous_slot], price)
                if slot > 1:
                    out[change_key(slot)] = pct
                if pct is not None and abs(pct) >= threshold:
                    alert = True
            previous_slot = slot

        first, last = prices[populated[0]], prices[populated[-1]]
        out["overall_change"] = _quantize(last - first)
        out["overall_change_percentage"] = _pct_change(first, last)

        values = [prices[s] for s in populated]
        low, high = min(values), max(values)
        out["min_price"] = _quantize(low)
        out["max_price"] = _quantize(high)
        out["avg_price"] = _quantize(sum(values) / len(values))
        out["volatility_percentage"] = _pct_change(low, high)
        out["price_alert"] = alert

        rows.append(out)

    return section_columns(window), rows
