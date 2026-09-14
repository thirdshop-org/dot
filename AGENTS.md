# VaultDrop

## Project Status

`backend/` (Go) et `mobile-kotlin/` (Kotlin/Android) ont du scaffolding en place. Le client mobile est **local-first** : il reflète le SAF dans une base Room (v7, migrations, DAO) et pousse les **métadonnées** de ses mutations locales via un **outbox transactionnel** (`pending_operations` + worker WorkManager → `POST /sync/ops`). Pas d'upload physique, pas d'OCR ni de recherche serveur côté client en V1.

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

# Frontend tests (JVM, Robolectric + Room in-memory)
cd mobile-kotlin && ./gradlew :app:testDebugUnitTest

# PostgreSQL (via docker-compose)
docker compose up postgres -d
```

Tests mobiles : JVM unit tests dans `app/src/test` (JUnit + Robolectric + Room in-memory), lancés via `:app:testDebugUnitTest`. Pas de tests instrumentés (`androidTest`).

## Backend Structure

- Entry point: `backend/cmd/server/main.go` (wiring gin + config + routes)
- `config/` — env (`godotenv`, optionnel) + defaults: `PORT`, `DATABASE_URL`, `UPLOAD_DIR`, `MAX_FILE_SIZE_MB`, `OCR_LANG`, `AUTH_SECRET` (secret des tokens paseto), `ADMIN_USERNAME`/`ADMIN_PASSWORD` (bootstrap du premier admin)
- `models/` — domain entities (users, devices, documents/resources, clients)
- `service/` — business logic (permissions, upload, create folder, move, **sync outbox + snapshot**, bootstrap admin)
- `handlers/` — HTTP handlers (health, devices register, **auth/login**, **users resolve + change password**, files CRUD/upload/search, folders, **sync/ops + sync/permissions, ocr/jobs** — réels) ; middleware `RequireAuth`
- `repository/` — Postgres persistence (`repository.Resources` : insert/list/get/soft-delete scoping `owner_id`, search, move, rename, root-name unique index, `ListOwned` pour le snapshot ; `repository.Devices` : Upsert, Exists, MarkUser ; `repository.Operations` : trace outbox idempotente `(device_id, operation_id)` ; `repository.OcrJobs` : jobs queued→processing→done/failed ; `repository.Users` : GetByUsernameNormalized, ResolveExact, UpdatePassword) ; IDs sont TEXT 32-hex, `NewID()` = `crypto/rand` 16 octets hex (jamais UUID conversion, cf. `docs/api-v1.md`)
- `db/` — package migrations (`golang-migrate/v4`, embarquées via `embed` dans `db/migrations/*.sql`, 000001→000008) : `db.MigrateDatabase(url)` au boot du serveur ; test harness `db/migrations_test.go` (up → assertions schéma → down, `TEST_DATABASE_URL`, skip si PG indisponible) ; `dbtest/` — helper cross-package pour les tests repo/handlers (crée la DB test si absente, reset schema, migrate ; skip si PG down)
- `ocr/` — OCR engine behind an interface (Tesseract system call, `OCR_LANG` défaut `fra+eng`)
- `pkg/api/` — response helpers (`response.go`) ; `pkg/auth/` — tokens **paseto v4-local** (subject = `user_id`, claim = `device_id`, TTL 7j, voir `docs/api-v1.md`) ; `pkg/passwd/` — hashing/vérification bcrypt (timing-equal)
- File uploads stored in `backend/uploads/`
- Standard JSON response envelope: `{ "data": ..., "meta": { "page": ..., "total": ... } }`
- Error format: `{ "error": { "code": "...", "message": "..." } }`
- Route list is a tracked contract (`cmd/server/router_test.go` mirrors the mobile client)

## Frontend Structure (mobile-kotlin)

- Entry point: `app/src/main/java/com/vaultdrop/mobile/VaultDropApplication.kt` (Hilt + `HiltWorkerFactory`) + `MainActivity.kt` (Hilt) ; navigation Compose dans `ui/navigation/` (`NavGraph.kt`, `VaultDropApp.kt`)
- Data layer — `data/`:
  - `data/local/` — Room SQLite (DB `dot.db`, **version 7**, `Migrations.kt` : tables `folders`, `files`, `user_preferences`, `pending_operations`) : entités Folder/File/UserPreference/PendingOperation, DAO, tri (`FileOrdering`) ; flag `processed` sur `files` (mode review « traiter », local au device, **gate de sync** : un fichier pas encore traité n'est jamais poussé) ; outbox transactionnel `pending_operations` (v7)
  - `data/remote/` — Retrofit/Moshi : `ApiService.kt` + `dto/Dtos.kt` = **contrat HTTP** (`{ data, meta }`, erreurs `{ error: { code, message } }`) ; `ApiClient.kt` normalise les réponses ; interceptors OkHttp (`AuthInterceptor`, `ServerUrlInterceptor`)
  - `data/repository/` — `FolderRepository`, `FileRepository`, `AuthRepository`, `OutboxRepository` (enqueue `create_resource`/`move_resource`/`delete_resource`, écrivains dans la même transaction Room que la mutation parente ; pour un fichier SAF, la mutation parente du `create_resource` est le **garder** de la review (`markProcessed`), et `hasCreateOperation` en garde l'unicité)
- `features/` — logique descendue côté client :
  - `sync/DeviceSync.kt` + `SafScanner.kt` — sync device↔SAF : **two-pass walk** (listing hors transaction puis upserts Room dans une seule transaction), réconciliation `exists = 0` (jamais de suppression), single-flight via `Mutex` ; les nouveaux **dossiers** sont journalisés dans l'outbox à la découverte, les **fichiers** uniquement au « garder » de la review (gate `processed`)
  - `saf/` — `SafUris`, `SafFolderCreator`, `FileMover` (relocalisation SAF `DocumentsContract.moveDocument`, repli métadonnée seule ; le déplacement est poussé en `move_resource`), `SafFileDeleter` (suppression SAF + `delete_resource` atomique)
  - `sync/OutboxSyncWorker.kt` — worker WorkManager (`enqueueUniqueWork` KEEP, single-flight, `NetworkType.CONNECTED`, backoff 30s) qui draine `pending_operations` vers `POST /sync/ops` (batch 20, dead-letter immédiat `failed` sur erreur 4xx non-idempotente — `attempts` diagnostic, purge synced > 7 jours) ; **schedulé** au login/restauration de session (`AuthViewModel`) et après chaque `syncAll()` (`SyncViewModel`)
  - `sync/SyncViewModel.kt` — état du sync exposé à l'UI (`SyncStatus` : marche en cours, ops en attente, dernières opérations) via le badge header `ui/components/SyncStatusBadge.kt` + `SyncOperationsDialog.kt` (« liste des sync »)
- `auth/` — session (login user + token paseto) : `SessionManager`, `SecureTokenStore`, `TokenProvider`
- `ui/` — écrans Compose : `folderlist`, `folderdetail`, `document` (contenu PDF/image/texte + placeholder cloud-only), `search` (**recherche locale** via Room, sans endpoint serveur), `settings` (URL serveur + thème), `pdfbuilder` (multi-select → génération PDF), `auth` (login, mode local), `components`, `theme`
- `domain/` — stores de préférences: `DeviceIdentity`, `ActiveUserStore`, `LocalModeStore`, `ServerConfigStore`, `ThemePreferenceStore`, `GenerateId` (identifiants 32-hex)
- `di/` — modules Hilt (`AppModule`, `DatabaseModule`, `NetworkModule`)
- Base URL serveur **configurée à l'exécution** dans les Réglages (`ServerConfigStore`, persistée en `user_preferences`), défaut `http://10.0.2.2:8080/api/v1` (pas de variable d'env)
- Client **local-first** : lecture via `GET /files/folders`, `GET /files` ; mutations locales poussées via l'outbox `POST /sync/ops` (`create_resource`/`move_resource`/`delete_resource`) ; `POST /devices`, `POST /auth/login` ; download/upload physique hors scope

## Data Conventions

- Canonical identity for folders/files is `resource_id`: opaque 32-hex, generated locally (`GenerateId`), never reused. The physical `uri` (SAF) is nullable (NULL = cloud-only) and is the reconciliation key for the SAF walk (unique index, NULLs distincts).
- Similarly, `pending_operations.operation_id` is a client-generated 32-hex (`GenerateId`), the idempotency key of the outbox `UNIQUE(device_id, operation_id)` lettre contre les rejeux du worker.
- `owner_id` is **nullable** in the Room schema; it is set at runtime from `DeviceIdentity.getOrCreate()` during the SAF walk.
- Folder/file `sync_status` is a **placement** state: `local` | `cloud` | `local-cloud`. It is not a push progress marker.
- Client storage: `user_preferences` (clé/valeur) pour l'identité device, le compte actif, l'URL serveur, le thème, le mode local.
- Outbox atomique : `create_resource`/`move_resource`/`delete_resource` sont écrits dans la **même transaction Room** que la mutation parente ; l'écrivain (repository) et le worker partagent ce contrat. En mode local (pas de token), le worker est no-op. **Gate `processed`** : un fichier SAF nouvellement découvert est importé localement mais poussé seulement au « garder » (`markProcessed`, qui enqueue le `create_resource` dans la même transaction, une seule fois via `hasCreateOperation`) — d'où le filtrage des documents par l'utilisateur avant toute synchro. Un `delete_resource` n'est journalisé que si un `create_resource` a existé (jamais pour un fichier non poussé).
- Pas de cache de permissions côté client en V1 : le serveur reste la source de vérité pour l'accès (`GET /sync/permissions` non consommé par le client Kotlin).

## API Contract (V1)

- **Le client mobile est le contrat**: les formes d'endpoints dans `mobile-kotlin/.../data/remote/ApiService.kt` + `dto/Dtos.kt` sont autoritatives et doivent matcher exactement ; le serveur ne renégocie pas. Spec consolidée: `docs/api-v1.md`.
- **Identity (user-first, V1 finale)**: le device s'enregistre (`POST /devices`, `{ "deviceId" }` seul, sans token), puis `POST /auth/login` (`username` + `password` + `device_id`) émet le seul token paseto **v4-local** — subject = `user_id` (autorise, scoping de toutes les ressources), claim `device_id` (porté, non autorisant seul), **TTL 7j sans refresh**. À expiration, le client re-logine.
- **Bootstrap**: au premier démarrage, si `users` est vide, `ADMIN_USERNAME`/`ADMIN_PASSWORD` (env) créent le premier admin ; absents → le serveur refuse de démarrer. L'env n'écrase jamais un compte existant. Usernames résolus sur `username_normalized` (lowercase + trim), `GET /users/resolve` exact uniquement (pas d'énumération).
- **Identifiers**: `resource_id` / `device_user_id` / `user_id` / share-link `token` / `operation_id` sont des **lowercase 32-hex** TEXT (`^[0-9a-f]{32}$`, CHECK-enforced), stockés tels quels côté serveur (pas de conversion UUID). Le mobile génère toujours 32-hex.
- **Outbox idempotence + ordering**: le serveur applique les batchs de `pending_operations` **séquentiellement**, s'arrête à la première erreur non-idempotente et retourne l'index atteint. Consommé par le client Kotlin (`OutboxSyncWorker` → `POST /sync/ops`, batch 20, dead-letter immédiat sur 4xx non-idempotente, purge > 7 jours). `create_resource` porte le `parentResourceId` optionnel (racine si absent) — le walk SAF garantit parent avant enfant dans l'ordre d'`id`.
- **Permissions snapshot**: le serveur pousse des snapshots `resource_permissions` (`effective_access` ranking viewer < commenter < editor < owner, `inherit`, `expires_at`, TTL 24h → read-only downgrade). (Endpoint existant côté serveur ; pas encore consommé par le client Kotlin.)

## Non-Goals (V1)

- Plugin system
- On-device OCR
- Full multi-tenant federation / public discovery
- Multi-writer sync conflicts (single-owner device identity)
- Upload physique client→cloud (métadonnées seules via l'outbox, download, OCR jobs, permissions) côté mobile Kotlin

## References

- `docs/api-v1.md` — **contrat API V1** (autoritatif, consolidé depuis le client `data/remote/`)
- `V2.md` — modèle cible Postgres/ReBAC (identifiants en TEXT 32-hex, cf. `docs/api-v1.md`)