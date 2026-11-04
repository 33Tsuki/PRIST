from psycopg import AsyncConnection

from app.config import settings


async def list_survey_rounds(conn: AsyncConnection, limit: int = 50, offset: int = 0):
    cur = await conn.execute(
        "SELECT * FROM CPI_TRIPURA_SURVEY_ROUND ORDER BY round_id LIMIT %s OFFSET %s",
        [limit, offset],
    )
    return await cur.fetchall()


async def get_survey_round(conn: AsyncConnection, round_id: int):
    cur = await conn.execute(
        "SELECT * FROM CPI_TRIPURA_SURVEY_ROUND WHERE round_id = %s", [round_id]
    )
    return await cur.fetchone()


async def create_survey_round(conn: AsyncConnection, data: dict):
    # round_number is system-assigned: the next sequential number within the cycle,
    # computed in the same statement that inserts it. UNIQUE (cycle, round_number) is
    # the concurrency backstop (round creation is admin-only and rare).
    cycle = data.get("cycle", "MONTHLY")
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))
    cur = await conn.execute(
        f"""
        INSERT INTO CPI_TRIPURA_SURVEY_ROUND (round_number, {cols})
        SELECT COALESCE(MAX(round_number), 0) + 1, {placeholders}
        FROM CPI_TRIPURA_SURVEY_ROUND
        WHERE cycle = %s
        RETURNING *
        """,
        [*data.values(), cycle],
    )
    return await cur.fetchone()


async def update_survey_round(conn: AsyncConnection, round_id: int, data: dict):
    if not data:
        return await get_survey_round(conn, round_id)
    sets = ", ".join(f"{k} = %s" for k in data)
    params = list(data.values()) + [round_id]
    cur = await conn.execute(
        f"UPDATE CPI_TRIPURA_SURVEY_ROUND SET {sets} WHERE round_id = %s RETURNING *",
        params,
    )
    return await cur.fetchone()


async def delete_survey_round(conn: AsyncConnection, round_id: int):
    cur = await conn.execute(
        "DELETE FROM CPI_TRIPURA_SURVEY_ROUND WHERE round_id = %s RETURNING round_id",
        [round_id],
    )
    return await cur.fetchone()


async def start_round(conn: AsyncConnection, round_id: int):
    """Move a round to ACTIVE (from DRAFT, or re-opening a CLOSED one), stamping
    actual_start_date the first time it starts (preserved on re-start). Returns None
    when another round in the same cycle is already ACTIVE — the partial unique index
    uq_one_active_round_per_cycle is the concurrent-safety backstop. Callers should
    confirm the round exists first to tell 404 (missing) from 409 (conflict)."""
    cur = await conn.execute(
        """
        UPDATE cpi_tripura_survey_round r
        SET round_status = 'ACTIVE',
            actual_start_date = COALESCE(r.actual_start_date, CURRENT_DATE)
        WHERE r.round_id = %s
          AND NOT EXISTS (
              SELECT 1 FROM cpi_tripura_survey_round o
              WHERE o.cycle = r.cycle
                AND o.round_status = 'ACTIVE'
                AND o.round_id <> r.round_id
          )
        RETURNING *
        """,
        [round_id],
    )
    return await cur.fetchone()


async def end_round(conn: AsyncConnection, round_id: int):
    """Move an ACTIVE round to CLOSED, stamping actual_end_date. Returns None when the
    round is not currently ACTIVE (caller confirms existence to distinguish 404/409)."""
    cur = await conn.execute(
        """
        UPDATE cpi_tripura_survey_round
        SET round_status = 'CLOSED',
            actual_end_date = CURRENT_DATE
        WHERE round_id = %s AND round_status = 'ACTIVE'
        RETURNING *
        """,
        [round_id],
    )
    return await cur.fetchone()


