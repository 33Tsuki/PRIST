from collections import defaultdict

import psycopg
from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import require_price_collector
from app.database import get_pool
from app.survey.queries import (
    get_market_status,
    get_survey_round,
    submit_markets_for_round,
)
from app.sync.models import (
    BatchSyncResponse,
    MissingPriceItem,
    RecordResult,
    SubmissionRequest,
    SubmissionResponse,
    SurveyorSyncResponse,
    SyncItem,
    SyncMarket,
    SyncPriceRecord,
    SyncRequest,
    SyncShop,
    SyncSubstituteShop,
    SyncSurveyRound,
)
from app.sync.queries import (
    get_all_setups_for_surveyor,
    get_assigned_market_item_ids,
    get_current_round,
    get_items_missing_prices,
    get_locked_market_item_ids,
    get_previous_prices,
    get_surveyor_markets,
    is_market_assigned_to_surveyor,
)

router = APIRouter(prefix="/sync", tags=["Sync"])


# ── Helpers ───────────────────────────────────────────────────────


async def _resolve_round(conn, round_id: int | None):
    if round_id is not None:
        round_row = await get_survey_round(conn, round_id)
    else:
        round_row = await get_current_round(conn)
    if not round_row:
        raise HTTPException(404, "Round not found")
    return round_row


async def _resolve_active_round(conn, round_id: int | None):
    """Like _resolve_round, but rejects rounds that are not ACTIVE — price
    collectors may only push/submit prices while a round is open for collection."""
    round_row = await _resolve_round(conn, round_id)
    if round_row["round_status"] != "ACTIVE":
        raise HTTPException(409, "Round is not active for collection")
    return round_row


# ── Surveyor sync (GET) ──────────────────────────────────────────


def _build_substitute(
    row: dict, prev_price_map: dict[tuple[int, int], object]
) -> SyncSubstituteShop:
    return SyncSubstituteShop(
        item_price_collection_shop_setup_id=row["item_price_collection_shop_setup_id"],
        shop_id=row["shop_id"],
        shop_serial_no=row["shop_serial_no"],
        shop_name=row["shop_name"],
        shop_description_and_location=row["shop_description_and_location"],
        market_item_id=row["market_item_id"],
        market_item_description=row.get("market_item_description"),
        previous_period_price=prev_price_map.get((row["item_id"], row["shop_id"])),
        stored_previous_period_price=row.get("stored_previous_period_price"),
        current_period_price=row.get("current_period_price"),
        is_na=row.get("is_na", False),
        is_not_applicable=row.get("is_not_applicable", False),
        remark=row.get("remark"),
    )


