from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from app.config import settings

# Superset of columns for the market survey detailed report. Selects every
# column the catalog offers; the service projects the user's chosen subset
# at render time. Mirrors the price-comparison logic of
# app/survey/queries.py:list_collected_data_by_round_market, widened to
# span markets and carry district/market names.
#
# One item in one market has up to three setup rows — one per shop slot
# (ORIGINALLY SELECTED / SUBSTITUTE 1 / SUBSTITUTE 2, plus a possible NOT
# SELECTED) — and more than one of them can carry a price row: when an item
# is unavailable at the originally selected shop the collector marks that
# slot NA and records the actual price against a substitute. The DISTINCT ON
# below keeps the slot that holds the reported price, preferring a real price
# over an NA/not-applicable marker, then falling back to the earliest slot so
# a pending item still appears once. shop_selection_status names which slot
# survived.
_PRICE_SUPERSET_SQL = """
    WITH prev_round AS (
        SELECT round_id FROM cpi_tripura_survey_round
        WHERE round_number < (
            SELECT round_number FROM cpi_tripura_survey_round WHERE round_id = %(round_id)s
        )
        ORDER BY round_number DESC
        LIMIT 1
    ),
    shop_slots AS (
    SELECT
        m.market_id, i.item_id,
        -- COALESCE: with no price row at all every operand is NULL, and
        -- ORDER BY has_price DESC defaults to NULLS FIRST — which would rank
        -- an uncollected slot above the collected one.
        COALESCE(
            pd.current_period_price IS NOT NULL OR pd.is_na OR pd.is_not_applicable,
            FALSE
        ) AS has_price,
        -- Outranks has_price so a substitute holding the actual price beats an
        -- originally selected slot the collector only marked NA.
        (pd.current_period_price IS NOT NULL) AS has_real_price,
        CASE s.shop_selection_status
            WHEN 'ORIGINALLY SELECTED' THEN 1
            WHEN 'SUBSTITUTE 1' THEN 2
            WHEN 'SUBSTITUTE 2' THEN 3
            ELSE 4
        END AS selection_rank,
        d.name AS district_name,
        m.market_code,
        m.selected_market AS market_name,
        m.domain,
        i.item_code, i.item_name,
        mi.market_item_description AS local_name,
        sh.shop_serial_no, sh.shop_name,
        s.shop_selection_status::text AS shop_selection_status,
        s.item_availability_code::text AS item_availability_code,
        mi.unit_of_sale, mi.product_specification,
        COALESCE(prev_pd.current_period_price, pd.previous_period_price) AS previous_period_price,
        pd.current_period_price,
        pd.is_na,
        pd.is_not_applicable,
        pd.price_recording_date,
        pd.remark AS price_remark,
        s.remark AS ds_remark,
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
                * 100.0 / COALESCE(prev_pd.current_period_price, pd.previous_period_price) >= %(alert_pct)s
            ELSE FALSE
        END AS price_alert
    FROM cpi_tripura_item_price_collection_shop_setup s
    JOIN cpi_tripura_item i ON i.item_id = s.item_id
    JOIN cpi_tripura_market_shop sh ON sh.shop_id = s.shop_id
    JOIN cpi_tripura_market m ON m.market_id = sh.market_id
    JOIN cpi_tripura_district d ON d.district_id = m.district_id
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
    WHERE s.round_id = %(round_id)s
        AND (%(district_id)s::int IS NULL OR m.district_id = %(district_id)s)
        AND (%(market_id)s::int IS NULL OR m.market_id = %(market_id)s)
    )
    SELECT DISTINCT ON (market_id, item_id) *
    FROM shop_slots
    ORDER BY market_id, item_id, has_real_price DESC, has_price DESC, selection_rank
"""

# Row narrowings the report's checkbox filters map to, OR-combined. A remark
# cleared through PUT /setups/{id}/remark is stored as an empty string, so a
# blank one must not count as "has a remark".
_ROW_FILTERS = {
    "only_alerts": "t.price_alert",
    "only_ds_remarks": "NULLIF(TRIM(t.ds_remark), '') IS NOT NULL",
    "only_pc_remarks": "NULLIF(TRIM(t.price_remark), '') IS NOT NULL",
}