async def list_markets_by_round(
    conn: AsyncConnection, round_id: int, district_id: int | None = None
):
    query = """
        WITH prev_round AS (
            -- TODO: scope by cycle once non-MONTHLY cycles exist (see get_previous_round)
            SELECT round_id FROM cpi_tripura_survey_round
            WHERE round_number < (
                SELECT round_number FROM cpi_tripura_survey_round WHERE round_id = %s
            )
            ORDER BY round_number DESC
            LIMIT 1
        ),
        alerts AS (
            SELECT sh.market_id, COUNT(*) AS alert_count
            FROM cpi_tripura_market_item mi
            JOIN cpi_tripura_market_shop sh ON sh.shop_id = mi.shop_id
            JOIN cpi_tripura_price_data pd ON pd.market_item_id = mi.market_item_id
            LEFT JOIN cpi_tripura_market_item prev_mi
                ON prev_mi.item_id = mi.item_id
                AND prev_mi.shop_id = mi.shop_id
                AND prev_mi.unit_of_sale = mi.unit_of_sale
                AND prev_mi.product_specification IS NOT DISTINCT FROM mi.product_specification
                AND prev_mi.round_id = (SELECT round_id FROM prev_round)
            LEFT JOIN cpi_tripura_price_data prev_pd
                ON prev_pd.market_item_id = prev_mi.market_item_id
            WHERE mi.round_id = %s
                AND pd.current_period_price IS NOT NULL
                AND COALESCE(prev_pd.current_period_price, pd.previous_period_price) IS NOT NULL
                AND COALESCE(prev_pd.current_period_price, pd.previous_period_price) != 0
                AND ABS(pd.current_period_price - COALESCE(prev_pd.current_period_price, pd.previous_period_price))
                    * 100.0 / COALESCE(prev_pd.current_period_price, pd.previous_period_price) >= %s
            GROUP BY sh.market_id
        )
        SELECT m.market_id, m.market_code, m.selected_market, m.domain,
               m.district_id,
               d.name AS district_name,
               m.subdivision_id,
               sd.name AS subdivision,
               COALESCE(st.status::text, 'IN_PROGRESS') AS status,
               COUNT(s.item_price_collection_shop_setup_id) AS setup_count,
               COUNT(*) FILTER (WHERE s.shop_selection_status = 'ORIGINALLY SELECTED') AS total_count,
               COUNT(*) FILTER (WHERE s.shop_selection_status = 'ORIGINALLY SELECTED'
                   AND (ppd.current_period_price IS NOT NULL OR ppd.is_na OR ppd.is_not_applicable)
               ) AS collected_count,
               COALESCE(a.alert_count, 0) AS alert_count,
               sa.surveyor_id,
               su.full_name AS surveyor_name,
               su.phone AS surveyor_phone,
               st.submitted_at,
               sub.full_name AS submitted_by_name,
               st.reviewed_at
        FROM cpi_tripura_item_price_collection_shop_setup s
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = s.shop_id
        JOIN cpi_tripura_market m ON m.market_id = sh.market_id
        JOIN cpi_tripura_district d ON d.district_id = m.district_id
        LEFT JOIN cpi_tripura_subdivision sd ON sd.subdivision_id = m.subdivision_id
        LEFT JOIN cpi_tripura_market_survey_status st
            ON st.round_id = s.round_id AND st.market_id = m.market_id
        -- Surveyor + submitter identity. Both source tables are UNIQUE(round_id, market_id),
        -- so these joins stay 1:1 and cannot disturb the counters above.
        LEFT JOIN cpi_tripura_user sub ON sub.user_id = st.submitted_by
        LEFT JOIN cpi_tripura_surveyor_assignment sa
            ON sa.round_id = s.round_id AND sa.market_id = m.market_id
        LEFT JOIN cpi_tripura_user su ON su.user_id = sa.surveyor_id
        LEFT JOIN cpi_tripura_market_item pmi
            ON pmi.item_id = s.item_id AND pmi.shop_id = s.shop_id AND pmi.round_id = s.round_id
        LEFT JOIN cpi_tripura_price_data ppd ON ppd.market_item_id = pmi.market_item_id
        LEFT JOIN alerts a ON a.market_id = m.market_id
        WHERE s.round_id = %s
    """
    params: list = [round_id, round_id, settings.price_alert_threshold_pct, round_id]
    if district_id is not None:
        query += " AND m.district_id = %s"
        params.append(district_id)
    query += """
        GROUP BY m.market_id, m.market_code, m.selected_market, m.domain, m.district_id, d.name, m.subdivision_id, sd.name, st.status, a.alert_count,
                 sa.surveyor_id, su.full_name, su.phone, st.submitted_at, sub.full_name, st.reviewed_at
        ORDER BY m.market_code
    """
    cur = await conn.execute(query, params)
    return await cur.fetchall()


async def list_pending_items_by_round(
    conn: AsyncConnection, round_id: int, district_id: int | None = None
):
    """Every (market, item) still awaiting a price this round, optionally scoped to one
    district. The "pending" definition is deliberately the same one the mobile app's
    submission gate enforces (see sync.queries.get_items_missing_prices): an ORIGINALLY
    SELECTED slot that is not marked ABSENT and where no shop in that market — substitute
    included — has recorded a price, N/A or not-applicable. Keeping the two in step means
    the dashboard's pending list matches what actually blocks a surveyor from submitting.
    """
    cur = await conn.execute(
        """
        SELECT DISTINCT
               m.market_id, m.market_code, m.selected_market,
               m.domain, m.district_id,
               d.name AS district_name,
               m.subdivision_id,
               sd.name AS subdivision,
               i.item_id, i.item_code, i.item_name,
               sa.surveyor_id,
               su.full_name AS surveyor_name
        FROM cpi_tripura_item_price_collection_shop_setup s_orig
        JOIN cpi_tripura_item i ON i.item_id = s_orig.item_id
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = s_orig.shop_id
        JOIN cpi_tripura_market m ON m.market_id = sh.market_id
        JOIN cpi_tripura_district d ON d.district_id = m.district_id
        LEFT JOIN cpi_tripura_subdivision sd ON sd.subdivision_id = m.subdivision_id
        LEFT JOIN cpi_tripura_surveyor_assignment sa
            ON sa.round_id = s_orig.round_id AND sa.market_id = m.market_id
        LEFT JOIN cpi_tripura_user su ON su.user_id = sa.surveyor_id
        WHERE s_orig.round_id = %s
          AND (%s::int IS NULL OR m.district_id = %s)
          AND s_orig.shop_selection_status = 'ORIGINALLY SELECTED'
          AND s_orig.item_availability_code IS DISTINCT FROM 'ABSENT'
          AND NOT EXISTS (
              SELECT 1
              FROM cpi_tripura_item_price_collection_shop_setup s_any
              JOIN cpi_tripura_market_shop sh2 ON sh2.shop_id = s_any.shop_id
              JOIN cpi_tripura_market_item mi
                  ON mi.item_id = s_any.item_id AND mi.shop_id = s_any.shop_id
                  AND mi.round_id = s_any.round_id
              JOIN cpi_tripura_price_data pd ON pd.market_item_id = mi.market_item_id
              WHERE s_any.item_id = s_orig.item_id
                AND sh2.market_id = sh.market_id
                AND s_any.round_id = %s
                AND (pd.current_period_price IS NOT NULL
                     OR pd.is_na = TRUE OR pd.is_not_applicable = TRUE)
          )
        ORDER BY district_name, market_code, item_code
        """,
        [round_id, district_id, district_id, round_id],
    )
    return await cur.fetchall()


