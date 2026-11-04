from psycopg import AsyncConnection

# ── Tehsils ──────────────────────────────────────────────────────────────────


async def list_tehsils(conn: AsyncConnection, limit: int = 50, offset: int = 0):
    cur = await conn.execute(
        "SELECT * FROM CPI_TRIPURA_TEHSIL ORDER BY tehsil_id LIMIT %s OFFSET %s",
        [limit, offset],
    )
    return await cur.fetchall()


async def get_tehsil(conn: AsyncConnection, tehsil_id: int):
    cur = await conn.execute(
        "SELECT * FROM CPI_TRIPURA_TEHSIL WHERE tehsil_id = %s", [tehsil_id]
    )
    return await cur.fetchone()


# ── Subdivisions ─────────────────────────────────────────────────────────────


async def list_subdivisions(conn: AsyncConnection, limit: int = 50, offset: int = 0):
    cur = await conn.execute(
        """
        SELECT s.*, d.name AS district_name
        FROM cpi_tripura_subdivision s
        JOIN cpi_tripura_district d ON s.district_id = d.district_id
        ORDER BY s.subdivision_id
        LIMIT %s OFFSET %s
        """,
        [limit, offset],
    )
    return await cur.fetchall()


async def get_subdivision(conn: AsyncConnection, subdivision_id: int):
    cur = await conn.execute(
        """
        SELECT s.*, d.name AS district_name
        FROM cpi_tripura_subdivision s
        JOIN cpi_tripura_district d ON s.district_id = d.district_id
        WHERE s.subdivision_id = %s
        """,
        [subdivision_id],
    )
    return await cur.fetchone()


# ── Districts ────────────────────────────────────────────────────────────────


async def list_districts(conn: AsyncConnection, limit: int = 50, offset: int = 0):
    cur = await conn.execute(
        """
        SELECT district_id, name, code, lgd_code, created_at, modified_at
        FROM cpi_tripura_district
        ORDER BY code
        LIMIT %s OFFSET %s
        """,
        [limit, offset],
    )
    return await cur.fetchall()


async def get_district(conn: AsyncConnection, district_id: int):
    cur = await conn.execute(
        """
        SELECT district_id, name, code, lgd_code, created_at, modified_at
        FROM cpi_tripura_district WHERE district_id = %s
        """,
        [district_id],
    )
    return await cur.fetchone()


# ── Markets ──────────────────────────────────────────────────────────────────


_MARKET_SELECT = """
    SELECT m.*,
           t.name AS tehsil, t.teh_mmdc,
           sd.name AS subdivision, sd.lgd_code AS subdivision_lgd_code,
           d.name AS district_name, d.code AS district_code
    FROM cpi_tripura_market m
    JOIN cpi_tripura_district d ON m.district_id = d.district_id
    LEFT JOIN cpi_tripura_tehsil t ON m.tehsil_id = t.tehsil_id
    LEFT JOIN cpi_tripura_subdivision sd ON m.subdivision_id = sd.subdivision_id
""".strip()


async def list_markets(
    conn: AsyncConnection,
    domain: str | None = None,
    district_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
):
    query = f"{_MARKET_SELECT} WHERE true"
    params: list = []
    if domain:
        params.append(domain)
        query += " AND m.domain = %s"
    if district_id:
        params.append(district_id)
        query += " AND m.district_id = %s"
    query += " ORDER BY m.market_id LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    cur = await conn.execute(query, params)
    return await cur.fetchall()


async def get_market(conn: AsyncConnection, market_id: int):
    cur = await conn.execute(
        f"{_MARKET_SELECT} WHERE m.market_id = %s",
        [market_id],
    )
    return await cur.fetchone()


async def create_market(conn: AsyncConnection, data: dict):
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))
    cur = await conn.execute(
        f"INSERT INTO cpi_tripura_market ({cols}) VALUES ({placeholders}) RETURNING market_id",
        list(data.values()),
    )
    row = await cur.fetchone()
    return await get_market(conn, row["market_id"])


async def update_market(conn: AsyncConnection, market_id: int, data: dict):
    if not data:
        return await get_market(conn, market_id)
    sets = ", ".join(f"{k} = %s" for k in data)
    params = list(data.values()) + [market_id]
    cur = await conn.execute(
        f"UPDATE cpi_tripura_market SET {sets} WHERE market_id = %s RETURNING market_id",
        params,
    )
    row = await cur.fetchone()
    if not row:
        return None
    return await get_market(conn, row["market_id"])


async def delete_market(conn: AsyncConnection, market_id: int):
    cur = await conn.execute(
        "DELETE FROM cpi_tripura_market WHERE market_id = %s RETURNING market_id",
        [market_id],
    )
    return await cur.fetchone()


# ── Shops ────────────────────────────────────────────────────────────────────


async def list_all_shops(
    conn: AsyncConnection,
    domain: str | None = None,
    district_id: int | None = None,
    market_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
):
    query = """SELECT s.*, m.selected_market FROM cpi_tripura_market_shop s
        JOIN cpi_tripura_market m ON s.market_id = m.market_id
        WHERE true"""
    params: list = []
    if domain:
        params.append(domain)
        query += " AND m.domain = %s"
    if district_id:
        params.append(district_id)
        query += " AND m.district_id = %s"
    if market_id:
        params.append(market_id)
        query += " AND s.market_id = %s"
    query += " ORDER BY s.shop_id LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    cur = await conn.execute(query, params)
    return await cur.fetchall()


