# PRIST — Tripura CPI Survey System

PRIST is a Consumer Price Index (CPI) survey platform for collecting and managing market prices in Tripura. It combines an Android field app for surveyors, a web console for administration and reporting, and a FastAPI service backed by PostgreSQL.

## Repository layout

```text
tripura-cpi-app/       Flutter surveyor app (Android, iOS, web targets)
tripura-cpi-backend/   FastAPI API, PostgreSQL schema, migrations and reports
tripura-cpi-frontend/  React + TypeScript administration web app
```

## Features

- Surveyor authentication and assigned market price collection, including offline submission and synchronization.
- Administrative management of users, districts, subdivisions, markets, shops, items, survey rounds and assignments.
- Spreadsheet-based setup and data ingestion with validation and review workflows.
- CPI survey dashboards, audit trails, exports and generated reports.
- PostgreSQL schema management and containerized backend development.

## Requirements

- Docker and Docker Compose for the backend and local PostgreSQL.
- Python 3.11 or newer for local backend development.
- Node.js and npm for the web frontend.
- Flutter SDK and Android tooling for the surveyor app.

## Quick start

### 1. Backend and database

```bash
cd tripura-cpi-backend
cp .env.example .env
make up-all
```

The API is served at <http://localhost:8000>; interactive API documentation is at <http://localhost:8000/docs>. See [backend installation notes](tripura-cpi-backend/INSTALLATION.md) for local Python setup, database configuration, and migration commands.

### 2. Web frontend

In a separate terminal:

```bash
cd tripura-cpi-frontend
npm ci
```

Set `VITE_API_BASE_URL` in a local `.env` file to the backend API URL (for example, `http://localhost:8000`), then run:

```bash
npm run dev
```

Use `npm run build` to create a production build and `npm run lint` to run ESLint.

### 3. Surveyor app

In another terminal:

```bash
cd tripura-cpi-app
cp .env.example .env
flutter pub get
flutter run
```

Configure `API_BASE_URL` in `.env` for the environment you are using. For an Android emulator, `localhost` usually refers to the emulator itself; use the appropriate host address or device port forwarding for your setup. The app README documents APK builds and the release workflow.

## Development notes

- Keep secrets and local configuration in ignored `.env` files. Never commit production credentials, signing keys, or database backups.
- The backend owns the PostgreSQL schema under `tripura-cpi-backend/migrations/`; review its migration guidance before changing database structure.
- Component-specific setup and commands are documented in each project directory's README or installation guide.

## Tests and checks

Run component checks from the relevant directory:

```bash
# Backend
cd tripura-cpi-backend && pytest

# Frontend
cd tripura-cpi-frontend && npm run lint && npm run build

# Flutter app
cd tripura-cpi-app && flutter test && flutter analyze
```

## License and ownership

This repository contains software developed for the Department of Statistics & Economics, Government of Tripura. No license terms are specified here; confirm the intended distribution terms with the project owner before reuse or redistribution.