async def list_setups_by_round_market(
    conn: AsyncConnection, round_id: int, market_id: int
):
    cur = await conn.execute(
        """
        SELECT
            s.item_price_collection_shop_setup_id AS setup_id,
            s.shop_selection_status,
            s.item_availability_code,
            s.remark,
            i.item_id, i.item_code, i.item_name,
            sh.shop_id, sh.shop_serial_no, sh.shop_name, sh.shop_description_and_location,
            mi.market_item_id, mi.unit_of_sale, mi.product_specification, mi.market_item_description
        FROM cpi_tripura_item_price_collection_shop_setup s
        JOIN cpi_tripura_item i ON i.item_id = s.item_id
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = s.shop_id
        LEFT JOIN cpi_tripura_market_item mi ON mi.item_id = s.item_id AND mi.shop_id = s.shop_id AND mi.round_id = s.round_id
        WHERE s.round_id = %s AND sh.market_id = %s
        ORDER BY i.item_code, s.shop_selection_status
        """,
        [round_id, market_id],
    )
    return await cur.fetchall()


async def list_setups_for_export(conn: AsyncConnection, round_id: int, market_id: int):
    """One row per setup, for rendering a market's setups back into the upload sheet.

    Same shape as list_setups_by_round_market, but DISTINCT ON the setup: a setup is
    unique on (item, shop, round) while a market_item additionally keys on
    product_specification + unit_of_sale, so the LEFT JOIN can match several. The
    lowest market_item_id wins deterministically and `market_item_count` tells the
    caller when it had to choose.
    """
    cur = await conn.execute(
        """
        SELECT * FROM (
            SELECT DISTINCT ON (s.item_price_collection_shop_setup_id)
                s.item_price_collection_shop_setup_id AS setup_id,
                s.shop_selection_status,
                s.item_availability_code,
                s.remark,
                i.item_id, i.item_code, i.item_name,
                sh.shop_id, sh.shop_serial_no, sh.shop_name, sh.shop_description_and_location,
                mi.market_item_id, mi.unit_of_sale, mi.product_specification, mi.market_item_description,
                COUNT(mi.market_item_id) OVER (
                    PARTITION BY s.item_price_collection_shop_setup_id
                ) AS market_item_count
            FROM cpi_tripura_item_price_collection_shop_setup s
            JOIN cpi_tripura_item i ON i.item_id = s.item_id
            JOIN cpi_tripura_market_shop sh ON sh.shop_id = s.shop_id
            LEFT JOIN cpi_tripura_market_item mi
                ON mi.item_id = s.item_id AND mi.shop_id = s.shop_id AND mi.round_id = s.round_id
            WHERE s.round_id = %s AND sh.market_id = %s
            ORDER BY s.item_price_collection_shop_setup_id, mi.market_item_id
        ) t
        ORDER BY item_code, shop_selection_status, shop_serial_no
        """,
        [round_id, market_id],
    )
    return await cur.fetchall()


async def list_market_items_for_round_market(
    conn: AsyncConnection, round_id: int, market_id: int
):
    """Every market_item of a market in a round, flagged with whether a collector has
    actually answered for it. Used to diff a re-uploaded setup sheet.

    A price_data row on its own does not mean anything was collected: rollover seeds
    one carrying only `previous_period_price`. Collected means a price, or an explicit
    NA / not-applicable answer.
    """
    cur = await conn.execute(
        """
        SELECT mi.market_item_id, mi.item_id, mi.shop_id,
               mi.unit_of_sale, mi.product_specification, mi.market_item_description,
               EXISTS (
                   SELECT 1 FROM cpi_tripura_price_data pd
                   WHERE pd.market_item_id = mi.market_item_id
                     AND (pd.current_period_price IS NOT NULL
                          OR pd.is_na OR pd.is_not_applicable)
               ) AS has_collected_price
        FROM cpi_tripura_market_item mi
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = mi.shop_id
        WHERE mi.round_id = %s AND sh.market_id = %s
        ORDER BY mi.market_item_id
        """,
        [round_id, market_id],
    )
    return await cur.fetchall()


async def delete_uncollected_market_item(
    conn: AsyncConnection, market_item_id: int
) -> bool:
    """Drop a market_item that no collector ever answered for, along with the
    price_data row that rollover seeded with last round's price.

    Returns False without writing anything when a price was actually collected —
    callers must have checked already, this is the backstop. Deliberately two
    statements: price_data references market_item ON DELETE RESTRICT and the
    constraint is not deferrable, so a data-modifying CTE would still see the
    parent row and fail.
    """
    cur = await conn.execute(
        """
        DELETE FROM cpi_tripura_price_data
        WHERE market_item_id = %s
          AND current_period_price IS NULL
          AND NOT is_na AND NOT is_not_applicable
        """,
        [market_item_id],
    )
    cur = await conn.execute(
        """
        DELETE FROM cpi_tripura_market_item
        WHERE market_item_id = %s
          AND NOT EXISTS (
              SELECT 1 FROM cpi_tripura_price_data pd
              WHERE pd.market_item_id = %s
          )
        RETURNING market_item_id
        """,
        [market_item_id, market_item_id],
    )
    return await cur.fetchone() is not None


