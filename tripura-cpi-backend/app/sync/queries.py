from psycopg import AsyncConnection


async def get_current_round(conn: AsyncConnection):
    # The "current" round is the single ACTIVE round of the monthly cycle (the only
    # cycle wired up today). Returns None between rounds (none ACTIVE).
    cur = await conn.execute(
        "SELECT * FROM cpi_tripura_survey_round "
        "WHERE round_status = 'ACTIVE' AND cycle = 'MONTHLY'"
    )
    return await cur.fetchone()


async def get_surveyor_markets(conn: AsyncConnection, surveyor_id: int, round_id: int):
    # Only markets the price collector can still work on are returned: those that are
    # IN_PROGRESS (or never submitted). SUBMITTED/APPROVED markets are hidden until a
    # supervisor un-submits them.
    cur = await conn.execute(
        """
        SELECT m.market_id, m.market_code, m.selected_market, m.domain,
               d.name AS district_name, d.code AS district_code,
               m.village_town, m.address,
               st.review_remark AS review_remark
        FROM cpi_tripura_surveyor_assignment a
        JOIN cpi_tripura_market m ON m.market_id = a.market_id
        JOIN cpi_tripura_district d ON d.district_id = m.district_id
        LEFT JOIN cpi_tripura_market_survey_status st
            ON st.round_id = a.round_id AND st.market_id = a.market_id
        WHERE a.surveyor_id = %s AND a.round_id = %s
          AND (st.status IS NULL OR st.status = 'IN_PROGRESS')
        """,
        [surveyor_id, round_id],
    )
    return await cur.fetchall()


async def get_all_setups_for_surveyor(
    conn: AsyncConnection, surveyor_id: int, round_id: int
):
    cur = await conn.execute(
        """
        SELECT s.item_price_collection_shop_setup_id, s.item_id, s.shop_id,
               s.shop_selection_status, s.item_availability_code,
               i.item_code, i.item_name,
               sh.shop_serial_no, sh.shop_name, sh.shop_phone_number,
               sh.shop_description_and_location, sh.general_description_of_items_sold,
               sh.market_id,
               mi.market_item_id, mi.market_item_description,
               mi.product_specification, mi.unit_of_sale,
               pd.current_period_price, COALESCE(pd.is_na, FALSE) AS is_na,
               COALESCE(pd.is_not_applicable, FALSE) AS is_not_applicable,
               pd.remark,
               s.remark AS ds_remark,
               pd.previous_period_price AS stored_previous_period_price
        FROM cpi_tripura_item_price_collection_shop_setup s
        JOIN cpi_tripura_item i ON i.item_id = s.item_id
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = s.shop_id
        LEFT JOIN cpi_tripura_market_item mi
            ON mi.item_id = s.item_id AND mi.shop_id = s.shop_id AND mi.round_id = s.round_id
        LEFT JOIN cpi_tripura_price_data pd ON pd.market_item_id = mi.market_item_id
        WHERE s.round_id = %s
          AND sh.market_id IN (
              SELECT a.market_id FROM cpi_tripura_surveyor_assignment a
              WHERE a.surveyor_id = %s AND a.round_id = %s
          )
        ORDER BY sh.market_id, i.item_code, s.shop_selection_status
        """,
        [round_id, surveyor_id, round_id],
    )
    return await cur.fetchall()


