from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError
from psycopg import AsyncConnection

from app.auth import queries
from app.auth.security import decode_token
from app.database import get_pool
from app.logger import logger

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    token: str | None = None
    if credentials:
        token = credentials.credentials
    else:
        token = request.cookies.get("access_token")
    cookies_present = list(request.cookies.keys())
    logger.debug(
        "get_current_user: cookies=%s, has_access_token=%s",
        cookies_present,
        token is not None,
    )
    if not token:
        logger.warning(
            "Auth failed: no access_token cookie in request to %s", request.url.path
        )
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(token)
        logger.debug(
            "Token decoded: user_id=%s, type=%s",
            payload.get("sub"),
            payload.get("type"),
        )
    except ExpiredSignatureError:
        logger.warning("Auth failed: expired token for %s", request.url.path)
        raise HTTPException(401, "Token expired")
    except JWTError as exc:
        logger.warning("Auth failed: invalid token for %s — %s", request.url.path, exc)
        raise HTTPException(401, "Invalid token")
    if payload.get("type") != "access":
        logger.warning("Auth failed: wrong token type '%s'", payload.get("type"))
        raise HTTPException(401, "Invalid token type")

    user_id = int(payload["sub"])
    pool = get_pool()
    async with pool.connection() as conn:
        user = await queries.get_user(conn, user_id)
    if not user:
        logger.warning("Auth failed: user_id=%s not found in DB", payload["sub"])
        raise HTTPException(401, "User not found")
    if not user["is_active"]:
        logger.warning("Auth failed: user '%s' is deactivated", user["username"])
        raise HTTPException(401, "User is deactivated")
    logger.debug("Authenticated user '%s' (role=%s)", user["username"], user["role"])
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "ADMIN":
        logger.warning(
            "Admin check failed: user '%s' has role '%s'",
            user["username"],
            user["role"],
        )
        raise HTTPException(403, "Admin access required")
    return user


async def require_price_collector(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "PRICE_COLLECTOR":
        logger.warning(
            "Price collector check failed: user '%s' has role '%s'",
            user["username"],
            user["role"],
        )
        raise HTTPException(403, "Price collector access required")
    return user


async def require_supervisor(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "DISTRICT_SUPERVISOR":
        logger.warning(
            "Supervisor check failed: user '%s' has role '%s'",
            user["username"],
            user["role"],
        )
        raise HTTPException(403, "Supervisor access required")
    return user


async def require_admin_or_supervisor(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("ADMIN", "DISTRICT_SUPERVISOR"):
        logger.warning(
            "Admin/supervisor check failed: user '%s' has role '%s'",
            user["username"],
            user["role"],
        )
        raise HTTPException(403, "Admin or supervisor access required")
    return user


# ── District scope guards ────────────────────────────────────────────────────
# No-ops for admins (global access); for district supervisors they enforce that the
# target market / price collector belongs to the supervisor's own district.


async def assert_market_in_scope(
    conn: AsyncConnection, user: dict, market_id: int
) -> None:
    if user["role"] == "ADMIN":
        return
    cur = await conn.execute(
        "SELECT district_id FROM cpi_tripura_market WHERE market_id = %s",
        [market_id],
    )
    row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Market not found")
    if row["district_id"] != user["district_id"]:
        raise HTTPException(403, "Market is outside your district")


async def assert_pc_in_scope(
    conn: AsyncConnection, user: dict, pc_user_id: int
) -> None:
    if user["role"] == "ADMIN":
        return
    cur = await conn.execute(
        "SELECT user_role, district_id FROM cpi_tripura_user WHERE user_id = %s",
        [pc_user_id],
    )
    row = await cur.fetchone()
    if not row or row["user_role"] != "PRICE_COLLECTOR":
        raise HTTPException(404, "Price collector not found")
    if row["district_id"] != user["district_id"]:
        raise HTTPException(403, "Price collector is outside your district")