async def list_setup_keys_for_round_market(
    conn: AsyncConnection, round_id: int, market_id: int
):
    """Minimal (item, shop) -> setup lookup for diffing a re-uploaded setup sheet.

    Carries shop_serial_no so a shop swapped out of a slot can be named in the
    reported change without a second lookup."""
    cur = await conn.execute(
        """
        SELECT s.item_price_collection_shop_setup_id AS setup_id,
               s.item_id, s.shop_id, s.shop_selection_status, sh.shop_serial_no
        FROM cpi_tripura_item_price_collection_shop_setup s
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = s.shop_id
        WHERE s.round_id = %s AND sh.market_id = %s
        """,
        [round_id, market_id],
    )
    return await cur.fetchall()


async def list_collected_data_by_round_market(
    conn: AsyncConnection, round_id: int, market_id: int
):
    cur = await conn.execute(
        """
        WITH prev_round AS (
            SELECT round_id FROM cpi_tripura_survey_round
            WHERE round_number < (
                SELECT round_number FROM cpi_tripura_survey_round WHERE round_id = %s
            )
            ORDER BY round_number DESC
            LIMIT 1
        )
        SELECT
            s.item_price_collection_shop_setup_id AS setup_id,
            i.item_id, i.item_code, i.item_name,
            sh.shop_id, sh.shop_serial_no, sh.shop_name,
            s.shop_selection_status,
            s.item_availability_code,
            s.remark AS ds_remark,
            mi.market_item_id, mi.unit_of_sale, mi.product_specification,
            mi.market_item_description,
            COALESCE(prev_pd.current_period_price, pd.previous_period_price) AS previous_period_price,
            pd.current_period_price,
            pd.is_na,
            pd.is_not_applicable,
            pd.price_recording_date,
            pd.remark AS price_remark,
            CASE
                WHEN pd.current_period_price IS NOT NULL
                    AND COALESCE(prev_pd.current_period_price, pd.previous_period_price) IS NOT NULL
                THEN pd.current_period_price - COALESCE(prev_pd.current_period_price, pd.previous_period_price)
            END AS price_change,
            CASE
                WHEN pd.current_period_price IS NOT NULL
                    AND COALESCE(prev_pd.current_period_price, pd.previous_period_price) IS NOT NULL
                    AND COALESCE(prev_pd.current_period_price, pd.previous_period_price) != 0
                THEN ROUND(
                    (pd.current_period_price - COALESCE(prev_pd.current_period_price, pd.previous_period_price))
                    * 100.0 / COALESCE(prev_pd.current_period_price, pd.previous_period_price), 2
                )
            END AS price_change_percentage,
            CASE
                WHEN pd.current_period_price IS NOT NULL
                    AND COALESCE(prev_pd.current_period_price, pd.previous_period_price) IS NOT NULL
                    AND COALESCE(prev_pd.current_period_price, pd.previous_period_price) != 0
                THEN ABS(pd.current_period_price - COALESCE(prev_pd.current_period_price, pd.previous_period_price))
                    * 100.0 / COALESCE(prev_pd.current_period_price, pd.previous_period_price) >= %s
                ELSE FALSE
            END AS price_alert
        FROM cpi_tripura_item_price_collection_shop_setup s
        JOIN cpi_tripura_item i ON i.item_id = s.item_id
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = s.shop_id
        LEFT JOIN cpi_tripura_market_item mi
            ON mi.item_id = s.item_id AND mi.shop_id = s.shop_id AND mi.round_id = s.round_id
        LEFT JOIN cpi_tripura_price_data pd ON pd.market_item_id = mi.market_item_id
        LEFT JOIN cpi_tripura_market_item prev_mi
            ON prev_mi.item_id = mi.item_id
            AND prev_mi.shop_id = mi.shop_id
            AND prev_mi.unit_of_sale = mi.unit_of_sale
            AND prev_mi.product_specification IS NOT DISTINCT FROM mi.product_specification
            AND prev_mi.round_id = (SELECT round_id FROM prev_round)
        LEFT JOIN cpi_tripura_price_data prev_pd
            ON prev_pd.market_item_id = prev_mi.market_item_id
        WHERE s.round_id = %s AND sh.market_id = %s
        ORDER BY i.item_code, s.shop_selection_status
        """,
        [round_id, settings.price_alert_threshold_pct, round_id, market_id],
    )
    return await cur.fetchall()


# ── Setup queries ─────────────────────────────────────────────────


async def get_setup(conn: AsyncConnection, setup_id: int):
    cur = await conn.execute(
        """
        SELECT
            s.item_price_collection_shop_setup_id AS setup_id,
            s.shop_selection_status,
            s.item_availability_code,
            s.remark,
            s.round_id,
            i.item_id, i.item_code, i.item_name,
            sh.shop_id, sh.shop_serial_no, sh.shop_name, sh.shop_description_and_location,
            sh.market_id,
            mi.market_item_id, mi.unit_of_sale, mi.product_specification, mi.market_item_description
        FROM cpi_tripura_item_price_collection_shop_setup s
        JOIN cpi_tripura_item i ON i.item_id = s.item_id
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = s.shop_id
        LEFT JOIN cpi_tripura_market_item mi ON mi.item_id = s.item_id AND mi.shop_id = s.shop_id AND mi.round_id = s.round_id
        WHERE s.item_price_collection_shop_setup_id = %s
        """,
        [setup_id],
    )
    return await cur.fetchone()


