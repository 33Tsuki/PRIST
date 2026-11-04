from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from jose import ExpiredSignatureError, JWTError

from app.auth import queries
from app.auth.dependencies import (
    assert_pc_in_scope,
    get_current_user,
    require_admin,
    require_admin_or_supervisor,
    require_supervisor,
)
from app.auth.models import (
    AdminCreate,
    AdminUpdate,
    LoginRequest,
    PasswordChange,
    RefreshRequest,
    SupervisorCreate,
    SupervisorMarketOut,
    SupervisorUpdate,
    SurveyorCreate,
    SurveyorLoginResponse,
    SurveyorPublicOut,
    SurveyorUpdate,
    UserOut,
)
from app.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.common.models import PaginationParams
from app.config import settings
from app.database import get_pool
from app.logger import logger
from app.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["Auth"])

# Roles that authenticate via the web client (shared admin login route).
_WEB_ROLES = ("ADMIN", "DISTRICT_SUPERVISOR")


def _cookie_kwargs(request: Request) -> dict:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return {
        "httponly": True,
        "samesite": "lax",
        "secure": proto == "https",
    }


def _pagination(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)):
    return PaginationParams(offset=offset, limit=limit)


# ── Auth ────────────────────────────────────────────────────────────────────


def _issue_session(request: Request, user: dict) -> JSONResponse:
    access = create_access_token(user["user_id"], user["role"])
    refresh = create_refresh_token(user["user_id"], user["role"])
    cookie_kw = _cookie_kwargs(request)
    response = JSONResponse(content={"message": "Login successful"})
    response.set_cookie(
        "access_token",
        access,
        max_age=settings.access_token_expiry_minutes * 60,
        **cookie_kw,
    )
    response.set_cookie(
        "refresh_token",
        refresh,
        max_age=settings.refresh_token_expiry_days * 86400,
        **cookie_kw,
    )
    logger.info(
        "Login successful for user '%s' (user_id=%s, role=%s)",
        user["username"],
        user["user_id"],
        user["role"],
    )
    return response


@router.post("/admin/login")
@limiter.limit(settings.rate_limit_auth)
async def admin_login(request: Request, body: LoginRequest):
    """Web client login — admins and district supervisors."""
    logger.info("Web login attempt for username='%s'", body.username)
    pool = get_pool()
    async with pool.connection() as conn:
        user = await queries.get_user_by_username(conn, body.username)
    if not user or user["role"] not in _WEB_ROLES:
        logger.warning(
            "Web login failed: invalid credentials for username='%s'", body.username
        )
        raise HTTPException(401, "Invalid username or password")
    if not user["password_hash"] or not await verify_password(
        body.password, user["password_hash"]
    ):
        logger.warning(
            "Web login failed: invalid credentials for username='%s'", body.username
        )
        raise HTTPException(401, "Invalid username or password")
    if not user["is_active"]:
        logger.warning("Web login failed: '%s' is deactivated", body.username)
        raise HTTPException(401, "User is deactivated")
    return _issue_session(request, user)


@router.post("/surveyor/login", response_model=SurveyorLoginResponse)
@limiter.limit(settings.rate_limit_auth)
async def surveyor_login(request: Request, body: LoginRequest):
    """Android app login — price collectors only."""
    logger.info("Price collector login attempt for username='%s'", body.username)
    pool = get_pool()
    async with pool.connection() as conn:
        user = await queries.get_user_by_username(conn, body.username)
    if not user or user["role"] != "PRICE_COLLECTOR":
        logger.warning(
            "Price collector login failed: unknown username='%s'", body.username
        )
        raise HTTPException(401, "Invalid username or password")
    if not user["password_hash"]:
        logger.warning(
            "Price collector login failed: no password set for username='%s'",
            body.username,
        )
        raise HTTPException(401, "Password not set; contact admin")
    if not await verify_password(body.password, user["password_hash"]):
        logger.warning(
            "Price collector login failed: invalid credentials for username='%s'",
            body.username,
        )
        raise HTTPException(401, "Invalid username or password")
    if not user["is_active"]:
        logger.warning(
            "Price collector login failed: '%s' is deactivated", body.username
        )
        raise HTTPException(401, "User is deactivated")
    logger.info(
        "Price collector login successful for '%s' (user_id=%s)",
        user["username"],
        user["user_id"],
    )
    return SurveyorLoginResponse(
        access_token=create_access_token(user["user_id"], user["role"]),
        refresh_token=create_refresh_token(user["user_id"], user["role"]),
        user_id=user["user_id"],
        username=user["username"],
        full_name=user["full_name"],
        phone=user["phone"],
        email=user["email"],
        district_id=user["district_id"],
        district_name=user["district_name"],
        district_code=user["district_code"],
        role=user["role"],
    )


