# VaultDrop

## Project Status

`backend/` (Go) et `mobile-kotlin/` (Kotlin/Android) ont du scaffolding en place. Le client mobile est **local-first** : il reflète le SAF dans une base Room (v5, migrations, DAO) et n'utilise le serveur que pour s'enregistrer, se connecter et lister fichiers/dossiers. Pas de poussée cloud (outbox), pas d'upload, pas d'OCR ni de recherche serveur côté client en V1.

## Architecture

- **Backend**: Go, Gin HTTP framework, PostgreSQL, Tesseract OCR (system call)
- **Frontend**: Kotlin/Android — Jetpack Compose, Room (SQLite), Hilt (DI), Retrofit + Moshi + OkHttp, SAF (DocumentsContract)

## Key Commands

```bash
# Backend
mise up_backend                    # docker compose up postgres + go run cmd/server/main.go
cd backend && go run cmd/server/main.go

# Backend tests (tests repo/handlers via dbtest)
cd backend && go test ./...

# Frontend (build + install app Android debug)
mise up_mobile [device|emulator]  # défaut: emulator
cd mobile-kotlin && ./gradlew :app:assembleDebug

# PostgreSQL (via docker-compose)
docker compose up postgres -d
```

Il n'y a **pas** de tests mobiles (pas de dossier `src/test` ni `src/androidTest`).

## Backend Structure

- Entry point: `backend/cmd/server/main.go` (wiring gin + config + routes)
- `config/` — env (`godotenv`, optionnel) + defaults: `PORT`, `DATABASE_URL`, `UPLOAD_DIR`, `MAX_FILE_SIZE_MB`, `OCR_LANG`, `AUTH_SECRET` (secret des tokens paseto), `ADMIN_USERNAME`/`ADMIN_PASSWORD` (bootstrap du premier admin)
- `models/` — domain entities (users, devices, documents/resources, clients)
- `service/` — business logic (permissions, upload, create folder, move, **sync outbox + snapshot**, bootstrap admin)
- `handlers/` — HTTP handlers (health, devices register, **auth/login**, **users resolve + change password**, files CRUD/upload/search, folders, **sync/ops + sync/permissions, ocr/jobs** — réels) ; middleware `RequireAuth`
- `repository/` — Postgres persistence (`repository.Resources` : insert/list/get/soft-delete scoping `owner_id`, search, move, rename, root-name unique index, `ListOwned` pour le snapshot ; `repository.Devices` : Upsert, Exists, MarkUser ; `repository.Operations` : trace outbox idempotente `(device_id, operation_id)` ; `repository.OcrJobs` : jobs queued→processing→done/failed ; `repository.Users` : GetByUsernameNormalized, ResolveExact, UpdatePassword) ; IDs sont TEXT 32-hex, `NewID()` = `crypto/rand` 16 octets hex (jamais UUID conversion, cf. `docs/api-v1.md`)
- `db/` — package migrations (`golang-migrate/v4`, embarquées via `embed` dans `db/migrations/*.sql`, 000001→000007) : `db.MigrateDatabase(url)` au boot du serveur ; test harness `db/migrations_test.go` (up → assertions schéma → down, `TEST_DATABASE_URL`, skip si PG indisponible) ; `dbtest/` — helper cross-package pour les tests repo/handlers (crée la DB test si absente, reset schema, migrate ; skip si PG down)
- `ocr/` — OCR engine behind an interface (Tesseract system call, `OCR_LANG` défaut `fra+eng`)
- `pkg/api/` — response helpers (`response.go`) ; `pkg/auth/` — tokens **paseto v4-local** (subject = `user_id`, claim = `device_id`, TTL 7j, voir `docs/api-v1.md`) ; `pkg/passwd/` — hashing/vérification bcrypt (timing-equal)
- File uploads stored in `backend/uploads/`
- Standard JSON response envelope: `{ "data": ..., "meta": { "page": ..., "total": ... } }`
- Error format: `{ "error": { "code": "...", "message": "..." } }`
- Route list is a tracked contract (`cmd/server/router_test.go` mirrors the mobile client)

## Frontend Structure (mobile-kotlin)

- Entry point: `app/src/main/java/com/vaultdrop/mobile/VaultDropApplication.kt` + `MainActivity.kt` (Hilt) ; navigation Compose dans `ui/navigation/` (`NavGraph.kt`, `VaultDropApp.kt`)
- Data layer — `data/`:
  - `data/local/` — Room SQLite (DB `dot.db`, **version 5**, `Migrations.kt` : tables `folders`, `files`, `user_preferences`) : entités Folder/File/UserPreference, DAO, tri (`FileOrdering`)
  - `data/remote/` — Retrofit/Moshi : `ApiService.kt` + `dto/Dtos.kt` = **contrat HTTP** (`{ data, meta }`, erreurs `{ error: { code, message } }`) ; `ApiClient.kt` normalise les réponses ; interceptors OkHttp (`AuthInterceptor`, `ServerUrlInterceptor`)
  - `data/repository/` — `FolderRepository`, `FileRepository`, `AuthRepository`