async def create_setup(conn: AsyncConnection, data: dict):
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))
    cur = await conn.execute(
        f"INSERT INTO cpi_tripura_item_price_collection_shop_setup ({cols}) VALUES ({placeholders}) RETURNING item_price_collection_shop_setup_id",
        list(data.values()),
    )
    row = await cur.fetchone()
    return await get_setup(conn, row["item_price_collection_shop_setup_id"])


async def update_setup(conn: AsyncConnection, setup_id: int, data: dict):
    if not data:
        return await get_setup(conn, setup_id)
    sets = ", ".join(f"{k} = %s" for k in data)
    sets += ", modified_at = CURRENT_TIMESTAMP"
    params = list(data.values()) + [setup_id]
    cur = await conn.execute(
        f"""
        UPDATE cpi_tripura_item_price_collection_shop_setup
        SET {sets}
        WHERE item_price_collection_shop_setup_id = %s
        RETURNING item_price_collection_shop_setup_id
        """,
        params,
    )
    row = await cur.fetchone()
    if not row:
        return None
    return await get_setup(conn, row["item_price_collection_shop_setup_id"])


async def delete_setup(conn: AsyncConnection, setup_id: int):
    cur = await conn.execute(
        """
        DELETE FROM cpi_tripura_item_price_collection_shop_setup
        WHERE item_price_collection_shop_setup_id = %s
        RETURNING item_price_collection_shop_setup_id
        """,
        [setup_id],
    )
    return await cur.fetchone()


async def delete_setups_for_item(
    conn: AsyncConnection, round_id: int, market_id: int, item_id: int
):
    """Delete every setup row for an item within a round + market.
    Setup rows have no inbound FKs, so this is always allowed."""
    cur = await conn.execute(
        """
        DELETE FROM cpi_tripura_item_price_collection_shop_setup s
        USING cpi_tripura_market_shop sh
        WHERE s.shop_id = sh.shop_id
          AND s.round_id = %s
          AND s.item_id = %s
          AND sh.market_id = %s
        RETURNING s.item_price_collection_shop_setup_id
        """,
        [round_id, item_id, market_id],
    )
    return await cur.fetchall()


async def cleanup_orphan_market_items(
    conn: AsyncConnection,
    round_id: int,
    market_id: int,
    item_id: int,
    keep_shop_ids: list[int],
):
    """Delete this item's market_items in a market whose shop is no longer selected
    and that have no collected price_data. Market items with prices are preserved
    (their price_data FK would block deletion anyway)."""
    cur = await conn.execute(
        """
        DELETE FROM cpi_tripura_market_item mi
        USING cpi_tripura_market_shop sh
        WHERE mi.shop_id = sh.shop_id
          AND mi.round_id = %s
          AND mi.item_id = %s
          AND sh.market_id = %s
          AND mi.shop_id <> ALL(%s::int[])
          AND NOT EXISTS (
              SELECT 1 FROM cpi_tripura_price_data pd
              WHERE pd.market_item_id = mi.market_item_id
          )
        RETURNING mi.market_item_id
        """,
        [round_id, item_id, market_id, keep_shop_ids],
    )
    return await cur.fetchall()


# ── Assignment queries ──────────────────────────────────────────────


async def get_assignment(conn: AsyncConnection, assignment_id: int):
    cur = await conn.execute(
        """
        SELECT
            a.surveyor_assignment_id,
            a.surveyor_id,
            s.full_name AS surveyor_name,
            COALESCE(s.phone, '') AS surveyor_phone,
            a.round_id,
            r.round_number,
            r.round_name,
            a.market_id,
            m.selected_market AS market_name,
            m.market_code,
            a.created_at,
            a.modified_at
        FROM cpi_tripura_surveyor_assignment a
        JOIN cpi_tripura_user s ON s.user_id = a.surveyor_id
        JOIN cpi_tripura_survey_round r ON r.round_id = a.round_id
        JOIN cpi_tripura_market m ON m.market_id = a.market_id
        WHERE a.surveyor_assignment_id = %s
        """,
        [assignment_id],
    )
    return await cur.fetchone()


async def get_market_surveyor(conn: AsyncConnection, round_id: int, market_id: int):
    """Return the surveyor currently assigned to this (round, market), or None."""
    cur = await conn.execute(
        """
        SELECT
            a.surveyor_id,
            s.full_name AS surveyor_name,
            COALESCE(s.phone, '') AS surveyor_phone
        FROM cpi_tripura_surveyor_assignment a
        JOIN cpi_tripura_user s ON s.user_id = a.surveyor_id
        WHERE a.round_id = %s AND a.market_id = %s
        """,
        [round_id, market_id],
    )
    return await cur.fetchone()


async def list_assignments_by_round(
    conn: AsyncConnection, round_id: int, district_id: int | None = None
):
    query = """
        SELECT
            a.surveyor_assignment_id,
            a.surveyor_id,
            s.full_name AS surveyor_name,
            COALESCE(s.phone, '') AS surveyor_phone,
            a.round_id,
            r.round_number,
            r.round_name,
            a.market_id,
            m.selected_market AS market_name,
            m.market_code,
            a.created_at,
            a.modified_at
        FROM cpi_tripura_surveyor_assignment a
        JOIN cpi_tripura_user s ON s.user_id = a.surveyor_id
        JOIN cpi_tripura_survey_round r ON r.round_id = a.round_id
        JOIN cpi_tripura_market m ON m.market_id = a.market_id
        WHERE a.round_id = %s
    """
    params: list = [round_id]
    if district_id is not None:
        query += " AND m.district_id = %s"
        params.append(district_id)
    query += " ORDER BY m.selected_market"
    cur = await conn.execute(query, params)
    return await cur.fetchall()