async def price_report_rows(
    conn: AsyncConnection,
    round_id: int,
    district_id: int | None,
    market_id: int | None,
    only_alerts: bool = False,
    only_ds_remarks: bool = False,
    only_pc_remarks: bool = False,
):
    flags = {
        "only_alerts": only_alerts,
        "only_ds_remarks": only_ds_remarks,
        "only_pc_remarks": only_pc_remarks,
    }
    clauses = [sql for name, sql in _ROW_FILTERS.items() if flags[name]]
    # Always wrapped: the superset carries the DISTINCT ON's own ORDER BY, so
    # the display ordering has to live in an outer query.
    where = f" WHERE ({' OR '.join(clauses)})" if clauses else ""
    query = (
        f"SELECT * FROM ({_PRICE_SUPERSET_SQL}) t{where}"
        " ORDER BY t.district_name, t.market_code, t.item_code"
    )
    cur = await conn.execute(
        query,
        {
            "round_id": round_id,
            "district_id": district_id,
            "market_id": market_id,
            "alert_pct": settings.price_alert_threshold_pct,
        },
    )
    return await cur.fetchall()


async def market_summary_rows(
    conn: AsyncConnection, round_id: int, district_id: int | None
):
    # Per-market completion/approval rollup; counting logic mirrors
    # app/survey/queries.py:list_markets_by_round, plus surveyor and
    # submission details.
    cur = await conn.execute(
        """
        WITH prev_round AS (
            SELECT round_id FROM cpi_tripura_survey_round
            WHERE round_number < (
                SELECT round_number FROM cpi_tripura_survey_round WHERE round_id = %(round_id)s
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
            WHERE mi.round_id = %(round_id)s
                AND pd.current_period_price IS NOT NULL
                AND COALESCE(prev_pd.current_period_price, pd.previous_period_price) IS NOT NULL
                AND COALESCE(prev_pd.current_period_price, pd.previous_period_price) != 0
                AND ABS(pd.current_period_price - COALESCE(prev_pd.current_period_price, pd.previous_period_price))
                    * 100.0 / COALESCE(prev_pd.current_period_price, pd.previous_period_price) >= %(alert_pct)s
            GROUP BY sh.market_id
        )
        SELECT m.market_code,
               m.selected_market AS market_name,
               m.domain,
               d.name AS district_name,
               sd.name AS subdivision,
               COALESCE(st.status::text, 'IN_PROGRESS') AS status,
               COUNT(*) FILTER (WHERE s.shop_selection_status = 'ORIGINALLY SELECTED') AS total_items,
               COUNT(*) FILTER (WHERE s.shop_selection_status = 'ORIGINALLY SELECTED'
                   AND (ppd.current_period_price IS NOT NULL OR ppd.is_na OR ppd.is_not_applicable)
               ) AS collected_items,
               COUNT(*) FILTER (WHERE s.shop_selection_status = 'ORIGINALLY SELECTED')
                   - COUNT(*) FILTER (WHERE s.shop_selection_status = 'ORIGINALLY SELECTED'
                       AND (ppd.current_period_price IS NOT NULL OR ppd.is_na OR ppd.is_not_applicable)
                   ) AS pending_items,
               COALESCE(a.alert_count, 0) AS alert_count,
               su.full_name AS surveyor_name,
               su.phone AS surveyor_phone,
               st.submitted_at,
               sub.full_name AS submitted_by_name
        FROM cpi_tripura_item_price_collection_shop_setup s
        JOIN cpi_tripura_market_shop sh ON sh.shop_id = s.shop_id
        JOIN cpi_tripura_market m ON m.market_id = sh.market_id
        JOIN cpi_tripura_district d ON d.district_id = m.district_id
        LEFT JOIN cpi_tripura_subdivision sd ON sd.subdivision_id = m.subdivision_id
        LEFT JOIN cpi_tripura_market_survey_status st
            ON st.round_id = s.round_id AND st.market_id = m.market_id
        LEFT JOIN cpi_tripura_user sub ON sub.user_id = st.submitted_by
        LEFT JOIN cpi_tripura_surveyor_assignment sa
            ON sa.round_id = s.round_id AND sa.market_id = m.market_id
        LEFT JOIN cpi_tripura_user su ON su.user_id = sa.surveyor_id
        LEFT JOIN cpi_tripura_market_item pmi
            ON pmi.item_id = s.item_id AND pmi.shop_id = s.shop_id AND pmi.round_id = s.round_id
        LEFT JOIN cpi_tripura_price_data ppd ON ppd.market_item_id = pmi.market_item_id
        LEFT JOIN alerts a ON a.market_id = m.market_id
        WHERE s.round_id = %(round_id)s
            AND (%(district_id)s::int IS NULL OR m.district_id = %(district_id)s)
        GROUP BY m.market_code, m.selected_market, m.domain, d.name, sd.name,
                 st.status, st.submitted_at, sub.full_name, a.alert_count,
                 su.full_name, su.phone
        ORDER BY d.name, m.market_code
        """,
        {
            "round_id": round_id,
            "district_id": district_id,
            "alert_pct": settings.price_alert_threshold_pct,
        },
    )
    return await cur.fetchall()