- `features/` — logique descendue côté client :
  - `sync/DeviceSync.kt` + `SafScanner.kt` — sync device↔SAF : **two-pass walk** (listing hors transaction puis upserts Room dans une seule transaction), réconciliation `exists = 0` (jamais de suppression), single-flight via `Mutex`
  - `saf/` — `SafUris`, `SafFolderCreator`, `FileMover` (relocalisation SAF `DocumentsContract.moveDocument`, repli métadonnée seule si échec ; pas de poussée serveur)
  - `sync/SyncViewModel.kt` — état du sync exposé à l'UI
- `auth/` — session (login user + token paseto) : `SessionManager`, `SecureTokenStore`, `TokenProvider`
- `ui/` — écrans Compose : `folderlist`, `folderdetail`, `document` (contenu PDF/image/texte + placeholder cloud-only), `search` (**recherche locale** via Room, sans endpoint serveur), `settings` (URL serveur + thème), `pdfbuilder` (multi-select → génération PDF), `auth` (login, mode local), `components`, `theme`
- `domain/` — stores de préférences: `DeviceIdentity`, `ActiveUserStore`, `LocalModeStore`, `ServerConfigStore`, `ThemePreferenceStore`, `GenerateId` (identifiants 32-hex)
- `di/` — modules Hilt (`AppModule`, `DatabaseModule`, `NetworkModule`)
- Base URL serveur **configurée à l'exécution** dans les Réglages (`ServerConfigStore`, persistée en `user_preferences`), défaut `http://10.0.2.2:8080/api/v1` (pas de variable d'env)
- Client **local-first** : aucune poussée cloud (pas d'outbox, pas de `sync/ops`), juste `GET /files/folders`, `GET /files`, `POST /devices`, `POST /auth/login` ; téléchargement/upload hors scope

## Data Conventions

- Canonical identity for folders/files is `resource_id`: opaque 32-hex, generated locally (`GenerateId`), never reused. The physical `uri` (SAF) is nullable (NULL = cloud-only) and is the reconciliation key for the SAF walk (unique index, NULLs distincts).
- `owner_id` is **nullable** in the Room schema; it is set at runtime from `DeviceIdentity.getOrCreate()` during the SAF walk.
- Folder/file `sync_status` is a **placement** state: `local` | `cloud` | `local-cloud`. It is not a push progress marker.
- Client storage: `user_preferences` (clé/valeur) pour l'identité device, le compte actif, l'URL serveur, le thème, le mode local.
- Pas d'outbox ni de cache de permissions côté client en V1 : le serveur reste la source de vérité, le client ne pousse rien (hors scope).

## API Contract (V1)

- **Le client mobile est le contrat**: les formes d'endpoints dans `mobile-kotlin/.../data/remote/ApiService.kt` + `dto/Dtos.kt` sont autoritatives et doivent matcher exactement ; le serveur ne renégocie pas. Spec consolidée: `docs/api-v1.md`.
- **Identity (user-first, V1 finale)**: le device s'enregistre (`POST /devices`, `{ "deviceId" }` seul, sans token), puis `POST /auth/login` (`username` + `password` + `device_id`) émet le seul token paseto **v4-local** — subject = `user_id` (autorise, scoping de toutes les ressources), claim `device_id` (porté, non autorisant seul), **TTL 7j sans refresh**. À expiration, le client re-logine.
- **Bootstrap**: au premier démarrage, si `users` est vide, `ADMIN_USERNAME`/`ADMIN_PASSWORD` (env) créent le premier admin ; absents → le serveur refuse de démarrer. L'env n'écrase jamais un compte existant. Usernames résolus sur `username_normalized` (lowercase + trim), `GET /users/resolve` exact uniquement (pas d'énumération).
- **Identifiers**: `resource_id` / `device_user_id` / `user_id` / share-link `token` sont des **lowercase 32-hex** TEXT (`^[0-9a-f]{32}$`, CHECK-enforced), stockés tels quels côté serveur (pas de conversion UUID). Le mobile génère toujours 32-hex.
- **Outbox idempotence + ordering**: le serveur applique les batchs de `pending_operations` **séquentiellement**, s'arrête à la première erreur non-idempotente et retourne l'index atteint. (Endpoint `POST /sync/ops` existant côté serveur ; pas encore consommé par le client Kotlin.)
- **Permissions snapshot**: le serveur pousse des snapshots `resource_permissions` (`effective_access` ranking viewer < commenter < editor < owner, `inherit`, `expires_at`, TTL 24h → read-only downgrade). (Endpoint existant côté serveur ; pas encore consommé par le client Kotlin.)

## Non-Goals (V1)

- Plugin system
- On-device OCR
- Full multi-tenant federation / public discovery
- Multi-writer sync conflicts (single-owner device identity)
- Client→cloud push (outbox, permissions, OCR jobs, upload) côté mobile Kotlin

## References

- `docs/api-v1.md` — **contrat API V1** (autoritatif, consolidé depuis le client `data/remote/`)
- `V2.md` — modèle cible Postgres/ReBAC (identifiants en TEXT 32-hex, cf. `docs/api-v1.md`)