async def create_assignment(conn: AsyncConnection, data: dict):
    cur = await conn.execute(
        """
        INSERT INTO cpi_tripura_surveyor_assignment (surveyor_id, round_id, market_id)
        VALUES (%s, %s, %s)
        RETURNING surveyor_assignment_id
        """,
        [data["surveyor_id"], data["round_id"], data["market_id"]],
    )
    row = await cur.fetchone()
    return await get_assignment(conn, row["surveyor_assignment_id"])


async def update_assignment(conn: AsyncConnection, assignment_id: int, data: dict):
    if not data:
        return await get_assignment(conn, assignment_id)

    sets = ", ".join(f"{k} = %s" for k in data)
    params = list(data.values()) + [assignment_id]
    cur = await conn.execute(
        f"""
        UPDATE cpi_tripura_surveyor_assignment
        SET {sets}
        WHERE surveyor_assignment_id = %s
        RETURNING surveyor_assignment_id
        """,
        params,
    )
    row = await cur.fetchone()
    if not row:
        return None
    return await get_assignment(conn, row["surveyor_assignment_id"])


async def delete_assignment(conn: AsyncConnection, assignment_id: int):
    cur = await conn.execute(
        """
        DELETE FROM cpi_tripura_surveyor_assignment
        WHERE surveyor_assignment_id = %s
        RETURNING surveyor_assignment_id
        """,
        [assignment_id],
    )
    return await cur.fetchone()


async def surveyor_market_same_district(
    conn: AsyncConnection, surveyor_id: int, market_id: int
) -> bool:
    """True only when both the surveyor and the market exist and share a district.
    Enforced for every assignment create/reassign — including admins, for whom the
    district scope guards are no-ops."""
    cur = await conn.execute(
        """
        SELECT u.district_id AS surveyor_district, m.district_id AS market_district
        FROM cpi_tripura_user u, cpi_tripura_market m
        WHERE u.user_id = %s AND m.market_id = %s
        """,
        [surveyor_id, market_id],
    )
    row = await cur.fetchone()
    return row is not None and row["surveyor_district"] == row["market_district"]


async def list_markets_for_surveyor(
    conn: AsyncConnection, surveyor_id: int, round_id: int | None = None
):
    query = """
        SELECT
            a.surveyor_assignment_id,
            a.surveyor_id,
            a.round_id,
            r.round_number,
            r.round_name,
            m.market_id,
            m.selected_market AS market_name,
            m.market_code,
            m.domain,
            d.name AS district_name,
            a.created_at,
            a.modified_at
        FROM cpi_tripura_surveyor_assignment a
        JOIN cpi_tripura_survey_round r ON r.round_id = a.round_id
        JOIN cpi_tripura_market m ON m.market_id = a.market_id
        JOIN cpi_tripura_district d ON d.district_id = m.district_id
        WHERE a.surveyor_id = %s
    """
    params: list = [surveyor_id]
    if round_id is not None:
        query += " AND a.round_id = %s"
        params.append(round_id)
    query += " ORDER BY r.round_number DESC, m.selected_market"

    cur = await conn.execute(query, params)
    return await cur.fetchall()


async def list_surveyors(conn: AsyncConnection):
    cur = await conn.execute(
        """
        SELECT user_id AS surveyor_id, username, full_name, COALESCE(phone, '') AS phone, is_active,
               district_id, created_at, modified_at
        FROM cpi_tripura_user
        WHERE user_role = 'PRICE_COLLECTOR'
        ORDER BY full_name
        """
    )
    return await cur.fetchall()


async def list_markets(conn: AsyncConnection):
    cur = await conn.execute(
        """
        SELECT
            m.market_id,
            m.selected_market AS market_name,
            m.market_code,
            m.domain,
            m.district_id,
            d.name AS district_name,
            m.created_at,
            m.modified_at
        FROM cpi_tripura_market m
        JOIN cpi_tripura_district d ON d.district_id = m.district_id
        ORDER BY m.selected_market
        """
    )
    return await cur.fetchall()


async def get_previous_round(conn: AsyncConnection, round_id: int):
    """Find the round with the highest round_number below the given round's,
    within the same cycle (rollover never crosses monthly/quarterly/yearly)."""
    cur = await conn.execute(
        """
        SELECT * FROM cpi_tripura_survey_round
        WHERE cycle = (SELECT cycle FROM cpi_tripura_survey_round WHERE round_id = %s)
          AND round_number < (
              SELECT round_number FROM cpi_tripura_survey_round WHERE round_id = %s
          )
        ORDER BY round_number DESC
        LIMIT 1
        """,
        [round_id, round_id],
    )
    return await cur.fetchone()


async def rollover_assignments(
    conn: AsyncConnection,
    target_round_id: int,
    source_round_id: int,
    district_id: int | None = None,
) -> int:
    """Copy assignments from source round to target round. When district_id is given,
    only markets in that district are copied (district supervisor scope). Returns count
    of rows inserted."""
    if district_id is None:
        cur = await conn.execute(
            """
            INSERT INTO cpi_tripura_surveyor_assignment (surveyor_id, round_id, market_id)
            SELECT surveyor_id, %s, market_id
            FROM cpi_tripura_surveyor_assignment
            WHERE round_id = %s
            ON CONFLICT (round_id, market_id) DO NOTHING
            """,
            [target_round_id, source_round_id],
        )
    else:
        cur = await conn.execute(
            """
            INSERT INTO cpi_tripura_surveyor_assignment (surveyor_id, round_id, market_id)
            SELECT a.surveyor_id, %s, a.market_id
            FROM cpi_tripura_surveyor_assignment a
            JOIN cpi_tripura_market m ON m.market_id = a.market_id
            WHERE a.round_id = %s AND m.district_id = %s
            ON CONFLICT (round_id, market_id) DO NOTHING
            """,
            [target_round_id, source_round_id, district_id],
        )
    return cur.rowcount


