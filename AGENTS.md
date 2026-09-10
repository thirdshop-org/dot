# VaultDrop

## Project Status

Project initialized — `mobile/` (React Native / Expo) and `backend/` (Go) have scaffolding in place. The SQLite layer (schema v4, migrations, repositories) is implemented and covered by tests.

## Architecture

- **Backend**: Go, Gin HTTP framework, PostgreSQL, Tesseract OCR (system call)
- **Frontend**: React Native (Expo SDK 57), expo-router, expo-sqlite, expo-file-system (SAF)

## Key Commands

```bash
# Backend
cd backend && go run cmd/server/main.go

# PostgreSQL (via docker-compose)
docker compose up postgres -d

# Frontend
cd mobile && npx expo start

# Typecheck frontend
cd mobile && npx tsc --noEmit

# SQLite layer tests (migrations + repositories)
cd mobile && npm run test:db
```

## Backend Structure

- Entry point: `backend/cmd/server/main.go`
- Internal packages: `handlers/`, `models/`, `repository/`, `service/`, `ocr/`
- Response helpers: `pkg/api/response.go`
- File uploads stored in `backend/uploads/`
- Standard JSON response envelope: `{ "data": ..., "meta": { "page": ..., "total": ... } }`
- Error format: `{ "error": { "code": "...", "message": "..." } }`
- OCR language: `fra+eng`
- Handlers are stub implementations (return not-implemented errors)

## Frontend Structure

- Entry point: `mobile/App.tsx` (expo-router layout + Auth context)
- Data layer — `mobile/services/`:
  - `safDirectory.ts` + `safDirectory.types.ts`: physical access via `expo-file-system` (pick/list/create, Documents/SAF uris)
  - `db/` — SQLite persistence, see `mobile/AGENTS.md` for the full contract (schema, migrations, repositories, tests)
  - `localStorage.ts` — thin re-export of `services/db` (legacy alias)
- `features/syncDevice.ts` — device sync orchestration (two-pass SAF walk, single transaction per root, `exists = 0` reconciliation)
- `context/AuthContext.tsx` — session context: exposes `deviceUserId` (bootstrapped from `getDeviceUserId()`) and starts the background `syncDevice` loop
- `app/` — expo-router screens: `index.tsx` (dossiers racines + ajout SAF), `folder/[id].tsx` (sous-dossiers + fichiers)
- `api/` — REST client (`client.ts` fetch wrapper + `types.ts` = contrat d'API : enveloppe `{ data, meta }`, erreurs `{ error: { code, message } }`)
- `hooks/` — TanStack Query hooks: `useFiles`, `useSearch`, `useUpload` (+ OCR jobs)
- No business logic on the client — heavy processing stays server-side
- API base URL via `EXPO_PUBLIC_API_BASE_URL` (défaut `http://localhost:8080/api/v1`)

## Data Conventions

- Canonical identity for folders/files/shares/share_links is `resource_id`: opaque `lower(hex(randomblob(16)))`, generated locally, never reused. The physical `uri` is nullable (NULL = cloud-only) and is the reconciliation key for the SAF walk.
- `owner_id` is NOT NULL on every folder/file row, seeded from the device's `device_user_id`.
- Folder/file `sync_status` is a **placement** state: `local` | `cloud` | `local-cloud` (transitions via `transitionSyncStatus`). It is not a push progress marker.
- Shares/share_links carry no `sync_status`; their `pushStatus` (pending/synced/failed) is derived from the `pending_operations` outbox.
- Decisions are made **offline** from a cached `resource_permissions` snapshot pushed by the server; the server remains the source of truth. `canAccess` enforces ranking (viewer < commenter < editor < owner), `inherit`, `expires_at`, and a 24h stale-cache read-only downgrade.
- `password_hash` and download counters are **server-side only**; the client only stores the `has_password` boolean and a counter mirror.

## Non-Goals (V1)

- Plugin system
- On-device OCR
- Full multi-tenant federation / public discovery
- Multi-writer sync conflicts (single-owner device identity; device-local `device_user_id`)

## References

- `README.md` — full spec, API endpoints, data flow, folder structure, iteration roadmap