import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import (
    assert_market_in_scope,
    assert_pc_in_scope,
    get_current_user,
    require_admin,
    require_admin_or_supervisor,
)
from app.common.models import PaginationParams
from app.database import get_pool
from app.master_data import queries as md_queries
from app.master_data.models import (
    BulkDeleteRequest,
    BulkDeleteResponse,
    BulkDeleteResult,
)
from app.survey import guards, queries
from app.survey.models import (
    AssignmentCreate,
    AssignmentOut,
    AssignmentUpdate,
    CollectedDataItemOut,
    CollectedDataResponse,
    CollectedDataSummary,
    MarketLookupOut,
    MarketStatusOut,
    PendingItemOut,
    PriceDataCreate,
    PriceDataOut,
    RolloverResult,
    RolloverSetupsResult,
    RoundMarketSetupOut,
    RoundMarketSummaryOut,
    SetupCreate,
    SetupRemarkUpdate,
    SetupReplace,
    SetupUpdate,
    SurveyorMarketOut,
    SurveyorOut,
    SurveyRoundCreate,
    SurveyRoundOut,
    SurveyRoundUpdate,
    UnsubmitRequest,
)

router = APIRouter(prefix="/survey", tags=["Survey"])


def _pagination(offset: int = Query(0, ge=0), limit: int = Query(1000, ge=1, le=10000)):
    return PaginationParams(offset=offset, limit=limit)


