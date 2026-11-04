from datetime import datetime

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb


async def get_username(conn: AsyncConnection, user_id: int) -> str | None:
    cur = await conn.execute(
        "SELECT username FROM cpi_tripura_user WHERE user_id = %s",
        [user_id],
    )
    row = await cur.fetchone()
    return row["username"] if row else None


async def insert_audit_log(conn: AsyncConnection, data: dict):
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))
    # psycopg3 does not auto-adapt dicts/lists to jsonb
    values = [Jsonb(v) if isinstance(v, dict | list) else v for v in data.values()]
    cur = await conn.execute(
        f"INSERT INTO cpi_tripura_audit_log ({cols}) VALUES ({placeholders}) RETURNING *",
        values,
    )
    return await cur.fetchone()


async def list_audit_logs(
    conn: AsyncConnection,
    user_id: int | None = None,
    username: str | None = None,
    action: str | None = None,
    method: str | None = None,
    status_code: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
):
    query = "SELECT * FROM cpi_tripura_audit_log WHERE true"
    params: list = []
    if user_id:
        params.append(user_id)
        query += " AND user_id = %s"
    if username:
        params.append(f"%{username}%")
        query += " AND username ILIKE %s"
    if action:
        params.append(action)
        query += " AND action = %s"
    if method:
        params.append(method.upper())
        query += " AND method = %s"
    if status_code:
        params.append(status_code)
        query += " AND status_code = %s"
    if date_from:
        params.append(date_from)
        query += " AND created_at >= %s"
    if date_to:
        params.append(date_to)
        query += " AND created_at <= %s"
    query += " ORDER BY created_at DESC, audit_log_id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    cur = await conn.execute(query, params)
    return await cur.fetchall()
