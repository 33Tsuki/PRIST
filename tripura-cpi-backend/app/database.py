from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import settings

_pool: AsyncConnectionPool | None = None


async def _configure(conn: AsyncConnection) -> None:
    # Pin every session to UTC so CURRENT_TIMESTAMP defaults and the offsets
    # returned for TIMESTAMPTZ columns are deterministic regardless of the
    # container's system timezone. The frontend converts to local for display.
    # Commit so the pool gets the connection back idle, not left INTRANS.
    await conn.execute("SET TIME ZONE 'UTC'")
    await conn.commit()


async def init_pool() -> None:
    global _pool
    _pool = AsyncConnectionPool(
        conninfo=settings.database_url,
        min_size=2,
        max_size=10,
        kwargs={"row_factory": dict_row},
        configure=_configure,
        open=False,
        check=AsyncConnectionPool.check_connection,
    )
    await _pool.open()


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> AsyncConnectionPool:
    assert _pool is not None, "Connection pool is not initialized"
    return _pool