async def list_shops(
    conn: AsyncConnection, market_id: int, limit: int = 50, offset: int = 0
):
    cur = await conn.execute(
        "SELECT * FROM cpi_tripura_market_shop WHERE market_id = %s ORDER BY shop_id LIMIT %s OFFSET %s",
        [market_id, limit, offset],
    )
    return await cur.fetchall()


async def get_shop(conn: AsyncConnection, shop_id: int):
    cur = await conn.execute(
        "SELECT * FROM cpi_tripura_market_shop WHERE shop_id = %s", [shop_id]
    )
    return await cur.fetchone()


async def create_shop(conn: AsyncConnection, market_id: int, data: dict):
    data["market_id"] = market_id
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))
    cur = await conn.execute(
        f"INSERT INTO cpi_tripura_market_shop ({cols}) VALUES ({placeholders}) RETURNING *",
        list(data.values()),
    )
    return await cur.fetchone()


async def update_shop(conn: AsyncConnection, shop_id: int, data: dict):
    if not data:
        return await get_shop(conn, shop_id)
    sets = ", ".join(f"{k} = %s" for k in data)
    params = list(data.values()) + [shop_id]
    cur = await conn.execute(
        f"UPDATE cpi_tripura_market_shop SET {sets} WHERE shop_id = %s RETURNING *",
        params,
    )
    return await cur.fetchone()


async def delete_shop(conn: AsyncConnection, shop_id: int):
    cur = await conn.execute(
        "DELETE FROM cpi_tripura_market_shop WHERE shop_id = %s RETURNING shop_id",
        [shop_id],
    )
    return await cur.fetchone()


# ── Items ────────────────────────────────────────────────────────────────────


async def list_items(
    conn: AsyncConnection,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    query = "SELECT * FROM cpi_tripura_item WHERE true"
    params: list = []
    if search:
        params.append(f"%{search}%")
        query += " AND (item_name ILIKE %s OR item_code ILIKE %s)"
        params.append(f"%{search}%")
    query += " ORDER BY item_id LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    cur = await conn.execute(query, params)
    return await cur.fetchall()


async def get_item(conn: AsyncConnection, item_id: int):
    cur = await conn.execute(
        "SELECT * FROM cpi_tripura_item WHERE item_id = %s", [item_id]
    )
    return await cur.fetchone()


async def create_item(conn: AsyncConnection, data: dict):
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))
    cur = await conn.execute(
        f"INSERT INTO cpi_tripura_item ({cols}) VALUES ({placeholders}) RETURNING *",
        list(data.values()),
    )
    return await cur.fetchone()


async def update_item(conn: AsyncConnection, item_id: int, data: dict):
    if not data:
        return await get_item(conn, item_id)
    sets = ", ".join(f"{k} = %s" for k in data)
    params = list(data.values()) + [item_id]
    cur = await conn.execute(
        f"UPDATE cpi_tripura_item SET {sets} WHERE item_id = %s RETURNING *",
        params,
    )
    return await cur.fetchone()


async def delete_item(conn: AsyncConnection, item_id: int):
    cur = await conn.execute(
        "DELETE FROM cpi_tripura_item WHERE item_id = %s RETURNING item_id",
        [item_id],
    )
    return await cur.fetchone()


# ── Market Items ─────────────────────────────────────────────────────────────


async def list_market_items(
    conn: AsyncConnection, market_id: int, limit: int = 50, offset: int = 0
):
    cur = await conn.execute(
        """SELECT mi.* FROM cpi_tripura_market_item mi
           JOIN cpi_tripura_market_shop sh ON mi.shop_id = sh.shop_id
           WHERE sh.market_id = %s
           ORDER BY mi.market_item_id LIMIT %s OFFSET %s""",
        [market_id, limit, offset],
    )
    return await cur.fetchall()


async def get_market_item(conn: AsyncConnection, market_item_id: int):
    cur = await conn.execute(
        "SELECT * FROM cpi_tripura_market_item WHERE market_item_id = %s",
        [market_item_id],
    )
    return await cur.fetchone()


async def create_market_item(conn: AsyncConnection, data: dict):
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))
    cur = await conn.execute(
        f"INSERT INTO cpi_tripura_market_item ({cols}) VALUES ({placeholders}) RETURNING *",
        list(data.values()),
    )
    return await cur.fetchone()


async def update_market_item(conn: AsyncConnection, market_item_id: int, data: dict):
    if not data:
        return await get_market_item(conn, market_item_id)
    sets = ", ".join(f"{k} = %s" for k in data)
    params = list(data.values()) + [market_item_id]
    cur = await conn.execute(
        f"UPDATE cpi_tripura_market_item SET {sets} WHERE market_item_id = %s RETURNING *",
        params,
    )
    return await cur.fetchone()


async def delete_market_item(conn: AsyncConnection, market_item_id: int):
    cur = await conn.execute(
        "DELETE FROM cpi_tripura_market_item WHERE market_item_id = %s RETURNING market_item_id",
        [market_item_id],
    )
    return await cur.fetchone()
