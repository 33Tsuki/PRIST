"""Field-level diffing for setup upserts — pure helpers, no DB."""

from collections.abc import Mapping, Sequence

# Precedence when several phases (shop, market item, setup) report on one sheet row:
# the most consequential outcome wins.
_STATUS_RANK = {
    "skipped": 0,
    "duplicate": 1,
    "unchanged": 2,
    "created": 3,
    "updated": 4,
    "error": 5,
}


def _norm(value) -> str:
    """Blank and NULL are the same thing in the sheet, so compare them as equal."""
    return "" if value is None else str(value).strip()


def _show(value) -> str:
    return f"'{value}'" if _norm(value) else "(blank)"


def diff_fields(
    existing: Mapping,
    desired: Mapping,
    fields: Sequence[str],
    labels: Mapping[str, str] | None = None,
) -> tuple[dict, list[str]]:
    """Compare `fields` between a DB row and the values a sheet row asks for.

    Returns the columns to write plus human-readable change strings. Comparison is
    case-sensitive on purpose — normalising 'kg' to 'Kg' is exactly the kind of edit
    this feature exists for. A field absent from `desired` is left alone; a field
    present but blank clears the column (the sheet round-trips current values, so an
    emptied cell is a deliberate erase).

    `labels` names a field the way the sheet does, so the preview points at a column
    the uploader can actually find rather than at a DB column name.
    """
    changed: dict = {}
    changes: list[str] = []
    for field in fields:
        if field not in desired:
            continue
        new = desired[field]
        old = existing.get(field)
        if _norm(old) == _norm(new):
            continue
        changed[field] = new if _norm(new) else None
        label = labels.get(field, field) if labels else field
        changes.append(f"{label}: {_show(old)} -> {_show(new)}")
    return changed, changes


def merge_status(current: str, incoming: str) -> str:
    """Fold a phase's outcome into a row's running status, most consequential wins."""
    return incoming if _STATUS_RANK[incoming] > _STATUS_RANK[current] else current
