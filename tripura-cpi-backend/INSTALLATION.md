# Installation

## Prerequisites

- **Docker** and **Docker Compose** (recommended)
- **Python 3.12+** (for local development without Docker)
- **PostgreSQL 16+** (if running locally without Docker)
- **make** (for Makefile commands)

## Quick Start (Docker)

This is the fastest way to get running. Docker handles everything — app, database, and seed data.

```bash
# 1. Clone the repo
git clone <repo-url>
cd tripura-cpi-backend

# 2. Create your .env file
cp .env.example .env

# 3. Start everything (app + Postgres + pgAdmin)
make up-all

# 4. Open in browser
#    API:     http://localhost:8000/docs
#    pgAdmin: http://localhost:5050
```

That's it. The Postgres container automatically runs `migrations/schema.sql` and `migrations/seed.sql` on first start.

### Docker Commands

```bash
make up          # Start app only (bring your own Postgres)
make up-all      # Start app + Postgres + pgAdmin
make down        # Stop all containers
make logs        # Tail app logs
make build       # Rebuild app image
```

### Connecting to Postgres from the App

When both app and Postgres run in Docker (`make up-all`), use:

```
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/tripura_cpi
```

When app runs in Docker but Postgres is on the host, use:

```
DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/tripura_cpi
```

## Local Development (without Docker)

### 1. Python Environment

```bash
python3 -m venv .venv
source .venv/bin/activate
make install
```

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to point to your local Postgres:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tripura_cpi
```

### 3. Database Setup

You need a running PostgreSQL instance. Create the database:

```bash
createdb -U postgres tripura_cpi
```

Then apply the schema and seed data:

```bash
# Option A: Using Atlas (auto-installs on first run)
make db-setup

# Option B: Using psql directly
psql $DATABASE_URL -f migrations/schema.sql
psql $DATABASE_URL -f migrations/seed.sql
```

### 4. Run the Server

```bash
make run
# or
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`. Swagger docs at `http://localhost:8000/docs`.

## Schema Migrations (Atlas)

Atlas is used for declarative schema management. The binary is installed locally to `./bin/atlas` on first use — no system-wide install needed.

### Workflow

1. Edit `migrations/schema.sql` (the source of truth)
2. Preview changes:
   ```bash
   make db-plan
   ```
3. Apply:
   ```bash
   make db-apply
   ```
4. Check for drift:
   ```bash
   make db-status
   ```

Atlas only manages DDL (schema). Seed data (`migrations/seed.sql`) is managed separately via `make db-seed`.

## pgAdmin

When using `make up-all`, pgAdmin is available at `http://localhost:5050`.

To add the local Postgres server in pgAdmin:

- **Host**: `postgres` (the Docker service name)
- **Port**: `5432`
- **Username**: value of `POSTGRES_USER` from `.env` (default: `postgres`)
- **Password**: value of `POSTGRES_PASSWORD` from `.env` (default: `postgres`)
- **Database**: value of `POSTGRES_DB` from `.env` (default: `tripura_cpi`)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `APP_ENV` | Environment (`dev`, `prod`) | `dev` |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated, or `*`) | `*` |
| `POSTGRES_USER` | Docker Postgres user | `postgres` |
| `POSTGRES_PASSWORD` | Docker Postgres password | `postgres` |
| `POSTGRES_DB` | Docker Postgres database name | `tripura_cpi` |
| `POSTGRES_PORT` | Host port for Docker Postgres | `5433` |
| `PGADMIN_EMAIL` | pgAdmin login email | `admin@tripura-cpi.local` |
| `PGADMIN_PASSWORD` | pgAdmin login password | `admin` |
