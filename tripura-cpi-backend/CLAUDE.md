# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Local dev
make install          # pip install -e ".[dev]" in .venv
make run              # uvicorn app.main:app --reload

# Docker
make up               # app container only (bring your own Postgres)
make up-all           # app + Postgres + pgAdmin
make down             # stop all containers
make logs             # tail app logs

# Database (Atlas auto-installs to ./bin/ on first use)
make db-setup         # full init: schema + seed data
make db-apply         # apply schema changes only
make db-seed          # insert seed data only
make db-plan          # dry-run: preview schema changes
make db-diff          # SQL diff between schema file and live DB
```

## Architecture

**No ORM.** Raw SQL with psycopg3 async driver. Every module follows:

```
module/
├── models.py    # Pydantic schemas (Create/Update/Out)
├── queries.py   # Raw SQL functions taking AsyncConnection as first arg
└── router.py    # FastAPI endpoints
```

Three feature modules: `master_data` (CRUD for tehsils/subdivisions/markets/shops/items), `price_collection` (shop-item setup), `sync` (batch price ingestion).

**Request flow:** Router gets pool → opens connection → calls query function → query returns dict (via `dict_row` factory) → router returns Pydantic model.

## DB Layer Conventions

- **Parameterized queries only** — `%s` placeholders (psycopg3 style), never f-string values
- Column names from `dict_row` must match Pydantic field names exactly
- All INSERT/UPDATE use `RETURNING *` to get the row back without a second query
- Dynamic column building for create/update uses `data.keys()` for column names (trusted) and `%s` for values

```python
async def create_market(conn: AsyncConnection, data: dict):
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["%s"] * len(data))
    cur = await conn.execute(
        f"INSERT INTO cpi_tripura_market ({cols}) VALUES ({placeholders}) RETURNING *",
        list(data.values()),
    )
    return await cur.fetchone()
```

## Enum Handling

Enums exist in **both** PostgreSQL and Python and must stay in sync:

- **SQL** (`migrations/schema.sql`): `CREATE TYPE CPI_DOMAIN AS ENUM ('Rural Non Tribal', ...)`
- **Python** (`app/common/models.py`): `class CpiDomain(StrEnum)` with matching values

psycopg3 in text mode handles enum serialization natively — no codec registration needed. When adding a new enum, update both places and run `make db-apply`.

## Error Handling

Global exception handlers in `app/main.py` map psycopg errors to HTTP status codes:
- `UniqueViolation` / `ForeignKeyViolation` → **409**
- `CheckViolation` / `RaiseException` → **422**
- Not-found checks in routers → **404**

The batch sync endpoint (`POST /sync`) is different: it catches errors **per-record** and always returns 200. Check `results[].status` for `"created"`, `"updated"`, or `"error"`.

## Key DB Constraints

- `validate_shop_market_item_match` trigger: shop and market-item must belong to the same market when creating a setup
- `UNIQUE(market_item_id, shop_id, setup_date)` on setup table
- `UNIQUE(item_price_collection_shop_setup_id, current_period)` on price data — the sync endpoint relies on this for duplicate detection
- `UNIQUE(round_id, market_id)` on `CPI_TRIPURA_MARKET_SURVEY_STATUS` — one approval status per market per round
- All FKs use `ON DELETE RESTRICT` (except price_data which cascades from setup)

## Roles & Approval Workflow

Three roles in `CPI_TRIPURA_USER.user_role` (enum `USER_ROLE`): `ADMIN`, `DISTRICT_SUPERVISOR` (DS), `PRICE_COLLECTOR` (PC, called "surveyor" in tables/code). Auth dependencies live in `app/auth/dependencies.py`: `require_admin`, `require_supervisor`, `require_price_collector`, `require_admin_or_supervisor`, plus the district scope guards `assert_market_in_scope` / `assert_pc_in_scope` (no-ops for admins; enforce `district_id` match for a DS).

- **Admins**: global access (create all users + rounds, edit anything, global rollover).
- **District supervisors**: scoped to their own `district_id` — edit their PCs (name/contact/active/password, never username or district), allocate/reassign PCs↔markets, edit setups' product specs, rollover their district, and **approve** collected data.
- **Survey dashboard** (DS/admin only): `GET /survey/rounds/{round}/markets` returns every market in the round with its domain, district, subdivision, progress counters, alert count, assigned surveyor and submission trail — the whole dashboard (round overview → district → market) is derived client-side from this one call. `GET /survey/rounds/{round}/pending-items?district_id=` lists items still awaiting a price, one row per (market, item), using the **same condition as the submission gate** (`sync.queries.get_items_missing_prices`). Both are `require_admin_or_supervisor` and auto-scope a DS to their district; `.../markets/{market}/setups` additionally calls `assert_market_in_scope`.
- **Two progress measures, don't conflate them**: the market counters (`total_count`/`collected_count`) count setup rows joined to `market_item`, and one shop-item slot can carry several `market_item` rows (unique on spec + unit), so `total_count` can exceed the real number of slots. A market left holding a superseded spec therefore reads e.g. 127/128 forever despite being APPROVED. The UI calls this counter-derived gap **"Uncollected"** and reserves **"Pending items"** for the submission-gate list, which is authoritative for "still to collect". `progressBucket()` in the frontend keys "complete" off SUBMITTED/APPROVED for the same reason.
- **Survey rounds & survey state**: a PC pushes prices with `POST /sync`, then submits with `POST /sync/submit`. Submission is **per market**: `{round_id, market_id}` validates completeness for that market only and marks just it `SUBMITTED` in `CPI_TRIPURA_MARKET_SURVEY_STATUS` (status `IN_PROGRESS → SUBMITTED → APPROVED`); 404 if the market isn't assigned to the PC, 409 if it is already submitted. Omitting `market_id` keeps the legacy whole-round behaviour (validate + submit every assigned market at once) for older app builds. A DS/admin then approves (`POST /survey/rounds/{round}/markets/{market}/approve`) or un-submits (`.../unsubmit`, back to `IN_PROGRESS`) per market. `GET /sync` only returns `IN_PROGRESS` markets; price records for `SUBMITTED`/`APPROVED` markets are rejected until un-submitted.

## Schema Migrations

`migrations/schema.sql` is the source of truth. Atlas does **declarative** diffing (not procedural migration files). Edit the SQL file, then `make db-apply`. Atlas only handles DDL — seed data lives separately in `migrations/seed.sql`.

The Docker Postgres container auto-runs both files from `/docker-entrypoint-initdb.d` on first start.