# ── Multi-round price movement ──────────────────────────────────────
#
# The window is the inclusive range of rounds between two round_ids,
# resolved by round_number *within the to-round's cycle* (round_id order
# is not round order — see app/survey/queries.py:get_previous_round).
# `slot` is the 1-based position of a round in the window, oldest first;
# it is what the report's fixed round_N_* column keys bind to.
_ROUND_WINDOW_CTE = """
    WITH window_rounds AS (
        SELECT round_id, round_number, round_name, round_start_date, round_end_date,
               ROW_NUMBER() OVER (ORDER BY round_number) AS slot
        FROM cpi_tripura_survey_round
        WHERE cycle = (
                SELECT cycle FROM cpi_tripura_survey_round WHERE round_id = %(to_round_id)s
            )
            AND round_number BETWEEN
                (SELECT round_number FROM cpi_tripura_survey_round WHERE round_id = %(from_round_id)s)
                AND (SELECT round_number FROM cpi_tripura_survey_round WHERE round_id = %(to_round_id)s)
    )
"""


async def round_window(conn: AsyncConnection, from_round_id: int, to_round_id: int):
    """The rounds in the window, oldest first, with their slot number —
    used to label the report's round columns with real round names."""
    cur = await conn.execute(
        _ROUND_WINDOW_CTE
        + """
        SELECT slot, round_id, round_number, round_name FROM window_rounds
        ORDER BY slot
        """,
        {"from_round_id": from_round_id, "to_round_id": to_round_id},
    )
    return await cur.fetchall()


