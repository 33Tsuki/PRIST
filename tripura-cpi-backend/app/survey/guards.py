"""Round/market editability checks shared by the survey router and the setup
ingestion router (a plain module keeps the two routers from importing each other)."""

from fastapi import HTTPException
from psycopg import AsyncConnection

from app.survey import queries


async def get_round_or_404(conn: AsyncConnection, round_id: int):
    row = await queries.get_survey_round(conn, round_id)
    if not row:
        raise HTTPException(404, "Survey round not found")
    return row


async def assert_round_editable(conn: AsyncConnection, round_id: int):
    """Assignments and setups may be changed while a round is DRAFT or ACTIVE, but not
    after it has ended. Mirrors the round-status gate in sync/router.py:_resolve_active_round."""
    row = await get_round_or_404(conn, round_id)
    if row["round_status"] == "CLOSED":
        raise HTTPException(
            409, "Round is closed; assignments and setups cannot be changed"
        )
    return row


async def assert_market_editable(conn: AsyncConnection, round_id: int, market_id: int):
    """Reject edits to a market whose data has already been submitted for approval.

    Only guards edits of what was already collected — adding setups stays allowed, so
    this is applied to the bulk *upsert* path and not to plain creation. A missing
    status row means the market was never submitted, i.e. it is editable."""
    status = await queries.get_market_status(conn, round_id, market_id)
    if status and status["status"] in ("SUBMITTED", "APPROVED"):
        raise HTTPException(
            409,
            f"Market data is {status['status'].lower()}; un-submit it before editing setups",
        )
