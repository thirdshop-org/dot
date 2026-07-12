# VaultDrop

## Project Status

Project initialized — `webui/` (React Native) and `backend/` (Go) have scaffolding in place.

## Architecture

- **Backend**: Go, Gin HTTP framework, PostgreSQL, Tesseract OCR (system call)
- **Frontend**: React Native (Expo SDK 57), React Navigation, TanStack Query, react-native-image-picker

## Key Commands

```bash
# Backend
cd backend && go run cmd/server/main.go

# PostgreSQL (via docker-compose)
docker compose up postgres -d

# Frontend
cd webui && npx expo start

# Typecheck frontend
cd webui && npx tsc --noEmit
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

- Entry point: `webui/App.tsx` (React Navigation + TanStack Query providers)
- Screens: `app/index.tsx` (home), `app/upload.tsx`, `app/scan.tsx`, `app/search.tsx`
- Components: `components/FileCard.tsx`, `TagChip.tsx`, `UploadProgress.tsx`
- Hooks: `hooks/useFiles.ts`, `hooks/useSearch.ts`, `hooks/useUpload.ts`
- API client: `api/client.ts`, types: `types/index.ts`, constants: `constants/api.ts`
- No business logic on the client — all heavy processing server-side
- API base URL configured via `EXPO_PUBLIC_API_BASE_URL` env var

## Non-Goals (V1)

Collaborative/multi-user, plugin system, complex offline sync, public sharing.

## References

- `README.md` — full spec, API endpoints, data flow, folder structure, iteration roadmap
