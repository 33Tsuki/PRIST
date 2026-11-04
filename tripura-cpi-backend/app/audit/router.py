from datetime import datetime

from fastapi import APIRouter, Depends, Query

from app.audit import queries
from app.audit.models import AuditLogOut
from app.auth.dependencies import require_admin
from app.common.models import PaginationParams
from app.database import get_pool

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


def _pagination(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=1000)):
    return PaginationParams(offset=offset, limit=limit)


@router.get("", response_model=list[AuditLogOut])
async def list_audit_logs(
    user_id: int | None = None,
    username: str | None = None,
    action: str | None = None,
    method: str | None = None,
    status_code: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    _admin: dict = Depends(require_admin),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_audit_logs(
            conn,
            user_id,
            username,
            action,
            method,
            status_code,
            date_from,
            date_to,
            pg.limit,
            pg.offset,
        )
    return rows