async def get_previous_prices(conn: AsyncConnection, surveyor_id: int, round_id: int):
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
        SELECT mi.item_id, mi.shop_id,
               prev_pd.current_period_price AS previous_period_price
        FROM cpi_tripura_market_item mi
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = mi.shop_id
        JOIN cpi_tripura_market_item prev_mi
            ON prev_mi.item_id = mi.item_id
            AND prev_mi.shop_id = mi.shop_id
            AND prev_mi.unit_of_sale = mi.unit_of_sale
            AND prev_mi.product_specification IS NOT DISTINCT FROM mi.product_specification
            AND prev_mi.round_id = (SELECT round_id FROM prev_round)
        JOIN cpi_tripura_price_data prev_pd
            ON prev_pd.market_item_id = prev_mi.market_item_id
        WHERE mi.round_id = %s
          AND prev_pd.current_period_price IS NOT NULL
          AND sh.market_id IN (
              SELECT a.market_id FROM cpi_tripura_surveyor_assignment a
              WHERE a.surveyor_id = %s AND a.round_id = %s
          )
        """,
        [round_id, round_id, surveyor_id, round_id],
    )
    return await cur.fetchall()


# ── Submission queries ────────────────────────────────────────────


async def get_assigned_market_item_ids(
    conn: AsyncConnection, surveyor_id: int, round_id: int
) -> set[int]:
    """Return the market_item_ids the surveyor is legitimately allowed to write in this
    round — those belonging to a market assigned to them. Any record whose market_item_id
    is not in this set is a cross-market/cross-district write attempt and must be rejected."""
    cur = await conn.execute(
        """
        SELECT mi.market_item_id
        FROM cpi_tripura_market_item mi
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = mi.shop_id
        JOIN cpi_tripura_surveyor_assignment a
            ON a.market_id = sh.market_id AND a.round_id = mi.round_id
        WHERE a.surveyor_id = %s AND mi.round_id = %s
        """,
        [surveyor_id, round_id],
    )
    rows = await cur.fetchall()
    return {r["market_item_id"] for r in rows}


async def get_locked_market_item_ids(
    conn: AsyncConnection, surveyor_id: int, round_id: int
) -> set[int]:
    """Return the market_item_ids that belong to the surveyor's SUBMITTED/APPROVED markets
    in this round. Price records for these are rejected — the market is awaiting (or has
    passed) supervisor review and is locked to the price collector."""
    cur = await conn.execute(
        """
        SELECT mi.market_item_id
        FROM cpi_tripura_market_item mi
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = mi.shop_id
        JOIN cpi_tripura_surveyor_assignment a
            ON a.market_id = sh.market_id AND a.round_id = mi.round_id
        JOIN cpi_tripura_market_survey_status st
            ON st.round_id = a.round_id AND st.market_id = a.market_id
        WHERE a.surveyor_id = %s AND mi.round_id = %s
          AND st.status IN ('SUBMITTED', 'APPROVED')
        """,
        [surveyor_id, round_id],
    )
    rows = await cur.fetchall()
    return {r["market_item_id"] for r in rows}


async def is_market_assigned_to_surveyor(
    conn: AsyncConnection, surveyor_id: int, round_id: int, market_id: int
) -> bool:
    """A price collector may only submit a market assigned to them in this round."""
    cur = await conn.execute(
        "SELECT 1 FROM cpi_tripura_surveyor_assignment "
        "WHERE surveyor_id = %s AND round_id = %s AND market_id = %s",
        [surveyor_id, round_id, market_id],
    )
    return (await cur.fetchone()) is not None


async def get_items_missing_prices(
    conn: AsyncConnection, surveyor_id: int, round_id: int, market_id: int | None = None
):
    """Items the surveyor still has to price this round. Pass market_id to scope the
    completeness check to a single market (per-market submission); None checks every
    market assigned to them."""
    cur = await conn.execute(
        """
        SELECT DISTINCT i.item_id, i.item_code, i.item_name,
               m.market_id, m.market_code, m.selected_market,
               'missing_current_price' AS reason
        FROM cpi_tripura_item_price_collection_shop_setup s_orig
        JOIN cpi_tripura_item i ON i.item_id = s_orig.item_id
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = s_orig.shop_id
        JOIN cpi_tripura_market m ON m.market_id = sh.market_id
        JOIN cpi_tripura_surveyor_assignment a
            ON a.market_id = m.market_id AND a.round_id = %s AND a.surveyor_id = %s
        WHERE s_orig.round_id = %s
          AND (%s::int IS NULL OR m.market_id = %s)
          AND s_orig.shop_selection_status = 'ORIGINALLY SELECTED'
          AND s_orig.item_availability_code IS DISTINCT FROM 'ABSENT'
          AND NOT EXISTS (
              SELECT 1
              FROM cpi_tripura_item_price_collection_shop_setup s_any
              JOIN cpi_tripura_market_shop sh2 ON sh2.shop_id = s_any.shop_id
              JOIN cpi_tripura_market_item mi
                  ON mi.item_id = s_any.item_id AND mi.shop_id = s_any.shop_id AND mi.round_id = s_any.round_id
              JOIN cpi_tripura_price_data pd ON pd.market_item_id = mi.market_item_id
              WHERE s_any.item_id = s_orig.item_id
                AND sh2.market_id = sh.market_id
                AND s_any.round_id = %s
                AND (pd.current_period_price IS NOT NULL OR pd.is_na = TRUE OR pd.is_not_applicable = TRUE)
          )

        ORDER BY market_code, item_code
        """,
        [
            round_id,
            surveyor_id,
            round_id,
            market_id,
            market_id,
            round_id,
        ],
    )
    return await cur.fetchall()
