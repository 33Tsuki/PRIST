import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import get_current_user, require_admin
from app.common.models import CpiDomain, PaginationParams
from app.database import get_pool
from app.master_data import queries
from app.master_data.models import (
    BulkDeleteRequest,
    BulkDeleteResponse,
    BulkDeleteResult,
    DistrictOut,
    ItemCreate,
    ItemOut,
    ItemUpdate,
    MarketCreate,
    MarketItemCreate,
    MarketItemOut,
    MarketItemUpdate,
    MarketOut,
    MarketUpdate,
    ShopCreate,
    ShopOut,
    ShopUpdate,
    SubdivisionOut,
    TehsilOut,
)

router = APIRouter(prefix="/master-data", tags=["Master Data"])


def _pagination(offset: int = Query(0, ge=0), limit: int = Query(1000, ge=1, le=10000)):
    return PaginationParams(offset=offset, limit=limit)


# ── Tehsils ──────────────────────────────────────────────────────────────────


@router.get("/tehsils", response_model=list[TehsilOut])
async def list_tehsils(
    _user: dict = Depends(get_current_user),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_tehsils(conn, pg.limit, pg.offset)
    return rows


@router.get("/tehsils/{tehsil_id}", response_model=TehsilOut)
async def get_tehsil(tehsil_id: int, _user: dict = Depends(get_current_user)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_tehsil(conn, tehsil_id)
    if not row:
        raise HTTPException(404, "Tehsil not found")
    return row


# ── Subdivisions ─────────────────────────────────────────────────────────────


@router.get("/subdivisions", response_model=list[SubdivisionOut])
async def list_subdivisions(
    _user: dict = Depends(get_current_user),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_subdivisions(conn, pg.limit, pg.offset)
    return rows


@router.get("/subdivisions/{subdivision_id}", response_model=SubdivisionOut)
async def get_subdivision(subdivision_id: int, _user: dict = Depends(get_current_user)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_subdivision(conn, subdivision_id)
    if not row:
        raise HTTPException(404, "Subdivision not found")
    return row


# ── Districts ────────────────────────────────────────────────────────────────


@router.get("/districts", response_model=list[DistrictOut])
async def list_districts(pg: PaginationParams = Depends(_pagination)):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_districts(conn, pg.limit, pg.offset)
    return rows


@router.get("/districts/{district_id}", response_model=DistrictOut)
async def get_district(district_id: int):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_district(conn, district_id)
    if not row:
        raise HTTPException(404, "District not found")
    return row


# ── Markets ──────────────────────────────────────────────────────────────────


@router.get("/markets", response_model=list[MarketOut])
async def list_markets(
    domain: CpiDomain | None = None,
    district_id: int | None = None,
    _user: dict = Depends(get_current_user),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_markets(
            conn, domain, district_id, pg.limit, pg.offset
        )
    return rows


@router.get("/markets/{market_id}", response_model=MarketOut)
async def get_market(market_id: int, _user: dict = Depends(get_current_user)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_market(conn, market_id)
    if not row:
        raise HTTPException(404, "Market not found")
    return row


@router.post("/markets", response_model=MarketOut, status_code=201)
async def create_market(body: MarketCreate, _admin: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.create_market(conn, body.model_dump(exclude_none=True))
    return row


@router.put("/markets/{market_id}", response_model=MarketOut)
async def update_market(
    market_id: int, body: MarketUpdate, _admin: dict = Depends(require_admin)
):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.update_market(
            conn, market_id, body.model_dump(exclude_none=True)
        )
    if not row:
        raise HTTPException(404, "Market not found")
    return row


@router.delete("/markets/{market_id}", status_code=204)
async def delete_market(market_id: int, _admin: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.delete_market(conn, market_id)
    if not row:
        raise HTTPException(404, "Market not found")


@router.post("/markets/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_markets(
    body: BulkDeleteRequest,
    _admin: dict = Depends(require_admin),
):
    results: list[BulkDeleteResult] = []
    pool = get_pool()
    async with pool.connection() as conn:
        for mid in body.ids:
            try:
                async with conn.transaction():
                    row = await queries.delete_market(conn, mid)
                if row:
                    results.append(BulkDeleteResult(id=mid, status="deleted"))
                else:
                    results.append(BulkDeleteResult(id=mid, status="not_found"))
            except psycopg.errors.ForeignKeyViolation:
                results.append(
                    BulkDeleteResult(
                        id=mid,
                        status="error",
                        detail="Cannot delete: market has dependent shops or items",
                    )
                )
            except Exception:
                results.append(
                    BulkDeleteResult(
                        id=mid,
                        status="error",
                        detail="Delete failed",
                    )
                )
    return BulkDeleteResponse(
        entity="market",
        total=len(results),
        deleted=sum(1 for r in results if r.status == "deleted"),
        not_found=sum(1 for r in results if r.status == "not_found"),
        errors=sum(1 for r in results if r.status == "error"),
        results=results,
    )


# ── Shops ────────────────────────────────────────────────────────────────────


@router.get("/shops", response_model=list[ShopOut])
async def list_all_shops(
    domain: CpiDomain | None = None,
    district_id: int | None = None,
    market_id: int | None = None,
    _user: dict = Depends(get_current_user),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_all_shops(
            conn, domain, district_id, market_id, pg.limit, pg.offset
        )
    return rows


@router.get("/markets/{market_id}/shops", response_model=list[ShopOut])
async def list_shops(
    market_id: int,
    _user: dict = Depends(get_current_user),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_shops(conn, market_id, pg.limit, pg.offset)
    return rows


@router.get("/shops/{shop_id}", response_model=ShopOut)
async def get_shop(shop_id: int, _user: dict = Depends(get_current_user)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_shop(conn, shop_id)
    if not row:
        raise HTTPException(404, "Shop not found")
    return row


@router.post("/markets/{market_id}/shops", response_model=ShopOut, status_code=201)
async def create_shop(
    market_id: int, body: ShopCreate, _admin: dict = Depends(require_admin)
):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.create_shop(
            conn, market_id, body.model_dump(exclude_none=True)
        )
    return row


@router.put("/shops/{shop_id}", response_model=ShopOut)
async def update_shop(
    shop_id: int, body: ShopUpdate, _admin: dict = Depends(require_admin)
):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.update_shop(
            conn, shop_id, body.model_dump(exclude_none=True)
        )
    if not row:
        raise HTTPException(404, "Shop not found")
    return row


@router.delete("/shops/{shop_id}", status_code=204)
async def delete_shop(shop_id: int, _admin: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.delete_shop(conn, shop_id)
    if not row:
        raise HTTPException(404, "Shop not found")


@router.post("/shops/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_shops(
    body: BulkDeleteRequest,
    _admin: dict = Depends(require_admin),
):
    results: list[BulkDeleteResult] = []
    pool = get_pool()
    async with pool.connection() as conn:
        for sid in body.ids:
            try:
                async with conn.transaction():
                    row = await queries.delete_shop(conn, sid)
                if row:
                    results.append(BulkDeleteResult(id=sid, status="deleted"))
                else:
                    results.append(BulkDeleteResult(id=sid, status="not_found"))
            except psycopg.errors.ForeignKeyViolation:
                results.append(
                    BulkDeleteResult(
                        id=sid,
                        status="error",
                        detail="Cannot delete: shop has dependent price collection setups",
                    )
                )
            except Exception:
                results.append(
                    BulkDeleteResult(
                        id=sid,
                        status="error",
                        detail="Delete failed",
                    )
                )
    return BulkDeleteResponse(
        entity="shop",
        total=len(results),
        deleted=sum(1 for r in results if r.status == "deleted"),
        not_found=sum(1 for r in results if r.status == "not_found"),
        errors=sum(1 for r in results if r.status == "error"),
        results=results,
    )


# ── Items ────────────────────────────────────────────────────────────────────


@router.get("/items", response_model=list[ItemOut])
async def list_items(
    search: str | None = None,
    _user: dict = Depends(get_current_user),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_items(conn, search, pg.limit, pg.offset)
    return rows


@router.get("/items/{item_id}", response_model=ItemOut)
async def get_item(item_id: int, _user: dict = Depends(get_current_user)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_item(conn, item_id)
    if not row:
        raise HTTPException(404, "Item not found")
    return row


@router.post("/items", response_model=ItemOut, status_code=201)
async def create_item(body: ItemCreate, _admin: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.create_item(conn, body.model_dump(exclude_none=True))
    return row


@router.put("/items/{item_id}", response_model=ItemOut)
async def update_item(
    item_id: int, body: ItemUpdate, _admin: dict = Depends(require_admin)
):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.update_item(
            conn, item_id, body.model_dump(exclude_none=True)
        )
    if not row:
        raise HTTPException(404, "Item not found")
    return row


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(item_id: int, _admin: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.delete_item(conn, item_id)
    if not row:
        raise HTTPException(404, "Item not found")


@router.post("/items/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_items(
    body: BulkDeleteRequest,
    _admin: dict = Depends(require_admin),
):
    results: list[BulkDeleteResult] = []
    pool = get_pool()
    async with pool.connection() as conn:
        for iid in body.ids:
            try:
                async with conn.transaction():
                    row = await queries.delete_item(conn, iid)
                if row:
                    results.append(BulkDeleteResult(id=iid, status="deleted"))
                else:
                    results.append(BulkDeleteResult(id=iid, status="not_found"))
            except psycopg.errors.ForeignKeyViolation:
                results.append(
                    BulkDeleteResult(
                        id=iid,
                        status="error",
                        detail="Cannot delete: item has dependent market items",
                    )
                )
            except Exception:
                results.append(
                    BulkDeleteResult(
                        id=iid,
                        status="error",
                        detail="Delete failed",
                    )
                )
    return BulkDeleteResponse(
        entity="item",
        total=len(results),
        deleted=sum(1 for r in results if r.status == "deleted"),
        not_found=sum(1 for r in results if r.status == "not_found"),
        errors=sum(1 for r in results if r.status == "error"),
        results=results,
    )


# ── Market Items ─────────────────────────────────────────────────────────────


@router.get("/markets/{market_id}/items", response_model=list[MarketItemOut])
async def list_market_items(
    market_id: int,
    _user: dict = Depends(get_current_user),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_market_items(conn, market_id, pg.limit, pg.offset)
    return rows


@router.get("/market-items/{market_item_id}", response_model=MarketItemOut)
async def get_market_item(market_item_id: int, _user: dict = Depends(get_current_user)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_market_item(conn, market_item_id)
    if not row:
        raise HTTPException(404, "Market item not found")
    return row


@router.post(
    "/markets/{market_id}/items", response_model=MarketItemOut, status_code=201
)
async def create_market_item(
    market_id: int, body: MarketItemCreate, _admin: dict = Depends(require_admin)
):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.create_market_item(conn, body.model_dump(exclude_none=True))
    return row


@router.put("/market-items/{market_item_id}", response_model=MarketItemOut)
async def update_market_item(
    market_item_id: int, body: MarketItemUpdate, _admin: dict = Depends(require_admin)
):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.update_market_item(
            conn, market_item_id, body.model_dump(exclude_none=True)
        )
    if not row:
        raise HTTPException(404, "Market item not found")
    return row


@router.delete("/market-items/{market_item_id}", status_code=204)
async def delete_market_item(
    market_item_id: int, _admin: dict = Depends(require_admin)
):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.delete_market_item(conn, market_item_id)
    if not row:
        raise HTTPException(404, "Market item not found")


@router.post("/market-items/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_market_items(
    body: BulkDeleteRequest,
    _admin: dict = Depends(require_admin),
):
    results: list[BulkDeleteResult] = []
    pool = get_pool()
    async with pool.connection() as conn:
        for mid in body.ids:
            try:
                async with conn.transaction():
                    row = await queries.delete_market_item(conn, mid)
                if row:
                    results.append(BulkDeleteResult(id=mid, status="deleted"))
                else:
                    results.append(BulkDeleteResult(id=mid, status="not_found"))
            except psycopg.errors.ForeignKeyViolation:
                results.append(
                    BulkDeleteResult(
                        id=mid,
                        status="error",
                        detail="Cannot delete: market item has dependent price collection setups",
                    )
                )
            except Exception:
                results.append(
                    BulkDeleteResult(
                        id=mid,
                        status="error",
                        detail="Delete failed",
                    )
                )
    return BulkDeleteResponse(
        entity="market_item",
        total=len(results),
        deleted=sum(1 for r in results if r.status == "deleted"),
        not_found=sum(1 for r in results if r.status == "not_found"),
        errors=sum(1 for r in results if r.status == "error"),
        results=results,
    )