@router.get("/surveyors/public", response_model=list[SurveyorPublicOut])
async def list_surveyors_public(district_id: int = Query(..., gt=0)):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_surveyors_public(conn, district_id)
    return rows


@router.post("/refresh")
async def refresh(request: Request, body: RefreshRequest | None = None):
    token = body.refresh_token if body and body.refresh_token else None
    if not token:
        token = request.cookies.get("refresh_token")
    logger.debug("Refresh attempt: has_refresh_token=%s", token is not None)
    if not token:
        logger.warning("Refresh failed: no refresh token")
        raise HTTPException(401, "No refresh token")
    try:
        payload = decode_token(token)
    except ExpiredSignatureError:
        logger.warning("Refresh failed: expired refresh token")
        raise HTTPException(401, "Refresh token expired")
    except JWTError as exc:
        logger.warning("Refresh failed: invalid refresh token — %s", exc)
        raise HTTPException(401, "Invalid refresh token")
    if payload.get("type") != "refresh":
        logger.warning("Refresh failed: wrong token type '%s'", payload.get("type"))
        raise HTTPException(401, "Invalid token type")

    user_id = int(payload["sub"])
    pool = get_pool()
    async with pool.connection() as conn:
        user = await queries.get_user(conn, user_id)
    if not user or not user["is_active"]:
        logger.warning(
            "Refresh failed: user_id=%s not found or deactivated", payload["sub"]
        )
        raise HTTPException(401, "User not found or deactivated")
    access = create_access_token(user["user_id"], user["role"])
    response = JSONResponse(
        content={"message": "Token refreshed", "access_token": access}
    )
    response.set_cookie(
        "access_token",
        access,
        max_age=settings.access_token_expiry_minutes * 60,
        **_cookie_kwargs(request),
    )
    logger.info("Token refreshed for user '%s'", user["username"])
    return response


@router.post("/logout")
async def logout():
    logger.info("User logged out")
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return response


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/me/password")
async def change_password(body: PasswordChange, user: dict = Depends(get_current_user)):
    if not await verify_password(body.current_password, user["password_hash"]):
        # 403, not 401: caller is already authenticated (valid token) — this is a
        # refused action, not a session failure, so it must not trigger the
        # frontend's blanket refresh-on-401 interceptor.
        raise HTTPException(403, "Current password is incorrect")
    pool = get_pool()
    async with pool.connection() as conn:
        await queries.update_user(
            conn,
            user["user_id"],
            {"password_hash": await hash_password(body.new_password)},
            user["role"],
        )
    return {"message": "Password updated"}


# ── Admin Management (admin-only) ──────────────────────────────────────────


