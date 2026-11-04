from psycopg import AsyncConnection

# All users (admins, district supervisors, price collectors) live in one table.
# full_name/phone are nullable so admins fit; COALESCE keeps the UserOut contract
# (admins display their username and an empty phone).
_USER_SELECT = """
    SELECT
        u.user_id,
        u.username,
        COALESCE(u.full_name, u.username) AS full_name,
        COALESCE(u.phone, '') AS phone,
        u.email,
        u.user_role AS role,
        u.is_active,
        u.district_id,
        d.name AS district_name,
        d.code AS district_code,
        u.password_hash,
        u.created_at,
        u.modified_at
    FROM cpi_tripura_user u
    LEFT JOIN cpi_tripura_district d ON d.district_id = u.district_id
""".strip()


async def get_user(conn: AsyncConnection, user_id: int):
    cur = await conn.execute(f"{_USER_SELECT} WHERE u.user_id = %s", [user_id])
    return await cur.fetchone()


async def get_user_by_username(conn: AsyncConnection, username: str):
    cur = await conn.execute(f"{_USER_SELECT} WHERE u.username = %s", [username])
    return await cur.fetchone()


async def get_user_in_role(conn: AsyncConnection, user_id: int, role: str):
    """Fetch a user only if they hold the given role (404-safety for role-scoped routes)."""
    cur = await conn.execute(
        f"{_USER_SELECT} WHERE u.user_id = %s AND u.user_role = %s",
        [user_id, role],
    )
    return await cur.fetchone()


async def list_users(
    conn: AsyncConnection,
    role: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    if role is not None:
        cur = await conn.execute(
            f"{_USER_SELECT} WHERE u.user_role = %s "
            "ORDER BY u.created_at DESC LIMIT %s OFFSET %s",
            [role, limit, offset],
        )
    else:
        cur = await conn.execute(
            f"{_USER_SELECT} ORDER BY u.created_at DESC LIMIT %s OFFSET %s",
            [limit, offset],
        )
    return await cur.fetchall()


async def list_admins(conn: AsyncConnection, limit: int = 50, offset: int = 0):
    return await list_users(conn, "ADMIN", limit, offset)


async def list_surveyors(conn: AsyncConnection, limit: int = 50, offset: int = 0):
    return await list_users(conn, "PRICE_COLLECTOR", limit, offset)


async def list_supervisors(conn: AsyncConnection, limit: int = 50, offset: int = 0):
    return await list_users(conn, "DISTRICT_SUPERVISOR", limit, offset)


async def list_surveyors_public(conn: AsyncConnection, district_id: int):
    cur = await conn.execute(
        """
        SELECT user_id, username, full_name
        FROM cpi_tripura_user
        WHERE user_role = 'PRICE_COLLECTOR'
          AND district_id = %s
          AND is_active = TRUE
          AND password_hash IS NOT NULL
        ORDER BY username
        """,
        [district_id],
    )
    return await cur.fetchall()


# ── Creation ──────────────────────────────────────────────────────────────


async def create_user(conn: AsyncConnection, data: dict):
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))
    cur = await conn.execute(
        f"INSERT INTO cpi_tripura_user ({cols}) VALUES ({placeholders}) RETURNING user_id",
        list(data.values()),
    )
    row = await cur.fetchone()
    return await get_user(conn, row["user_id"])


async def create_admin(conn: AsyncConnection, data: dict):
    return await create_user(conn, {**data, "user_role": "ADMIN"})


async def create_supervisor(conn: AsyncConnection, data: dict):
    return await create_user(conn, {**data, "user_role": "DISTRICT_SUPERVISOR"})


async def create_price_collector(conn: AsyncConnection, data: dict):
    """Atomically allocate the per-district sequence and build the PC.<dd>.<nnn> username."""
    cur = await conn.execute(
        """
        WITH d AS (
            UPDATE cpi_tripura_district
            SET next_surveyor_seq = next_surveyor_seq + 1
            WHERE district_id = %s
            RETURNING district_id, code, next_surveyor_seq - 1 AS seq
        )
        INSERT INTO cpi_tripura_user
            (user_role, username, full_name, phone, email, is_active, district_id, password_hash)
        SELECT 'PRICE_COLLECTOR',
               'PC.' || d.code || '.' || LPAD(d.seq::text, 3, '0'),
               %s, %s, %s, %s, d.district_id, %s
        FROM d
        RETURNING user_id
        """,
        [
            data["district_id"],
            data["full_name"],
            data.get("phone"),
            data.get("email"),
            data["is_active"],
            data["password_hash"],
        ],
    )
    row = await cur.fetchone()
    if not row:
        return None
    return await get_user(conn, row["user_id"])


# ── Update / delete (role-guarded) ──────────────────────────────────────────


async def update_user(conn: AsyncConnection, user_id: int, data: dict, role: str):
    if not data:
        return await get_user_in_role(conn, user_id, role)
    sets = ", ".join(f"{k} = %s" for k in data)
    params = list(data.values()) + [user_id, role]
    cur = await conn.execute(
        f"""
        UPDATE cpi_tripura_user
        SET {sets}
        WHERE user_id = %s AND user_role = %s
        RETURNING user_id
        """,
        params,
    )
    row = await cur.fetchone()
    if not row:
        return None
    return await get_user(conn, row["user_id"])


async def delete_user(conn: AsyncConnection, user_id: int, role: str):
    cur = await conn.execute(
        "DELETE FROM cpi_tripura_user WHERE user_id = %s AND user_role = %s RETURNING user_id",
        [user_id, role],
    )
    row = await cur.fetchone()
    if not row:
        return None
    return {"user_id": row["user_id"]}


# ── Supervisor derived views (district-based; no association table) ──────────


async def list_price_collectors_for_supervisor(conn: AsyncConnection, ds_id: int):
    cur = await conn.execute(
        f"""
        {_USER_SELECT}
        WHERE u.user_role = 'PRICE_COLLECTOR'
          AND u.district_id = (SELECT district_id FROM cpi_tripura_user WHERE user_id = %s)
        ORDER BY u.username
        """,
        [ds_id],
    )
    return await cur.fetchall()


async def list_markets_for_supervisor(conn: AsyncConnection, ds_id: int):
    cur = await conn.execute(
        """
        SELECT m.market_id,
               m.selected_market AS market_name,
               m.market_code,
               m.domain,
               d.name AS district_name
        FROM cpi_tripura_market m
        JOIN cpi_tripura_district d ON d.district_id = m.district_id
        WHERE m.district_id = (SELECT district_id FROM cpi_tripura_user WHERE user_id = %s)
        ORDER BY m.selected_market
        """,
        [ds_id],
    )
    return await cur.fetchall()


# ── Counts ──────────────────────────────────────────────────────────────────


async def count_admins(conn: AsyncConnection) -> int:
    cur = await conn.execute(
        "SELECT count(*) AS cnt FROM cpi_tripura_user WHERE user_role = 'ADMIN'"
    )
    row = await cur.fetchone()
    return row["cnt"]


async def count_users(conn: AsyncConnection) -> int:
    cur = await conn.execute("SELECT count(*) AS cnt FROM cpi_tripura_user")
    row = await cur.fetchone()
    return row["cnt"]
