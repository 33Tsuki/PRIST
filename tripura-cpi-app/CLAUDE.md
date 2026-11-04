# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CPI Surveyor App — a Flutter mobile app for government field surveyors collecting Consumer Price Index data across markets in Tripura. Built for the Department of Statistics, Government of Tripura. Offline-first architecture with local SQLite persistence and background sync.

## Common Commands

```bash
# Run on connected device/emulator
flutter run

# Build APK
flutter build apk

# Run tests
flutter test

# Run a single test file
flutter test test/widget_test.dart

# Get dependencies
flutter pub get

# Analyze code
flutter analyze
```

## Environment Setup

Copy `.env.example` to `.env` and set `API_BASE_URL`. Default is `http://10.0.2.2:8000` (Android emulator → host localhost).

## Architecture

### State & Data Flow

No external state management library. State is managed across three tiers:

1. **In-memory (`AppData` singleton)** — `lib/data/app_data.dart`. Static fields (`markets`, `surveyRound`, `surveyor`) hold the working state used by all screens. Populated from API sync responses or cached data.
2. **SQLite (`DatabaseHelper` + `PriceRecordDao`)** — Stores only user-entered price records with `sync_status` (pending/synced/failed). Schema in `database_helper.dart`, queries in `price_record_dao.dart`.
3. **SharedPreferences (`TokenStorage`)** — Auth tokens, user profile, and a full cached copy of the last sync response (JSON string under key `cached_sync_data`).

### Sync Cycle (SyncService)

Manual sync triggered from MarketListScreen:
1. POST pending DB records to `/sync`
2. GET fresh data from `/sync` → update `AppData`
3. Cache clean response to SharedPreferences
4. Rehydrate in-memory items from DB records
5. Reconstruct substitute shops for NA items

### Auth Flow

Phone + OTP via `AuthService` (singleton). Tokens auto-refresh on 401 in `ApiClient._tryRefresh()`. Session check is offline-safe — validates stored tokens without network call.

### Substitute Shop Logic

When an item is marked NA (Not Available), `SubstituteShopService` forwards it to a substitute shop. This creates virtual shops that are reconstructed after each sync via `reconstructSubstituteShops()`.

### Services (all singletons)

| Service | Role |
|---------|------|
| `AuthService` | OTP login, session management, logout cleanup |
| `ApiClient` | HTTP with JWT auth, auto token refresh on 401 |
| `SyncService` | 3-phase sync, caching, rehydration |
| `SubstituteShopService` | NA item forwarding between shops |
| `DatabaseHelper` | SQLite init, schema (`cpi_surveyor.db`) |
| `PriceRecordDao` | CRUD for price_records table |
| `TokenStorage` | SharedPreferences wrapper for tokens/profile |

### Navigation

`HomeScreen` provides bottom tab navigation (Dashboard, Markets, Reports, Profile). All other navigation uses `MaterialPageRoute` push/replace — no named routes.

### Design System

Theme defined in `lib/theme/`. Primary color: `#356AC3`. Font: Inter (via google_fonts). Button styles in `app_button_styles.dart` with named constructors for sync, submit, logout, and soft-danger variants.

## API Endpoints

- `POST /auth/surveyor/request-otp` — Send OTP
- `POST /auth/surveyor/verify-otp` — Verify OTP, returns tokens + profile
- `POST /auth/refresh` — Refresh JWT
- `GET /sync` — Fetch markets/items/round data (only markets still open to the surveyor)
- `POST /sync` — Upload pending price records
- `POST /sync/submit` — Hand collected data to the supervisor. Submission is **per market**: `{round_id, market_id}` submits one market, which then disappears from the next `GET /sync`. Omitting `market_id` submits every assigned market at once (legacy). 422 returns `{detail, missing_items}` when that market is incomplete, 409 when it is already submitted, 404 when it is no longer assigned to the surveyor.
