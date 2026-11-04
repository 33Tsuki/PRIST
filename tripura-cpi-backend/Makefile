ifneq (,$(wildcard /etc/api.env))
  include /etc/api.env
else ifneq (,$(wildcard .env))
  include .env
endif
export

MIGRATION_DATABASE_URL := postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:$(POSTGRES_PORT)/$(POSTGRES_DB)?sslmode=disable
ATLAS := ./bin/atlas

# ── Atlas binary ─────────────────────────────────────────────────────────────

$(ATLAS):
	@mkdir -p bin
	@echo "Installing Atlas CLI into ./bin ..."
	@curl -sSf https://atlasgo.sh | sh -s -- -y --output ./bin/atlas
	@echo "Atlas installed at $(ATLAS)"

# ── Database (Atlas) ─────────────────────────────────────────────────────────

.PHONY: db-apply db-triggers db-sequences db-plan db-seed db-setup db-backup db-migrate db-status db-inspect db-diff

db-apply: $(ATLAS) ## Apply schema to database (Atlas DDL only)
	$(ATLAS) schema apply --env local --auto-approve

db-backup: ## Dump the DB (custom format, restore with pg_restore) before a migration
	@mkdir -p backups
	pg_dump --format=c --large-objects --no-password \
		--file backups/pre-migrate-$(shell date +%Y%m%d-%H%M%S).dump \
		"$(MIGRATION_DATABASE_URL)"
	@echo "Backup written to backups/ (restore: pg_restore -d <url> <file>)"

db-triggers: ## Apply functions and triggers (outside Atlas)
	psql $(MIGRATION_DATABASE_URL) -f migrations/triggers.sql

db-sequences: ## Apply non-Atlas sequences and align their values (idempotent)
	psql $(MIGRATION_DATABASE_URL) -f migrations/sequences.sql

db-seed: ## Insert seed data (tehsils, etc.)
	psql $(MIGRATION_DATABASE_URL) -f migrations/seed.sql

db-setup: db-apply db-sequences db-triggers db-seed ## Full init: schema + sequences + triggers + seed

db-migrate: $(ATLAS) db-backup ## Production: back up, then apply schema + sequences + triggers (no seed)
	$(ATLAS) schema apply --env local --auto-approve
	psql $(MIGRATION_DATABASE_URL) -f migrations/sequences.sql
	psql $(MIGRATION_DATABASE_URL) -f migrations/triggers.sql

db-plan: $(ATLAS) ## Dry-run: show what Atlas would change
	$(ATLAS) schema apply --env local --dry-run

db-status: $(ATLAS) ## Show drift between schema file and live DB
	$(ATLAS) schema diff --from $(MIGRATION_DATABASE_URL) --to file://migrations/schema.sql --dev-url "docker://postgres/16/dev"

db-inspect: $(ATLAS) ## Dump the live DB schema as HCL
	$(ATLAS) schema inspect --url $(MIGRATION_DATABASE_URL)

db-diff: $(ATLAS) ## Show SQL diff between schema file and live DB
	$(ATLAS) schema diff --from $(MIGRATION_DATABASE_URL) --to file://migrations/schema.sql --dev-url "docker://postgres/16/dev" --format '{{ sql . "  " }}'

# ── Docker ───────────────────────────────────────────────────────────────────

.PHONY: up up-all down build build-prod run-prod deploy-prod logs

up: ## Start app container only (dev)
	docker compose up --build -d app

up-all: ## Start app + Postgres + pgAdmin
	docker compose --profile local-db up --build -d

down: ## Stop all containers
	docker compose --profile local-db down

build: ## Rebuild dev image
	docker compose build app

build-prod: ## Build production image
	docker compose -f docker-compose.prod.yml build

run-prod: ## Recreate production container
	docker stop tripura-cpi-backend 2>/dev/null || true
	docker rm tripura-cpi-backend 2>/dev/null || true
	docker compose -f docker-compose.prod.yml up -d --force-recreate

deploy-prod: build-prod db-migrate run-prod ## Full production deploy
	docker image prune -f

logs: ## Tail app logs
	docker compose logs -f app

# ── App (local) ──────────────────────────────────────────────────────────────

.PHONY: run install lint fmt

install: ## Install Python dependencies (local)
	pip install -e ".[dev]"
	pre-commit install

run: ## Start dev server (local)
	uvicorn app.main:app --reload

lint: ## Run ruff linter
	ruff check app

fmt: ## Format code with ruff
	ruff format app
	ruff check --fix app

# ── Help ─────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
