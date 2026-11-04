from contextlib import asynccontextmanager

import psycopg
import psycopg_pool
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.audit.middleware import audit_middleware
from app.audit.router import router as audit_router
from app.auth.router import router as auth_router
from app.config import settings
from app.database import close_pool, get_pool, init_pool
from app.logger import logger
from app.master_data.ingestion.router import router as ingestion_router
from app.master_data.router import router as master_data_router
from app.rate_limit import limiter
from app.reports.router import router as reports_router
from app.survey.ingestion.router import router as survey_ingestion_router
from app.survey.router import router as survey_router
from app.sync.router import router as sync_router


def _validate_production_settings() -> None:
    """Raise if insecure defaults are used outside dev."""
    if settings.app_env == "dev":
        return
    errors = []
    if settings.jwt_secret_key == "change-me-in-production":
        errors.append("JWT_SECRET_KEY is still the default")
    if settings.default_admin_password == "admin123":
        errors.append("DEFAULT_ADMIN_PASSWORD is still the default")
    if errors:
        raise RuntimeError(
            f"Insecure defaults in {settings.app_env} environment: {'; '.join(errors)}"
        )


async def _ensure_default_admin() -> None:
    """Create a default admin user if the admin table is empty."""
    from app.auth.queries import count_admins, create_admin
    from app.auth.security import hash_password

    pool = get_pool()
    async with pool.connection() as conn:
        if await count_admins(conn) == 0:
            try:
                await create_admin(
                    conn,
                    {
                        "username": "admin",
                        "password_hash": await hash_password(
                            settings.default_admin_password
                        ),
                    },
                )
            except psycopg.errors.UniqueViolation:
                pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.reports.service import reports_dir, sweep_stale_jobs, wait_for_jobs

    _validate_production_settings()
    reports_dir().mkdir(parents=True, exist_ok=True)
    await init_pool()
    await _ensure_default_admin()
    await sweep_stale_jobs()
    logger.info("Application started")
    yield
    await wait_for_jobs()
    await close_pool()
    logger.info("Application stopped")


app = FastAPI(
    title="Tripura CPI Backend",
    version="0.1.0",
    lifespan=lifespan,
    root_path=settings.root_path,
)

if settings.allowed_origins == "*":
    if settings.app_env != "dev":
        raise ValueError("ALLOWED_ORIGINS must not be '*' in production")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    origins = [o.strip() for o in settings.allowed_origins.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(psycopg.errors.UniqueViolation)
async def unique_violation_handler(
    request: Request, exc: psycopg.errors.UniqueViolation
):
    logger.warning("UniqueViolation on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=409, content={"detail": "A record with this data already exists"}
    )


@app.exception_handler(psycopg.errors.ForeignKeyViolation)
async def fk_violation_handler(
    request: Request, exc: psycopg.errors.ForeignKeyViolation
):
    logger.warning("ForeignKeyViolation on %s: %s", request.url.path, exc)
    if "is still referenced" in (exc.diag.message_detail or ""):
        detail = "Cannot delete: this record is still referenced by other records"
    else:
        detail = "Referenced record does not exist"
    return JSONResponse(status_code=409, content={"detail": detail})


@app.exception_handler(psycopg.errors.CheckViolation)
async def check_violation_handler(request: Request, exc: psycopg.errors.CheckViolation):
    logger.warning("CheckViolation on %s: %s", request.url.path, exc)
    return JSONResponse(status_code=422, content={"detail": "Data validation failed"})


@app.exception_handler(psycopg.errors.RaiseException)
async def raise_exception_handler(request: Request, exc: psycopg.errors.RaiseException):
    logger.warning("RaiseException on %s: %s", request.url.path, exc)
    return JSONResponse(status_code=422, content={"detail": "Operation rejected"})


@app.exception_handler(psycopg.OperationalError)
async def operational_error_handler(request: Request, exc: psycopg.OperationalError):
    logger.error("DB connection error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503, content={"detail": "Database temporarily unavailable"}
    )


@app.exception_handler(psycopg_pool.PoolTimeout)
async def pool_timeout_handler(request: Request, exc: psycopg_pool.PoolTimeout):
    logger.error("Connection pool timeout on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503, content={"detail": "Database temporarily unavailable"}
    )


app.include_router(auth_router)
app.include_router(master_data_router)
app.include_router(ingestion_router)
app.include_router(sync_router)
app.include_router(survey_router)
app.include_router(survey_ingestion_router)
app.include_router(audit_router)
app.include_router(reports_router)

app.middleware("http")(audit_middleware)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"
    return response


@app.get("/health")
async def health():
    return {"status": "ok"}