async def price_movement_rows(
    conn: AsyncConnection,
    from_round_id: int,
    to_round_id: int,
    district_id: int | None,
    market_id: int | None,
):
    """Long format: one row per (series, round slot), where a series is
    market x item x unit_of_sale x product_specification and the price is
    averaged over the market's shops. The wide pivot and every derived
    measure happen in app/reports/movement.py — folding 12 slots x 4
    measures into SQL would be unreadable, and the payload interface
    explicitly allows assembling in Python (see base.py).

    Shops marked NOT SELECTED are excluded; substitutes are kept, because
    dropping them would punch holes in a series whenever the originally
    selected shop was closed. shop_count exposes how thin an average is.
    """
    cur = await conn.execute(
        _ROUND_WINDOW_CTE
        + """,
        priced AS (
            SELECT d.name AS district_name,
                   sd.name AS subdivision,
                   m.market_id, m.market_code, m.selected_market AS market_name, m.domain,
                   i.item_id, i.item_code, i.item_name,
                   mi.unit_of_sale, mi.product_specification, mi.market_item_description,
                   wr.slot, wr.round_number,
                   pd.current_period_price AS price
            FROM window_rounds wr
            JOIN cpi_tripura_market_item mi ON mi.round_id = wr.round_id
            JOIN cpi_tripura_price_data pd ON pd.market_item_id = mi.market_item_id
            JOIN cpi_tripura_item i ON i.item_id = mi.item_id
            JOIN cpi_tripura_market_shop sh ON sh.shop_id = mi.shop_id
            JOIN cpi_tripura_market m ON m.market_id = sh.market_id
            JOIN cpi_tripura_district d ON d.district_id = m.district_id
            LEFT JOIN cpi_tripura_subdivision sd ON sd.subdivision_id = m.subdivision_id
            LEFT JOIN cpi_tripura_item_price_collection_shop_setup s
                ON s.item_id = mi.item_id AND s.shop_id = mi.shop_id AND s.round_id = mi.round_id
            WHERE pd.current_period_price IS NOT NULL
                AND NOT pd.is_na
                AND NOT pd.is_not_applicable
                AND COALESCE(s.shop_selection_status::text, '') <> 'NOT SELECTED'
                AND (%(district_id)s::int IS NULL OR m.district_id = %(district_id)s)
                AND (%(market_id)s::int IS NULL OR m.market_id = %(market_id)s)
        )
        SELECT district_name, subdivision, market_id, market_code, market_name, domain,
               item_id, item_code, item_name, unit_of_sale, product_specification,
               slot,
               ROUND(AVG(price), 2) AS avg_price,
               COUNT(*) AS shop_count,
               (array_agg(market_item_description ORDER BY round_number DESC)
                   FILTER (WHERE market_item_description IS NOT NULL))[1] AS local_name
        FROM priced
        GROUP BY district_name, subdivision, market_id, market_code, market_name, domain,
                 item_id, item_code, item_name, unit_of_sale, product_specification, slot
        ORDER BY district_name, market_code, item_code, unit_of_sale,
                 product_specification, slot
        """,
        {
            "from_round_id": from_round_id,
            "to_round_id": to_round_id,
            "district_id": district_id,
            "market_id": market_id,
        },
    )
    return await cur.fetchall()


# ── Referential lookups (service-level validation + meta block) ─────


async def get_round(conn: AsyncConnection, round_id: int):
    cur = await conn.execute(
        "SELECT * FROM cpi_tripura_survey_round WHERE round_id = %s", [round_id]
    )
    return await cur.fetchone()


async def get_district(conn: AsyncConnection, district_id: int):
    cur = await conn.execute(
        "SELECT district_id, name FROM cpi_tripura_district WHERE district_id = %s",
        [district_id],
    )
    return await cur.fetchone()


async def get_market(conn: AsyncConnection, market_id: int):
    cur = await conn.execute(
        """
        SELECT m.market_id, m.market_code, m.selected_market, m.district_id
        FROM cpi_tripura_market m
        WHERE m.market_id = %s
        """,
        [market_id],
    )
    return await cur.fetchone()


# ── Generated report history ────────────────────────────────────────


async def insert_generated_report(conn: AsyncConnection, data: dict):
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))
    values = [Jsonb(v) if isinstance(v, dict | list) else v for v in data.values()]
    cur = await conn.execute(
        f"INSERT INTO cpi_tripura_generated_report ({cols}) VALUES ({placeholders}) RETURNING *",
        values,
    )
    return await cur.fetchone()


async def list_generated_reports(
    conn: AsyncConnection,
    district_id: int | None = None,
    offset: int = 0,
    limit: int = 100,
):
    query = "SELECT * FROM cpi_tripura_generated_report"
    params: list = []
    if district_id is not None:
        query += " WHERE district_id = %s"
        params.append(district_id)
    query += " ORDER BY generated_report_id DESC OFFSET %s LIMIT %s"
    params += [offset, limit]
    cur = await conn.execute(query, params)
    return await cur.fetchall()


async def get_generated_report(conn: AsyncConnection, generated_report_id: int):
    cur = await conn.execute(
        "SELECT * FROM cpi_tripura_generated_report WHERE generated_report_id = %s",
        [generated_report_id],
    )
    return await cur.fetchone()