async def rollover_setups(
    conn: AsyncConnection,
    target_round_id: int,
    source_round_id: int,
    district_id: int | None = None,
) -> int:
    """Copy shop-item setups from source round to target round. When district_id is given,
    only setups in that district's markets are copied. Returns count of rows inserted."""
    if district_id is None:
        cur = await conn.execute(
            """
            INSERT INTO cpi_tripura_item_price_collection_shop_setup
                (item_id, shop_id, shop_selection_status, item_availability_code, round_id)
            SELECT item_id, shop_id, shop_selection_status, item_availability_code, %s
            FROM cpi_tripura_item_price_collection_shop_setup
            WHERE round_id = %s
            ON CONFLICT (item_id, shop_id, round_id) DO NOTHING
            """,
            [target_round_id, source_round_id],
        )
    else:
        cur = await conn.execute(
            """
            INSERT INTO cpi_tripura_item_price_collection_shop_setup
                (item_id, shop_id, shop_selection_status, item_availability_code, round_id)
            SELECT s.item_id, s.shop_id, s.shop_selection_status, s.item_availability_code, %s
            FROM cpi_tripura_item_price_collection_shop_setup s
            JOIN cpi_tripura_market_shop sh ON sh.shop_id = s.shop_id
            JOIN cpi_tripura_market m ON m.market_id = sh.market_id
            WHERE s.round_id = %s AND m.district_id = %s
            ON CONFLICT (item_id, shop_id, round_id) DO NOTHING
            """,
            [target_round_id, source_round_id, district_id],
        )
    return cur.rowcount


async def rollover_market_items(
    conn: AsyncConnection,
    target_round_id: int,
    source_round_id: int,
    district_id: int | None = None,
) -> int:
    """Copy market items from source round to target round. When district_id is given,
    only market items in that district's markets are copied. Returns count of rows inserted."""
    district_filter = ""
    params: list = [target_round_id, source_round_id, target_round_id]
    if district_id is not None:
        district_filter = """
        AND EXISTS (
            SELECT 1 FROM cpi_tripura_market_shop sh
            JOIN cpi_tripura_market m ON m.market_id = sh.market_id
            WHERE sh.shop_id = src.shop_id AND m.district_id = %s
        )
        """
        params.append(district_id)
    cur = await conn.execute(
        f"""
        INSERT INTO cpi_tripura_market_item (
            item_id, shop_id, round_id,
            market_item_description, item_branding, item_packaging,
            package_size_value, package_size_unit, item_variety,
            unit_of_sale, product_specification, notes
        )
        SELECT
            item_id, shop_id, %s,
            market_item_description, item_branding, item_packaging,
            package_size_value, package_size_unit, item_variety,
            unit_of_sale, product_specification, notes
        FROM cpi_tripura_market_item src
        WHERE src.round_id = %s
        AND NOT EXISTS (
            SELECT 1 FROM cpi_tripura_market_item tgt
            WHERE tgt.item_id = src.item_id
            AND tgt.shop_id = src.shop_id
            AND tgt.round_id = %s
            AND tgt.unit_of_sale = src.unit_of_sale
            AND tgt.product_specification IS NOT DISTINCT FROM src.product_specification
        )
        {district_filter}
        """,
        params,
    )
    return cur.rowcount


async def rollover_price_data(
    conn: AsyncConnection,
    target_round_id: int,
    source_round_id: int,
    district_id: int | None = None,
) -> int:
    """Pre-create price_data rows for the target round with previous_period_price
    copied from the source round's current_period_price. Only copies rows where
    the source has a non-NULL current_period_price. Matches via item_id, shop_id,
    unit_of_sale, product_specification. When district_id is given, only the district's
    markets are processed."""
    district_filter = ""
    params: list = [target_round_id, source_round_id]
    if district_id is not None:
        district_filter = """
          AND EXISTS (
              SELECT 1 FROM cpi_tripura_market_shop sh
              JOIN cpi_tripura_market m ON m.market_id = sh.market_id
              WHERE sh.shop_id = src.shop_id AND m.district_id = %s
          )
        """
        params.append(district_id)
    cur = await conn.execute(
        f"""
        INSERT INTO cpi_tripura_price_data (market_item_id, previous_period_price)
        SELECT tgt.market_item_id, src_pd.current_period_price
        FROM cpi_tripura_market_item src
        JOIN cpi_tripura_price_data src_pd ON src_pd.market_item_id = src.market_item_id
        JOIN cpi_tripura_market_item tgt
            ON tgt.item_id = src.item_id
            AND tgt.shop_id = src.shop_id
            AND tgt.unit_of_sale = src.unit_of_sale
            AND tgt.product_specification IS NOT DISTINCT FROM src.product_specification
            AND tgt.round_id = %s
        WHERE src.round_id = %s
          AND src_pd.current_period_price IS NOT NULL
          {district_filter}
        ON CONFLICT (market_item_id) DO NOTHING
        """,
        params,
    )
    return cur.rowcount


# ── Price data queries ────────────────────────────────────────────