@router.get("/rounds", response_model=list[SurveyRoundOut])
async def list_rounds(
    _user: dict = Depends(get_current_user),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_survey_rounds(conn, pg.limit, pg.offset)
    return rows


@router.get("/rounds/{round_id}", response_model=SurveyRoundOut)
async def get_round(round_id: int, _user: dict = Depends(get_current_user)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_survey_round(conn, round_id)
    if not row:
        raise HTTPException(404, "Survey round not found")
    return row


@router.post("/rounds", response_model=SurveyRoundOut, status_code=201)
async def create_round(body: SurveyRoundCreate, _admin: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.create_survey_round(
            conn, body.model_dump(exclude_none=True)
        )
    return row


@router.put("/rounds/{round_id}", response_model=SurveyRoundOut)
async def update_round(
    round_id: int, body: SurveyRoundUpdate, _admin: dict = Depends(require_admin)
):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.update_survey_round(
            conn, round_id, body.model_dump(exclude_none=True)
        )
    if not row:
        raise HTTPException(404, "Survey round not found")
    return row


@router.delete("/rounds/{round_id}", status_code=204)
async def delete_round(round_id: int, _admin: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.delete_survey_round(conn, round_id)
    if not row:
        raise HTTPException(404, "Survey round not found")


@router.post("/rounds/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_rounds(
    body: BulkDeleteRequest,
    _admin: dict = Depends(require_admin),
):
    results: list[BulkDeleteResult] = []
    pool = get_pool()
    async with pool.connection() as conn:
        for rid in body.ids:
            try:
                async with conn.transaction():
                    row = await queries.delete_survey_round(conn, rid)
                if row:
                    results.append(BulkDeleteResult(id=rid, status="deleted"))
                else:
                    results.append(BulkDeleteResult(id=rid, status="not_found"))
            except psycopg.errors.ForeignKeyViolation:
                results.append(
                    BulkDeleteResult(
                        id=rid,
                        status="error",
                        detail="Cannot delete: round has dependent assignments",
                    )
                )
            except Exception:
                results.append(
                    BulkDeleteResult(
                        id=rid,
                        status="error",
                        detail="Delete failed",
                    )
                )
    return BulkDeleteResponse(
        entity="survey_round",
        total=len(results),
        deleted=sum(1 for r in results if r.status == "deleted"),
        not_found=sum(1 for r in results if r.status == "not_found"),
        errors=sum(1 for r in results if r.status == "error"),
        results=results,
    )


# ── Round Setup Queries ────────────────────────────────────────────────────


# Shared with the setup ingestion router; see app/survey/guards.py.
_get_round_or_404 = guards.get_round_or_404
_assert_round_editable = guards.assert_round_editable


def _derive_market_status(round_status: str, survey_status: str | None) -> str:
    """Display status that folds the round lifecycle into the per-market survey
    status. A market that was never submitted reads as NOT_STARTED while the
    round is DRAFT and INCOMPLETE once it is CLOSED; SUBMITTED/APPROVED always
    pass through unchanged."""
    s = survey_status or "IN_PROGRESS"
    if s in ("SUBMITTED", "APPROVED"):
        return s
    if round_status == "DRAFT":
        return "NOT_STARTED"
    if round_status == "CLOSED":
        return "INCOMPLETE"
    return s  # ACTIVE → IN_PROGRESS


# ── Round lifecycle: start / end ────────────────────────────────────────────


@router.post("/rounds/{round_id}/start", response_model=SurveyRoundOut)
async def start_round(round_id: int, _admin: dict = Depends(require_admin)):
    """Begin collection for a round (DRAFT/CLOSED → ACTIVE). At most one round may be
    ACTIVE per cycle; this is the 'current' round price collectors sync against."""
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        await _get_round_or_404(conn, round_id)
        row = await queries.start_round(conn, round_id)
    if not row:
        raise HTTPException(409, "Another round is already active in this cycle")
    return row


@router.post("/rounds/{round_id}/end", response_model=SurveyRoundOut)
async def end_round(round_id: int, _admin: dict = Depends(require_admin)):
    """End collection for a round (ACTIVE → CLOSED), stamping the actual end date."""
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        await _get_round_or_404(conn, round_id)
        row = await queries.end_round(conn, round_id)
    if not row:
        raise HTTPException(409, "Round is not active (must be ACTIVE to end)")
    return row


@router.get(
    "/rounds/{round_id}/markets",
    response_model=list[RoundMarketSummaryOut],
)
async def list_round_markets(
    round_id: int,
    user: dict = Depends(require_admin_or_supervisor),
):
    # District supervisors see only their own district's markets; admins see all.
    district_id = user["district_id"] if user["role"] == "DISTRICT_SUPERVISOR" else None
    pool = get_pool()
    async with pool.connection() as conn:
        round_row = await _get_round_or_404(conn, round_id)
        rows = await queries.list_markets_by_round(conn, round_id, district_id)
    for r in rows:
        r["round_status"] = round_row["round_status"]
        r["status"] = _derive_market_status(round_row["round_status"], r["status"])
    return rows


@router.get(
    "/rounds/{round_id}/pending-items",
    response_model=list[PendingItemOut],
)
async def list_round_pending_items(
    round_id: int,
    district_id: int | None = Query(None, description="Scope to a single district"),
    user: dict = Depends(require_admin_or_supervisor),
):
    """Items still awaiting a price across a round, one row per (market, item). A
    supervisor is pinned to their own district regardless of the query param."""
    if user["role"] == "DISTRICT_SUPERVISOR":
        district_id = user["district_id"]
    pool = get_pool()
    async with pool.connection() as conn:
        await _get_round_or_404(conn, round_id)
        rows = await queries.list_pending_items_by_round(conn, round_id, district_id)
    return rows


@router.get(
    "/rounds/{round_id}/markets/{market_id}/setups",
    response_model=list[RoundMarketSetupOut],
)
async def list_round_market_setups(
    round_id: int,
    market_id: int,
    user: dict = Depends(require_admin_or_supervisor),
):
    pool = get_pool()
    async with pool.connection() as conn:
        await _get_round_or_404(conn, round_id)
        # A supervisor may only read setups for markets in their own district.
        await assert_market_in_scope(conn, user, market_id)
        rows = await queries.list_setups_by_round_market(conn, round_id, market_id)
    return rows


def _entry_market_item_fields(entry) -> dict:
    """Collect the market_item columns set on a setup shop entry. The three are
    independent: market_item_description is the item's locally reported name, never
    derived from the product specification nor from the master item name."""
    mi_data: dict = {}
    if entry.unit_of_sale is not None:
        mi_data["unit_of_sale"] = entry.unit_of_sale
    if entry.product_specification is not None:
        mi_data["product_specification"] = entry.product_specification
    if entry.market_item_description is not None:
        mi_data["market_item_description"] = entry.market_item_description
    return mi_data


async def _upsert_setup_market_item(conn, setup_row, entry, item_id, round_id):
    """Persist a setup entry's market_item fields: update the existing market_item
    in place (preserving any price_data linkage) or create one. A new market_item
    needs a unit_of_sale (NOT NULL), so creation is skipped when none is given."""
    mi_data = _entry_market_item_fields(entry)
    if not mi_data:
        return setup_row
    if setup_row["market_item_id"]:
        await md_queries.update_market_item(conn, setup_row["market_item_id"], mi_data)
    elif entry.unit_of_sale is not None:
        mi_data.update(
            {"item_id": item_id, "shop_id": entry.shop_id, "round_id": round_id}
        )
        await md_queries.create_market_item(conn, mi_data)
    else:
        return setup_row
    return await queries.get_setup(conn, setup_row["setup_id"])


@router.post("/setups", response_model=list[RoundMarketSetupOut], status_code=201)
async def create_setup(
    body: SetupCreate,
    user: dict = Depends(require_admin_or_supervisor),
):
    entries = [
        (body.originally_selected, "ORIGINALLY SELECTED"),
        (body.substitute_1, "SUBSTITUTE 1"),
        (body.substitute_2, "SUBSTITUTE 2"),
    ]
    results = []
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        await _assert_round_editable(conn, body.round_id)
        # Supervisors may only act within their own district's markets.
        shop = await md_queries.get_shop(conn, body.originally_selected.shop_id)
        if not shop:
            raise HTTPException(404, "Originally selected shop not found")
        await assert_market_in_scope(conn, user, shop["market_id"])

        for entry, status in entries:
            if entry is None:
                continue
            data = {
                "item_id": body.item_id,
                "round_id": body.round_id,
                "shop_id": entry.shop_id,
                "shop_selection_status": status,
            }
            if entry.item_availability_code is not None:
                data["item_availability_code"] = entry.item_availability_code
            if entry.remark is not None:
                data["remark"] = entry.remark
            row = await queries.create_setup(conn, data)
            row = await _upsert_setup_market_item(
                conn, row, entry, body.item_id, body.round_id
            )
            results.append(row)
    return results


@router.put("/setups/{setup_id}", response_model=RoundMarketSetupOut)
async def update_setup(
    setup_id: int,
    body: SetupUpdate,
    user: dict = Depends(require_admin_or_supervisor),
):
    pool = get_pool()
    mi_fields = {"unit_of_sale", "product_specification", "market_item_description"}
    body_dict = body.model_dump(exclude_none=True)
    setup_data = {k: v for k, v in body_dict.items() if k not in mi_fields}
    mi_data = {k: v for k, v in body_dict.items() if k in mi_fields}

    async with pool.connection() as conn, conn.transaction():
        existing = await queries.get_setup(conn, setup_id)
        if not existing:
            raise HTTPException(404, "Setup not found")
        await _assert_round_editable(conn, existing["round_id"])
        # Supervisors may only edit setups in their own district's markets.
        if user["role"] != "ADMIN":
            await assert_market_in_scope(conn, user, existing["market_id"])

        row = await queries.update_setup(conn, setup_id, setup_data)
        if not row:
            raise HTTPException(404, "Setup not found")

        if mi_data:
            if row["market_item_id"]:
                await md_queries.update_market_item(
                    conn, row["market_item_id"], mi_data
                )
            else:
                mi_data.update(
                    {
                        "item_id": row["item_id"],
                        "shop_id": row["shop_id"],
                        "round_id": row["round_id"],
                    }
                )
                await md_queries.create_market_item(conn, mi_data)
            row = await queries.get_setup(conn, setup_id)
    return row


@router.put("/setups/{setup_id}/remark", response_model=RoundMarketSetupOut)
async def update_setup_remark(
    setup_id: int,
    body: SetupRemarkUpdate,
    user: dict = Depends(require_admin_or_supervisor),
):
    """Set or clear the DS remark on a single setup row.

    Kept separate from PUT /setups/{setup_id}: that route drops None fields
    (exclude_none) and its SetupUpdate validator rejects an all-None body, so it
    cannot express "clear the remark"."""
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        existing = await queries.get_setup(conn, setup_id)
        if not existing:
            raise HTTPException(404, "Setup not found")
        await _assert_round_editable(conn, existing["round_id"])
        await assert_market_in_scope(conn, user, existing["market_id"])

        row = await queries.update_setup(
            conn, setup_id, {"remark": body.remark or None}
        )
    if not row:
        raise HTTPException(404, "Setup not found")
    return row


@router.delete("/setups/{setup_id}", status_code=204)
async def delete_setup(setup_id: int, _admin: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        existing = await queries.get_setup(conn, setup_id)
        if not existing:
            raise HTTPException(404, "Setup not found")
        await _assert_round_editable(conn, existing["round_id"])
        await queries.delete_setup(conn, setup_id)


@router.put(
    "/rounds/{round_id}/markets/{market_id}/items/{item_id}/setup",
    response_model=list[RoundMarketSetupOut],
)
async def replace_item_setup(
    round_id: int,
    market_id: int,
    item_id: int,
    body: SetupReplace,
    user: dict = Depends(require_admin_or_supervisor),
):
    """Replace an item's whole setup (all shop slots) within a round + market."""
    entries = [
        (body.originally_selected, "ORIGINALLY SELECTED"),
        (body.substitute_1, "SUBSTITUTE 1"),
        (body.substitute_2, "SUBSTITUTE 2"),
    ]
    keep_shop_ids = [e.shop_id for e, _ in entries if e is not None]
    results = []
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        await _assert_round_editable(conn, round_id)
        await assert_market_in_scope(conn, user, market_id)

        await queries.delete_setups_for_item(conn, round_id, market_id, item_id)

        for entry, status in entries:
            if entry is None:
                continue
            data = {
                "item_id": item_id,
                "round_id": round_id,
                "shop_id": entry.shop_id,
                "shop_selection_status": status,
            }
            if entry.item_availability_code is not None:
                data["item_availability_code"] = entry.item_availability_code
            if entry.remark is not None:
                data["remark"] = entry.remark
            row = await queries.create_setup(conn, data)
            row = await _upsert_setup_market_item(conn, row, entry, item_id, round_id)
            results.append(row)

        # Drop market_items for shops no longer selected that have no collected prices.
        await queries.cleanup_orphan_market_items(
            conn, round_id, market_id, item_id, keep_shop_ids
        )
    return results


@router.delete(
    "/rounds/{round_id}/markets/{market_id}/items/{item_id}/setup",
    status_code=204,
)
async def delete_item_setup(
    round_id: int,
    market_id: int,
    item_id: int,
    user: dict = Depends(require_admin_or_supervisor),
):
    """Delete an item's whole setup (all shop slots) within a round + market."""
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        await _assert_round_editable(conn, round_id)
        await assert_market_in_scope(conn, user, market_id)
        deleted = await queries.delete_setups_for_item(
            conn, round_id, market_id, item_id
        )
        if not deleted:
            raise HTTPException(404, "Setup not found")
        await queries.cleanup_orphan_market_items(
            conn, round_id, market_id, item_id, []
        )


@router.post(
    "/rounds/{round_id}/markets/{market_id}/items/bulk-delete",
    response_model=BulkDeleteResponse,
)
async def bulk_delete_item_setups(
    round_id: int,
    market_id: int,
    body: BulkDeleteRequest,
    user: dict = Depends(require_admin_or_supervisor),
):
    """Delete the whole setup of several items (by item_id) within a round + market."""
    results: list[BulkDeleteResult] = []
    pool = get_pool()
    async with pool.connection() as conn:
        await _assert_round_editable(conn, round_id)
        await assert_market_in_scope(conn, user, market_id)
        for item_id in body.ids:
            try:
                async with conn.transaction():
                    deleted = await queries.delete_setups_for_item(
                        conn, round_id, market_id, item_id
                    )
                    if deleted:
                        await queries.cleanup_orphan_market_items(
                            conn, round_id, market_id, item_id, []
                        )
                        results.append(BulkDeleteResult(id=item_id, status="deleted"))
                    else:
                        results.append(BulkDeleteResult(id=item_id, status="not_found"))
            except Exception:
                results.append(
                    BulkDeleteResult(id=item_id, status="error", detail="Delete failed")
                )
    return BulkDeleteResponse(
        entity="market_setup",
        total=len(results),
        deleted=sum(1 for r in results if r.status == "deleted"),
        not_found=sum(1 for r in results if r.status == "not_found"),
        errors=sum(1 for r in results if r.status == "error"),
        results=results,
    )


@router.get(
    "/rounds/{round_id}/markets/{market_id}/collected-data",
    response_model=CollectedDataResponse,
)
async def list_round_market_collected_data(
    round_id: int,
    market_id: int,
    user: dict = Depends(require_admin_or_supervisor),
):
    pool = get_pool()
    async with pool.connection() as conn:
        round_row = await _get_round_or_404(conn, round_id)
        await assert_market_in_scope(conn, user, market_id)
        rows = await queries.list_collected_data_by_round_market(
            conn, round_id, market_id
        )
        status_row = await queries.get_market_status(conn, round_id, market_id)
        surveyor_row = await queries.get_market_surveyor(conn, round_id, market_id)

    raw_status = status_row["status"] if status_row else "IN_PROGRESS"
    status = _derive_market_status(round_row["round_status"], raw_status)
    # Item-level tally: an item is collected if ANY of its shop-setups has a price
    # or is flagged NA / not-applicable (a not-applicable item has no substitute data).
    item_done: dict[int, bool] = {}
    for r in rows:
        done = (
            r["current_period_price"] is not None
            or r["is_na"] is True
            or r["is_not_applicable"] is True
        )
        item_done[r["item_id"]] = item_done.get(r["item_id"], False) or done
    total = len(item_done)
    collected = sum(1 for v in item_done.values() if v)
    return CollectedDataResponse(
        summary=CollectedDataSummary(
            total_items=total,
            collected_count=collected,
            pending_count=total - collected,
            status=status,
            round_status=round_row["round_status"],
            is_submitted=raw_status in ("SUBMITTED", "APPROVED"),
            alert_count=sum(1 for r in rows if r["price_alert"]),
            submitted_at=status_row["submitted_at"] if status_row else None,
            submitted_by=status_row["submitted_by"] if status_row else None,
            submitted_by_name=status_row["submitted_by_name"] if status_row else None,
            surveyor_id=surveyor_row["surveyor_id"] if surveyor_row else None,
            surveyor_name=surveyor_row["surveyor_name"] if surveyor_row else None,
            surveyor_phone=surveyor_row["surveyor_phone"] if surveyor_row else None,
        ),
        items=[CollectedDataItemOut(**r) for r in rows],
    )


# ── Approval workflow (district supervisor / admin) ─────────────────


@router.post(
    "/rounds/{round_id}/markets/{market_id}/approve",
    response_model=MarketStatusOut,
)
async def approve_market_survey(
    round_id: int,
    market_id: int,
    user: dict = Depends(require_admin_or_supervisor),
):
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        await _get_round_or_404(conn, round_id)
        await assert_market_in_scope(conn, user, market_id)
        row = await queries.approve_market(conn, round_id, market_id, user["user_id"])
    if not row:
        raise HTTPException(409, "Market is not awaiting approval (must be SUBMITTED)")
    return row


@router.post(
    "/rounds/{round_id}/markets/{market_id}/unsubmit",
    response_model=MarketStatusOut,
)
async def unsubmit_market_survey(
    round_id: int,
    market_id: int,
    body: UnsubmitRequest | None = None,
    user: dict = Depends(require_admin_or_supervisor),
):
    remark = body.review_remark if body else None
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        await _get_round_or_404(conn, round_id)
        await assert_market_in_scope(conn, user, market_id)
        row = await queries.unsubmit_market(
            conn, round_id, market_id, user["user_id"], remark
        )
    if not row:
        raise HTTPException(
            409, "Market has nothing to un-submit (not SUBMITTED or APPROVED)"
        )
    return row


@router.post(
    "/rounds/{round_id}/rollover-assignments",
    response_model=RolloverResult,
)
async def rollover_round_assignments(
    round_id: int,
    from_round_id: int | None = Query(default=None, ge=1),
    user: dict = Depends(require_admin_or_supervisor),
):
    # Supervisors roll over only their own district; admins roll over globally.
    district_id = user["district_id"] if user["role"] == "DISTRICT_SUPERVISOR" else None
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        target = await queries.get_survey_round(conn, round_id)
        if not target:
            raise HTTPException(404, "Target round not found")
        if target["round_status"] == "CLOSED":
            raise HTTPException(
                409, "Round is closed; assignments and setups cannot be changed"
            )

        if from_round_id is not None:
            source = await queries.get_survey_round(conn, from_round_id)
            if not source:
                raise HTTPException(404, "Source round not found")
        else:
            source = await queries.get_previous_round(conn, round_id)
            if not source:
                raise HTTPException(404, "No previous round found to rollover from")

        count = await queries.rollover_assignments(
            conn, round_id, source["round_id"], district_id
        )

    return RolloverResult(
        target_round_id=round_id,
        source_round_id=source["round_id"],
        assignments_copied=count,
    )


@router.post(
    "/rounds/{round_id}/rollover-setups",
    response_model=RolloverSetupsResult,
)
async def rollover_round_setups(
    round_id: int,
    from_round_id: int | None = Query(default=None, ge=1),
    user: dict = Depends(require_admin_or_supervisor),
):
    # Supervisors roll over only their own district; admins roll over globally.
    district_id = user["district_id"] if user["role"] == "DISTRICT_SUPERVISOR" else None
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        target = await queries.get_survey_round(conn, round_id)
        if not target:
            raise HTTPException(404, "Target round not found")
        if target["round_status"] == "CLOSED":
            raise HTTPException(
                409, "Round is closed; assignments and setups cannot be changed"
            )

        if from_round_id is not None:
            source = await queries.get_survey_round(conn, from_round_id)
            if not source:
                raise HTTPException(404, "Source round not found")
        else:
            source = await queries.get_previous_round(conn, round_id)
            if not source:
                raise HTTPException(404, "No previous round found to rollover from")

        prev_round = await queries.get_previous_round(conn, round_id)
        is_adjacent = (
            prev_round is not None and prev_round["round_id"] == source["round_id"]
        )

        count = await queries.rollover_setups(
            conn, round_id, source["round_id"], district_id
        )
        mi_count = await queries.rollover_market_items(
            conn, round_id, source["round_id"], district_id
        )
        pd_count = 0
        if is_adjacent:
            pd_count = await queries.rollover_price_data(
                conn, round_id, source["round_id"], district_id
            )

    return RolloverSetupsResult(
        target_round_id=round_id,
        source_round_id=source["round_id"],
        setups_copied=count,
        market_items_copied=mi_count,
        price_data_created=pd_count,
    )


# ── Assignment endpoints ────────────────────────────────────────────


@router.get("/assignments/{round_id}", response_model=list[AssignmentOut])
async def get_assignments(
    round_id: int, user: dict = Depends(require_admin_or_supervisor)
):
    district_id = user["district_id"] if user["role"] == "DISTRICT_SUPERVISOR" else None
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_assignments_by_round(conn, round_id, district_id)
    return rows


@router.post("/assignments", response_model=AssignmentOut, status_code=201)
async def create_assignment(
    body: AssignmentCreate, user: dict = Depends(require_admin_or_supervisor)
):
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        await _assert_round_editable(conn, body.round_id)
        # Supervisors may only assign their own district's price collectors and markets.
        await assert_pc_in_scope(conn, user, body.surveyor_id)
        await assert_market_in_scope(conn, user, body.market_id)
        # Surveyor and market must share a district (enforced for admins too, whose
        # scope guards above are no-ops).
        if not await queries.surveyor_market_same_district(
            conn, body.surveyor_id, body.market_id
        ):
            raise HTTPException(
                422, "Surveyor and market belong to different districts"
            )
        row = await queries.create_assignment(conn, body.model_dump())
    return row


@router.put("/assignments/{assignment_id}", response_model=AssignmentOut)
async def update_assignment(
    assignment_id: int,
    body: AssignmentUpdate,
    user: dict = Depends(require_admin_or_supervisor),
):
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        existing = await queries.get_assignment(conn, assignment_id)
        if not existing:
            raise HTTPException(404, "Assignment not found")
        # Cannot reassign within a closed round, nor move an assignment into one.
        await _assert_round_editable(conn, existing["round_id"])
        if body.round_id is not None:
            await _assert_round_editable(conn, body.round_id)
        # The assignment being reassigned must be in the supervisor's district, and so
        # must any new price collector / market it is being pointed at.
        await assert_market_in_scope(conn, user, existing["market_id"])
        if body.surveyor_id is not None:
            await assert_pc_in_scope(conn, user, body.surveyor_id)
        if body.market_id is not None:
            await assert_market_in_scope(conn, user, body.market_id)
        # The resulting surveyor/market pair must still share a district.
        effective_surveyor = (
            body.surveyor_id
            if body.surveyor_id is not None
            else existing["surveyor_id"]
        )
        effective_market = (
            body.market_id if body.market_id is not None else existing["market_id"]
        )
        if not await queries.surveyor_market_same_district(
            conn, effective_surveyor, effective_market
        ):
            raise HTTPException(
                422, "Surveyor and market belong to different districts"
            )
        row = await queries.update_assignment(
            conn, assignment_id, body.model_dump(exclude_none=True)
        )
    if not row:
        raise HTTPException(404, "Assignment not found")
    return row


@router.delete("/assignments/{assignment_id}", status_code=204)
async def delete_assignment(
    assignment_id: int, user: dict = Depends(require_admin_or_supervisor)
):
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        existing = await queries.get_assignment(conn, assignment_id)
        if not existing:
            raise HTTPException(404, "Assignment not found")
        await _assert_round_editable(conn, existing["round_id"])
        await assert_market_in_scope(conn, user, existing["market_id"])
        row = await queries.delete_assignment(conn, assignment_id)
    if not row:
        raise HTTPException(404, "Assignment not found")


@router.get("/surveyor/markets/{surveyor_id}", response_model=list[SurveyorMarketOut])
async def get_surveyor_markets(
    surveyor_id: int,
    round_id: int | None = Query(default=None, ge=1),
    _admin: dict = Depends(require_admin),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_markets_for_surveyor(conn, surveyor_id, round_id)
    return rows


@router.get("/surveyors", response_model=list[SurveyorOut])
async def get_surveyors(_admin: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_surveyors(conn)
    return rows


@router.get("/markets", response_model=list[MarketLookupOut])
async def get_markets(_admin: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_markets(conn)
    return rows


# ── Price data endpoint ────────────────────────────────────────────


@router.post("/price-data", response_model=PriceDataOut, status_code=201)
async def create_price_data(
    body: PriceDataCreate,
    _admin: dict = Depends(require_admin),
):
    pool = get_pool()
    async with pool.connection() as conn, conn.transaction():
        data = body.model_dump(exclude_none=True)
        surveyor_id = data.pop("surveyor_id", None)
        if surveyor_id:
            can_submit = await queries.verify_surveyor_can_submit(
                conn,
                surveyor_id,
                data["market_item_id"],
            )
            if not can_submit:
                raise HTTPException(
                    403,
                    "Surveyor is not assigned to this market item",
                )
        row = await queries.upsert_price_data(conn, data)
    return row