async def update_generated_report(
    conn: AsyncConnection, generated_report_id: int, data: dict
):
    if not data:
        return await get_generated_report(conn, generated_report_id)
    cols = ", ".join(f"{k} = %s" for k in data)
    cur = await conn.execute(
        f"UPDATE cpi_tripura_generated_report SET {cols} "
        "WHERE generated_report_id = %s RETURNING *",
        [*data.values(), generated_report_id],
    )
    return await cur.fetchone()


async def delete_generated_report(conn: AsyncConnection, generated_report_id: int):
    cur = await conn.execute(
        "DELETE FROM cpi_tripura_generated_report WHERE generated_report_id = %s RETURNING generated_report_id",
        [generated_report_id],
    )
    return await cur.fetchone()


# ── Background job state ─────────────────────────────────────────────


async def update_report_progress(
    conn: AsyncConnection, generated_report_id: int, progress: int
):
    await conn.execute(
        "UPDATE cpi_tripura_generated_report SET progress = %s WHERE generated_report_id = %s AND status = 'PENDING'",
        [progress, generated_report_id],
    )


async def finish_report(
    conn: AsyncConnection,
    generated_report_id: int,
    status: str,
    error: str | None = None,
    file_path: str | None = None,
):
    """Mark a PENDING job READY/FAILED, optionally swapping in the file it just
    wrote. `completed_at IS NULL` fences the write: a claim nulls it, so exactly
    one job can finish a given claim and a superseded job loses instead of
    clobbering a fresher render with older content. Passing file_path=None keeps
    the row on the file it already has — the failure path, which leaves the
    previous report intact.

    Returns None if the row was deleted while the job ran, or if the job lost
    the race (caller then removes the file it wrote)."""
    cur = await conn.execute(
        """
        UPDATE cpi_tripura_generated_report
        SET status = %s,
            error = %s,
            progress = CASE WHEN %s = 'READY' THEN 100 ELSE progress END,
            file_path = COALESCE(%s, file_path),
            completed_at = CURRENT_TIMESTAMP
        WHERE generated_report_id = %s
            AND completed_at IS NULL
        RETURNING *
        """,
        [status, error, status, file_path, generated_report_id],
    )
    return await cur.fetchone()


async def claim_report_for_regeneration(
    conn: AsyncConnection,
    generated_report_id: int,
    user_id: int,
    username: str | None,
):
    """Take exclusive ownership of a report's job slot: back to PENDING with a
    clean slate, but only if no job is already running. Returns None when
    another regeneration won the race (caller answers 409).

    file_path is deliberately untouched — the row keeps pointing at the file it
    has until the new render succeeds, so a failed regeneration leaves the old
    file both downloadable-after-retry and cleanable by DELETE /reports/{id}.
    generated_by_* is overwritten because the rendered document's "Generated By"
    line carries the regenerating user."""
    cur = await conn.execute(
        """
        UPDATE cpi_tripura_generated_report
        SET status = 'PENDING',
            progress = 0,
            error = NULL,
            started_at = CURRENT_TIMESTAMP,
            completed_at = NULL,
            generated_by_user_id = %s,
            generated_by_username = %s
        WHERE generated_report_id = %s
            AND status <> 'PENDING'
        RETURNING *
        """,
        [user_id, username, generated_report_id],
    )
    return await cur.fetchone()


async def sweep_stale_pending(conn: AsyncConnection, max_age_minutes: int = 10):
    """Fail PENDING jobs orphaned by a crash/redeploy. The age guard keeps a
    late-booting uvicorn worker from killing a sibling's live job — it reads
    started_at, not created_at, because a regenerated row keeps its original
    creation time and would otherwise always look stale."""
    cur = await conn.execute(
        """
        UPDATE cpi_tripura_generated_report
        SET status = 'FAILED', error = 'Interrupted by restart — regenerate',
            completed_at = CURRENT_TIMESTAMP
        WHERE status = 'PENDING'
            AND started_at < CURRENT_TIMESTAMP - make_interval(mins => %s)
        RETURNING generated_report_id
        """,
        [max_age_minutes],
    )
    return await cur.fetchall()
