# Tripura CPI Backend

FastAPI backend for the Consumer Price Index (CPI) survey system for Tripura. Provides master data management, price collection setup, and offline-capable batch sync APIs.

## Tech Stack

- **FastAPI** — async web framework
- **psycopg3** — async PostgreSQL driver (raw SQL, no ORM)
- **PostgreSQL** — with custom ENUMs, triggers, and constraints
- **Atlas** — declarative schema migrations
- **Pydantic v2** — request/response validation
- **Docker** — containerized development

## Project Structure

```
tripura-cpi-backend/
├── app/
│   ├── main.py                     # FastAPI app, lifespan, CORS, error handlers
│   ├── config.py                   # pydantic-settings
│   ├── database.py                 # psycopg3 async connection pool
│   ├── common/
│   │   └── models.py              # Shared ENUMs, pagination, error schemas
│   ├── master_data/
│   │   ├── models.py              # Pydantic schemas
│   │   ├── queries.py             # Raw SQL functions
│   │   └── router.py             # /api/master-data/ endpoints
│   ├── price_collection/
│   │   ├── models.py
│   │   ├── queries.py
│   │   └── router.py             # /api/price-collection/ endpoints
│   └── sync/
│       ├── models.py
│       └── router.py             # POST /api/sync/prices
├── migrations/
│   ├── schema.sql                 # DDL — source of truth for Atlas
│   └── seed.sql                   # Seed data (tehsils, etc.)
├── atlas.hcl                      # Atlas migration config
├── docker-compose.yml
├── Dockerfile.dev
├── Makefile
├── pyproject.toml
└── .env.example
```

## API Endpoints

### Master Data — `/api/master-data`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tehsils` | List tehsils |
| GET | `/tehsils/{id}` | Get tehsil |
| GET | `/markets` | List markets (filter by `domain`, `district`) |
| GET | `/markets/{id}` | Get market |
| POST | `/markets` | Create market |
| PUT | `/markets/{id}` | Update market |
| DELETE | `/markets/{id}` | Delete market |
| GET | `/markets/{id}/shops` | List shops in a market |
| GET | `/shops/{id}` | Get shop |
| POST | `/markets/{id}/shops` | Create shop |
| PUT | `/shops/{id}` | Update shop |
| DELETE | `/shops/{id}` | Delete shop |
| GET | `/items` | List items (search by `search`) |
| GET | `/items/{id}` | Get item |
| POST | `/items` | Create item |
| PUT | `/items/{id}` | Update item |
| DELETE | `/items/{id}` | Delete item |
| GET | `/markets/{id}/items` | List market-items |
| GET | `/market-items/{id}` | Get market-item |
| POST | `/markets/{id}/items` | Create market-item |
| PUT | `/market-items/{id}` | Update market-item |
| DELETE | `/market-items/{id}` | Delete market-item |

### Price Collection — `/api/price-collection`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/markets/{id}/setup` | List shop-item setups for a market (joined detail) |
| POST | `/setup` | Create shop-item setup |
| PUT | `/setup/{id}` | Update setup |
| DELETE | `/setup/{id}` | Delete setup |

### Sync — `/api/sync`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/prices` | Batch submit price records (offline sync) |

The sync endpoint processes each record individually with savepoints — successful records commit even if others fail. Returns per-record status: `created`, `duplicate`, or `error`.

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |

## Makefile Commands

Run `make help` to see all available commands:

```
  db-apply        Apply schema to database
  db-seed         Insert seed data (tehsils, etc.)
  db-setup        Apply schema + seed data (full init)
  db-plan         Dry-run: show what Atlas would change
  db-status       Show drift between schema file and live DB
  db-diff         Show SQL diff between schema file and live DB
  db-inspect      Dump the live DB schema as HCL
  up              Start app container only
  up-all          Start app + Postgres + pgAdmin
  down            Stop all containers
  build           Rebuild app image
  logs            Tail app logs
  install         Install Python dependencies (local)
  run             Start dev server (local)
```