async def verify_surveyor_can_submit(
    conn: AsyncConnection, surveyor_id: int, market_item_id: int
) -> bool:
    cur = await conn.execute(
        """
        SELECT 1
        FROM cpi_tripura_market_item mi
        JOIN cpi_tripura_market_shop s ON s.shop_id = mi.shop_id
        JOIN cpi_tripura_surveyor_assignment a
            ON a.market_id = s.market_id AND a.round_id = mi.round_id
        WHERE a.surveyor_id = %s
          AND mi.market_item_id = %s
        LIMIT 1
        """,
        [surveyor_id, market_item_id],
    )
    return (await cur.fetchone()) is not None


# ── Market survey status (per round+market approval workflow) ─────────────────


async def get_market_status(conn: AsyncConnection, round_id: int, market_id: int):
    """Return the status row for a (round, market), or None if one was never created.
    A missing row is treated as IN_PROGRESS by callers."""
    cur = await conn.execute(
        """
        SELECT st.round_id, st.market_id, st.status,
               st.submitted_at, st.submitted_by, u.full_name AS submitted_by_name,
               st.reviewed_at, st.reviewed_by, st.review_remark
        FROM cpi_tripura_market_survey_status st
        LEFT JOIN cpi_tripura_user u ON u.user_id = st.submitted_by
        WHERE st.round_id = %s AND st.market_id = %s
        """,
        [round_id, market_id],
    )
    return await cur.fetchone()


async def submit_markets_for_round(
    conn: AsyncConnection,
    surveyor_id: int,
    round_id: int,
    market_id: int | None = None,
) -> int:
    """Mark every IN_PROGRESS (or status-less) market assigned to the surveyor in this
    round as SUBMITTED. Pass market_id to submit just that one market; None submits all
    of them. Markets already SUBMITTED/APPROVED are left untouched. Idempotent;
    re-submitting after an un-submit re-closes the reopened markets. Returns the number of
    markets newly submitted."""
    cur = await conn.execute(
        """
        INSERT INTO cpi_tripura_market_survey_status
            (round_id, market_id, status, submitted_at, submitted_by)
        SELECT a.round_id, a.market_id, 'SUBMITTED', CURRENT_TIMESTAMP, %s
        FROM cpi_tripura_surveyor_assignment a
        LEFT JOIN cpi_tripura_market_survey_status st
            ON st.round_id = a.round_id AND st.market_id = a.market_id
        WHERE a.surveyor_id = %s AND a.round_id = %s
          AND (%s::int IS NULL OR a.market_id = %s)
          AND (st.status IS NULL OR st.status = 'IN_PROGRESS')
        ON CONFLICT (round_id, market_id) DO UPDATE SET
            status = 'SUBMITTED',
            submitted_at = CURRENT_TIMESTAMP,
            submitted_by = EXCLUDED.submitted_by,
            modified_at = CURRENT_TIMESTAMP
        """,
        [surveyor_id, surveyor_id, round_id, market_id, market_id],
    )
    return cur.rowcount


async def approve_market(
    conn: AsyncConnection, round_id: int, market_id: int, reviewer_id: int
):
    """Approve a SUBMITTED market. Returns the updated row, or None if it is not currently
    awaiting approval."""
    cur = await conn.execute(
        """
        UPDATE cpi_tripura_market_survey_status
        SET status = 'APPROVED',
            reviewed_at = CURRENT_TIMESTAMP,
            reviewed_by = %s,
            review_remark = NULL,
            modified_at = CURRENT_TIMESTAMP
        WHERE round_id = %s AND market_id = %s AND status = 'SUBMITTED'
        RETURNING round_id, market_id, status,
                  submitted_at, submitted_by, reviewed_at, reviewed_by, review_remark
        """,
        [reviewer_id, round_id, market_id],
    )
    return await cur.fetchone()


async def unsubmit_market(
    conn: AsyncConnection,
    round_id: int,
    market_id: int,
    reviewer_id: int,
    review_remark: str | None = None,
):
    """Reopen a SUBMITTED or APPROVED market back to IN_PROGRESS so the price collector can
    re-survey it. Returns the updated row, or None if there was nothing to reopen."""
    cur = await conn.execute(
        """
        UPDATE cpi_tripura_market_survey_status
        SET status = 'IN_PROGRESS',
            submitted_at = NULL,
            submitted_by = NULL,
            reviewed_at = CURRENT_TIMESTAMP,
            reviewed_by = %s,
            review_remark = %s,
            modified_at = CURRENT_TIMESTAMP
        WHERE round_id = %s AND market_id = %s AND status IN ('SUBMITTED', 'APPROVED')
        RETURNING round_id, market_id, status,
                  submitted_at, submitted_by, reviewed_at, reviewed_by, review_remark
        """,
        [reviewer_id, review_remark, round_id, market_id],
    )
    return await cur.fetchone()


async def upsert_price_data(conn: AsyncConnection, data: dict):
    cur = await conn.execute(
        """
        INSERT INTO cpi_tripura_price_data (
            market_item_id,
            current_period_price,
            is_na,
            is_not_applicable,
            remark,
            price_recording_date
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (market_item_id)
        DO UPDATE SET
            current_period_price = EXCLUDED.current_period_price,
            is_na = EXCLUDED.is_na,
            is_not_applicable = EXCLUDED.is_not_applicable,
            remark = EXCLUDED.remark,
            price_recording_date = EXCLUDED.price_recording_date,
            modified_at = CURRENT_TIMESTAMP
        RETURNING *
        """,
        [
            data["market_item_id"],
            data.get("current_period_price"),
            data.get("is_na", False),
            data.get("is_not_applicable", False),
            data.get("remark"),
            data["price_recording_date"],
        ],
    )
    return await cur.fetchone()