def _assemble_markets(
    markets: list[dict],
    setups: list[dict],
    prev_price_map: dict[tuple[int, int], object],
) -> list[SyncMarket]:
    setups_by_market: dict[int, list[dict]] = defaultdict(list)
    for s in setups:
        setups_by_market[s["market_id"]].append(s)

    sync_markets: list[SyncMarket] = []
    for market in markets:
        market_setups = setups_by_market.get(market["market_id"], [])

        # Group setups by item_id
        items_by_id: dict[int, list[dict]] = defaultdict(list)
        for s in market_setups:
            items_by_id[s["item_id"]].append(s)

        # Build items grouped by primary shop
        shops_info: dict[int, dict] = {}
        items_by_shop: dict[int, list[SyncItem]] = defaultdict(list)

        for _item_id, item_setups in items_by_id.items():
            primary = None
            sub1 = None
            sub2 = None
            for s in item_setups:
                status = s["shop_selection_status"]
                if status == "ORIGINALLY SELECTED":
                    primary = s
                elif status == "SUBSTITUTE 1":
                    sub1 = s
                elif status == "SUBSTITUTE 2":
                    sub2 = s

            if not primary:
                continue

            item_obj = SyncItem(
                item_price_collection_shop_setup_id=primary[
                    "item_price_collection_shop_setup_id"
                ],
                item_id=primary["item_id"],
                item_code=primary["item_code"],
                item_name=primary["item_name"],
                item_availability_code=primary["item_availability_code"],
                market_item_id=primary["market_item_id"],
                market_item_description=primary.get("market_item_description"),
                product_specification=primary["product_specification"],
                unit_of_sale=primary.get("unit_of_sale"),
                previous_period_price=prev_price_map.get(
                    (primary["item_id"], primary["shop_id"])
                ),
                stored_previous_period_price=primary.get(
                    "stored_previous_period_price"
                ),
                current_period_price=primary.get("current_period_price"),
                is_na=primary.get("is_na", False),
                is_not_applicable=primary.get("is_not_applicable", False),
                remark=primary.get("remark"),
                ds_remark=primary.get("ds_remark"),
                substitute_shop_1=_build_substitute(sub1, prev_price_map)
                if sub1
                else None,
                substitute_shop_2=_build_substitute(sub2, prev_price_map)
                if sub2
                else None,
            )

            shop_id = primary["shop_id"]
            if shop_id not in shops_info:
                shops_info[shop_id] = {
                    "shop_id": shop_id,
                    "shop_serial_no": primary["shop_serial_no"],
                    "shop_name": primary["shop_name"],
                    "shop_phone_number": primary["shop_phone_number"],
                    "shop_description_and_location": primary[
                        "shop_description_and_location"
                    ],
                    "general_description_of_items_sold": primary[
                        "general_description_of_items_sold"
                    ],
                }
            items_by_shop[shop_id].append(item_obj)

        sync_shops = [
            SyncShop(**info, items=items_by_shop[sid])
            for sid, info in shops_info.items()
        ]

        sync_markets.append(
            SyncMarket(
                market_id=market["market_id"],
                market_code=market["market_code"],
                selected_market=market["selected_market"],
                domain=market["domain"],
                district_name=market["district_name"],
                district_code=market["district_code"],
                village_town=market.get("village_town"),
                address=market.get("address"),
                review_remark=market.get("review_remark"),
                shops=sync_shops,
            )
        )

    return sync_markets


@router.get("", response_model=SurveyorSyncResponse)
async def surveyor_sync(
    round_id: int | None = None,
    user: dict = Depends(require_price_collector),
):
    pool = get_pool()
    surveyor_id = user["user_id"]

    async with pool.connection() as conn:
        if round_id is not None:
            round_row = await get_survey_round(conn, round_id)
            if not round_row:
                raise HTTPException(404, "Round not found")
        else:
            round_row = await get_current_round(conn)
            if not round_row:
                return SurveyorSyncResponse(
                    survey_round=None,
                    markets=[],
                    message="No active round",
                )

        rid = round_row["round_id"]

        # Bulk fetch — get_surveyor_markets already excludes SUBMITTED/APPROVED markets,
        # so a price collector only sees markets still open to them (incl. un-submitted ones).
        markets = await get_surveyor_markets(conn, surveyor_id, rid)
        setups = await get_all_setups_for_surveyor(conn, surveyor_id, rid)
        prev_prices = await get_previous_prices(conn, surveyor_id, rid)

    prev_price_map = {
        (row["item_id"], row["shop_id"]): row["previous_period_price"]
        for row in prev_prices
    }

    return SurveyorSyncResponse(
        survey_round=SyncSurveyRound(
            round_id=round_row["round_id"],
            round_number=round_row["round_number"],
            round_name=round_row["round_name"],
            round_start_date=round_row["round_start_date"],
            round_end_date=round_row["round_end_date"],
        ),
        markets=_assemble_markets(markets, setups, prev_price_map),
    )


# ── Batch price sync (POST) ──────────────────────────────────────


async def _insert_one(
    conn: psycopg.AsyncConnection, rec: SyncPriceRecord
) -> RecordResult:
    try:
        async with conn.transaction():
            cur = await conn.execute(
                """
                INSERT INTO cpi_tripura_price_data
                    (market_item_id, previous_period_price, current_period_price,
                     remark, price_recording_date, is_na, is_not_applicable)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (market_item_id)
                DO UPDATE SET
                    previous_period_price = EXCLUDED.previous_period_price,
                    current_period_price = EXCLUDED.current_period_price,
                    remark = EXCLUDED.remark,
                    price_recording_date = EXCLUDED.price_recording_date,
                    is_na = EXCLUDED.is_na,
                    is_not_applicable = EXCLUDED.is_not_applicable,
                    modified_at = CURRENT_TIMESTAMP
                RETURNING price_data_id, (xmax = 0) AS was_inserted
                """,
                [
                    rec.market_item_id,
                    rec.previous_period_price,
                    rec.current_period_price,
                    rec.remark,
                    rec.price_recording_date,
                    rec.is_na,
                    rec.is_not_applicable,
                ],
            )
            row = await cur.fetchone()
            return RecordResult(
                client_id=rec.client_id,
                status="created" if row["was_inserted"] else "updated",
                price_data_id=row["price_data_id"],
            )
    except Exception:
        return RecordResult(
            client_id=rec.client_id,
            status="error",
            detail="Unexpected error",
        )


