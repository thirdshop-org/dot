# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Local storage

Persistence is SQLite-backed via `services/db/` (`expo-sqlite`, database `dot.db`, `user_version` = 4).

- `services/db/client.ts` — connection lifecycle: `getDatabase()`, `closeDatabase()`, `withTransaction()`.
- `services/db/migrations.ts` — versioned, chained migrations via `PRAGMA user_version` (list of `{ version, up }`), single-flight `WeakMap` lock, `migrateDatabase(db, targetVersion?)`. v4 is a **transactional rebuild** (folders/files drop `uri` keys, gain `resource_id`). Migration tests: `npm run test:migrations` (better-sqlite3 harness in `tests/migrations.test.ts`, run with `tsx`).
- `services/db/schema.ts` — `DATABASE_NAME`, `DATABASE_VERSION`, column-list constants, `DEVICE_USER_ID_KEY`, `PERMISSION_TTL_MS` (24h offline stale-cache).
- `services/db/id.ts` — `newResourceId()` opaque 32-hex `lower(hex(randomblob(16)))`, generated per row.
- `services/db/transitions.ts` — `transitionSyncStatus(from, event)`: per-row sync status transitions.
- `services/db/repositories/` — one module per table: `folders`, `files`, `user_preferences` (+ `getDeviceUserId`), `resource_permissions` (`permissions.ts` with `canAccess`/`canWrite`/`isOwner`, hierarchical via `WITH RECURSIVE`), `shares`, `share_links`, `recipients`, `pending_operations` (`pendingOps.ts`, outbox).
- `services/localStorage.ts` is a thin re-export (`services/db`) kept for legacy imports.
- Tables: `folders`, `files`, `user_preferences`, `resource_permissions`, `shares`, `share_links`, `recipients`, `pending_operations`.
- Canonical identity: `resource_id` (opaque, unique) on folders/files/shares/share_links; `uri` (physical SAF path) is **nullable**, NULL = cloud-only; `owner_id` NOT NULL seeded from `device_user_id`.
- Folder and file per-row sync status: `local` | `cloud` | `local-cloud` (placement state, transitions via `transitionSyncStatus`).
- `shares`/`share_links` have NO `sync_status`: their `pushStatus` (`pending`/`synced`/`failed`) is **derived** from `pending_operations` (`ref_type` = `share`|`share_link`, `ref_id`).
- Query usage: `getFiles(folderResourceId?)`, `getFolders()`, `getFolderFolders(parentResourceId)`, `getFolder`/`getFile(resourceId)`, `saveFolder`/`saveDirectory`, `saveFile(file, folderResourceId)`, `removeFolder`/`removeFile(resourceId)`, `saveUserPreferences`/`getUserPreferences`/`getDeviceUserId`, `saveResourcePermission`/`getResourcePermission`, `canAccess(resourceId, type, level)`, `saveShare`/`getShares`/`removeShare`, `createShareLink`/`getShareLinks`/`incrementLinkDownloads`/`revokeShareLink`, `saveRecipient`/`getRecipients`, `enqueuePendingOperation`/`getNextQueuedOperation`/`markPendingOperation`.
- Heavy processing stays server-side; SQLite only persists local metadata/state.
