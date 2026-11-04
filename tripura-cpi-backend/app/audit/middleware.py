import json

from fastapi import Request
from jose import ExpiredSignatureError, JWTError

from app.audit import queries
from app.auth.security import decode_token
from app.config import settings
from app.database import get_pool
from app.logger import logger

MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
AUDITED_ROLES = frozenset({"ADMIN", "DISTRICT_SUPERVISOR"})
# Login/refresh/logout are never audited: their bodies hold credentials, and the
# skip happens before any body read so credentials never enter middleware memory.
# /reports/preview is POST only because its filters are nested JSON — it changes
# nothing, and the UI re-runs it on every filter tweak.
EXCLUDED_PATHS = frozenset(
    {
        "/auth/admin/login",
        "/auth/surveyor/login",
        "/auth/refresh",
        "/auth/logout",
        "/reports/preview",
    }
)
_SENSITIVE_KEY_PARTS = ("password", "passwd", "secret", "token")


def _request_path(request: Request) -> str:
    path = request.url.path
    root_path = request.scope.get("root_path", "")
    if root_path and path.startswith(root_path):
        path = path[len(root_path) :] or "/"
    return path


def _extract_token(request: Request) -> str | None:
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:]
    return request.cookies.get("access_token")


def _identify(request: Request) -> tuple[int, str] | None:
    token = _extract_token(request)
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id = int(payload["sub"])
    except (ExpiredSignatureError, JWTError, KeyError, TypeError, ValueError):
        return None
    role = payload.get("role")
    if role not in AUDITED_ROLES:
        return None
    return user_id, role


def _redact(value):
    if isinstance(value, dict):
        return {
            k: "[REDACTED]"
            if any(part in k.lower() for part in _SENSITIVE_KEY_PARTS)
            else _redact(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


async def _capture_body(request: Request) -> bytes | None:
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith("application/json"):
        return None
    content_length = request.headers.get("content-length")
    if (
        not content_length
        or not content_length.isdigit()
        or int(content_length) > settings.audit_max_body_bytes
    ):
        return None
    try:
        return await request.body()
    except Exception:  # client disconnect mid-body
        return None


async def _record(
    request: Request,
    path: str,
    user_id: int,
    role: str,
    raw_body: bytes | None,
    status_code: int,
) -> None:
    try:
        route = request.scope.get("route")
        if route is None:  # 404/405: router never matched
            return
        body_json = None
        if raw_body:
            try:
                body_json = _redact(json.loads(raw_body))
            except (ValueError, UnicodeDecodeError):
                body_json = None
        pool = get_pool()
        async with pool.connection() as conn:
            username = await queries.get_username(conn, user_id)
            await queries.insert_audit_log(
                conn,
                {
                    "user_id": user_id,
                    "username": username,
                    "user_role": role,
                    "action": route.name,
                    "method": request.method,
                    "path": path,
                    "path_params": dict(request.scope.get("path_params") or {}) or None,
                    "request_body": body_json,
                    "status_code": status_code,
                },
            )
    except Exception as exc:  # audit failure must never break the response
        logger.warning(
            "Audit log write failed for %s %s: %s", request.method, path, exc
        )


async def audit_middleware(request: Request, call_next):
    if request.method not in MUTATING_METHODS:
        return await call_next(request)
    path = _request_path(request)
    if path in EXCLUDED_PATHS:
        return await call_next(request)
    identity = _identify(request)
    if identity is None:
        return await call_next(request)
    user_id, role = identity

    raw_body = await _capture_body(request)

    try:
        response = await call_next(request)
    except Exception:
        await _record(request, path, user_id, role, raw_body, 500)
        raise
    await _record(request, path, user_id, role, raw_body, response.status_code)
    return response