@router.get("/admins", response_model=list[UserOut])
async def list_admins(
    _: dict = Depends(require_admin),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_admins(conn, pg.limit, pg.offset)
    return rows


@router.get("/admins/{admin_id}", response_model=UserOut)
async def get_admin(admin_id: int, _: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_user_in_role(conn, admin_id, "ADMIN")
    if not row:
        raise HTTPException(404, "Admin not found")
    return row


@router.post("/admins", response_model=UserOut, status_code=201)
async def create_admin(body: AdminCreate, _: dict = Depends(require_admin)):
    data = {
        "username": body.username,
        "password_hash": await hash_password(body.password),
    }
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.create_admin(conn, data)
    return row


@router.put("/admins/{admin_id}", response_model=UserOut)
async def update_admin(
    admin_id: int, body: AdminUpdate, _: dict = Depends(require_admin)
):
    data = body.model_dump(exclude_none=True)
    if "password" in data:
        data["password_hash"] = await hash_password(data.pop("password"))
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.update_user(conn, admin_id, data, "ADMIN")
    if not row:
        raise HTTPException(404, "Admin not found")
    return row


@router.delete("/admins/{admin_id}", status_code=204)
async def delete_admin(admin_id: int, _: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.delete_user(conn, admin_id, "ADMIN")
    if not row:
        raise HTTPException(404, "Admin not found")


# ── Supervisor Management (admin-only) ─────────────────────────────────────


@router.get("/supervisors", response_model=list[UserOut])
async def list_supervisors(
    _: dict = Depends(require_admin),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_supervisors(conn, pg.limit, pg.offset)
    return rows


@router.get("/supervisors/{supervisor_id}", response_model=UserOut)
async def get_supervisor(supervisor_id: int, _: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_user_in_role(conn, supervisor_id, "DISTRICT_SUPERVISOR")
    if not row:
        raise HTTPException(404, "Supervisor not found")
    return row


@router.post("/supervisors", response_model=UserOut, status_code=201)
async def create_supervisor(body: SupervisorCreate, _: dict = Depends(require_admin)):
    data = body.model_dump()
    data["password_hash"] = await hash_password(data.pop("password"))
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.create_supervisor(conn, data)
    return row


@router.put("/supervisors/{supervisor_id}", response_model=UserOut)
async def update_supervisor(
    supervisor_id: int, body: SupervisorUpdate, _: dict = Depends(require_admin)
):
    data = body.model_dump(exclude_none=True)
    if "password" in data:
        data["password_hash"] = await hash_password(data.pop("password"))
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.update_user(
            conn, supervisor_id, data, "DISTRICT_SUPERVISOR"
        )
    if not row:
        raise HTTPException(404, "Supervisor not found")
    return row


@router.delete("/supervisors/{supervisor_id}", status_code=204)
async def delete_supervisor(supervisor_id: int, _: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.delete_user(conn, supervisor_id, "DISTRICT_SUPERVISOR")
    if not row:
        raise HTTPException(404, "Supervisor not found")


@router.get(
    "/supervisors/{supervisor_id}/price-collectors", response_model=list[UserOut]
)
async def supervisor_price_collectors(
    supervisor_id: int, _: dict = Depends(require_admin)
):
    pool = get_pool()
    async with pool.connection() as conn:
        ds = await queries.get_user_in_role(conn, supervisor_id, "DISTRICT_SUPERVISOR")
        if not ds:
            raise HTTPException(404, "Supervisor not found")
        rows = await queries.list_price_collectors_for_supervisor(conn, supervisor_id)
    return rows


@router.get(
    "/supervisors/{supervisor_id}/markets", response_model=list[SupervisorMarketOut]
)
async def supervisor_markets(supervisor_id: int, _: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        ds = await queries.get_user_in_role(conn, supervisor_id, "DISTRICT_SUPERVISOR")
        if not ds:
            raise HTTPException(404, "Supervisor not found")
        rows = await queries.list_markets_for_supervisor(conn, supervisor_id)
    return rows


# ── District supervisor self-views ─────────────────────────────────────────


@router.get("/my/price-collectors", response_model=list[UserOut])
async def my_price_collectors(user: dict = Depends(require_supervisor)):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_price_collectors_for_supervisor(conn, user["user_id"])
    return rows


@router.get("/my/markets", response_model=list[SupervisorMarketOut])
async def my_markets(user: dict = Depends(require_supervisor)):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_markets_for_supervisor(conn, user["user_id"])
    return rows


# ── Price Collector Management (admin-only) ────────────────────────────────


@router.get("/surveyors", response_model=list[UserOut])
async def list_surveyors(
    _: dict = Depends(require_admin),
    pg: PaginationParams = Depends(_pagination),
):
    pool = get_pool()
    async with pool.connection() as conn:
        rows = await queries.list_surveyors(conn, pg.limit, pg.offset)
    return rows


@router.get("/surveyors/{surveyor_id}", response_model=UserOut)
async def get_surveyor(surveyor_id: int, _: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.get_user_in_role(conn, surveyor_id, "PRICE_COLLECTOR")
    if not row:
        raise HTTPException(404, "Surveyor not found")
    return row


@router.post("/surveyors", response_model=UserOut, status_code=201)
async def create_surveyor(body: SurveyorCreate, _: dict = Depends(require_admin)):
    data = body.model_dump()
    data["password_hash"] = await hash_password(data.pop("password"))
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.create_price_collector(conn, data)
    if not row:
        raise HTTPException(404, "District not found")
    return row


@router.put("/surveyors/{surveyor_id}", response_model=UserOut)
async def update_surveyor(
    surveyor_id: int,
    body: SurveyorUpdate,
    user: dict = Depends(require_admin_or_supervisor),
):
    # A supervisor may edit price collectors in their own district (name, contact,
    # active flag, password) — but never the username or district (SurveyorUpdate
    # has no such fields). Admins may edit any price collector.
    data = body.model_dump(exclude_none=True)
    if "password" in data:
        data["password_hash"] = await hash_password(data.pop("password"))
    pool = get_pool()
    async with pool.connection() as conn:
        await assert_pc_in_scope(conn, user, surveyor_id)
        row = await queries.update_user(conn, surveyor_id, data, "PRICE_COLLECTOR")
    if not row:
        raise HTTPException(404, "Surveyor not found")
    return row


@router.delete("/surveyors/{surveyor_id}", status_code=204)
async def delete_surveyor(surveyor_id: int, _: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.connection() as conn:
        row = await queries.delete_user(conn, surveyor_id, "PRICE_COLLECTOR")
    if not row:
        raise HTTPException(404, "Surveyor not found")