@router.post("", response_model=BatchSyncResponse)
async def sync_prices(
    body: SyncRequest,
    user: dict = Depends(require_price_collector),
):
    pool = get_pool()
    surveyor_id = user["user_id"]

    async with pool.connection() as conn:
        round_row = await _resolve_active_round(conn, body.round_id)
        rid = round_row["round_id"]

        # Market items the surveyor is actually assigned this round. Anything outside
        # this set is a cross-market/cross-district write attempt and is rejected — the
        # upsert key (market_item_id) is client-supplied and otherwise unscoped.
        assigned = await get_assigned_market_item_ids(conn, surveyor_id, rid)

        # Records for markets that are SUBMITTED/APPROVED are locked to the price
        # collector until a supervisor un-submits them — reject those per-record.
        locked = await get_locked_market_item_ids(conn, surveyor_id, rid)

        results: list[RecordResult] = []
        for rec in body.records:
            if rec.market_item_id not in assigned:
                results.append(
                    RecordResult(
                        client_id=rec.client_id,
                        status="error",
                        detail="Market item not assigned to you",
                    )
                )
                continue
            if rec.market_item_id in locked:
                results.append(
                    RecordResult(
                        client_id=rec.client_id,
                        status="error",
                        detail="Market submitted; awaiting supervisor review",
                    )
                )
                continue
            result = await _insert_one(conn, rec)
            results.append(result)

    succeeded = sum(1 for r in results if r.status in ("created", "updated"))
    failed = sum(1 for r in results if r.status == "error")
    return BatchSyncResponse(
        total=len(results),
        succeeded=succeeded,
        failed=failed,
        results=results,
    )


# ── Submit round ──────────────────────────────────────────────────


@router.post("/submit", response_model=SubmissionResponse)
async def submit_round(
    body: SubmissionRequest,
    user: dict = Depends(require_price_collector),
):
    pool = get_pool()
    surveyor_id = user["user_id"]

    async with pool.connection() as conn, conn.transaction():
        round_row = await _resolve_active_round(conn, body.round_id)
        rid = round_row["round_id"]
        market_id = body.market_id

        if market_id is not None:
            # 404 rather than 403 so a price collector cannot probe market ids outside
            # their own assignments.
            if not await is_market_assigned_to_surveyor(
                conn, surveyor_id, rid, market_id
            ):
                raise HTTPException(404, "Market not assigned to you")

            # A missing status row means IN_PROGRESS.
            status_row = await get_market_status(conn, rid, market_id)
            if status_row and status_row["status"] in ("SUBMITTED", "APPROVED"):
                raise HTTPException(409, "Market is already submitted")

        # Completeness check — scoped to the one market when given, otherwise across
        # all of the surveyor's assigned markets.
        missing = await get_items_missing_prices(conn, surveyor_id, rid, market_id)
        if missing:
            raise HTTPException(
                422,
                detail={
                    "detail": f"{len(missing)} item(s) incomplete",
                    "missing_items": [
                        MissingPriceItem(**row).model_dump() for row in missing
                    ],
                },
            )

        # Mark the target market(s) SUBMITTED (idempotent; re-closes any market a
        # supervisor previously un-submitted).
        count = await submit_markets_for_round(conn, surveyor_id, rid, market_id)

        submitted_row = (
            await get_market_status(conn, rid, market_id)
            if market_id is not None
            else None
        )

    return SubmissionResponse(
        round_id=rid,
        surveyor_id=surveyor_id,
        markets_submitted=count,
        market_id=market_id,
        status=submitted_row["status"] if submitted_row else None,
        submitted_at=submitted_row["submitted_at"] if submitted_row else None,
    )
