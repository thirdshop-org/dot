# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Local storage

Persistence is SQLite-backed via `services/db/` (`expo-sqlite`, database `dot.db`).

- `services/db/client.ts` — connection lifecycle: `getDatabase()`, `closeDatabase()`, `withTransaction()`.
- `services/db/migrations.ts` — versioned, chained migrations via `PRAGMA user_version` (list of `{ version, up }`).
- `services/db/schema.ts` — `DATABASE_NAME`, `DATABASE_VERSION`, column-list constants.
- `services/db/repositories/` — one module per table (`folders`, `files`, `user_preferences`).
- `services/localStorage.ts` is a thin re-export (`services/db`) kept for legacy imports.
- Tables: `folders`, `files`, `user_preferences`; `files.folder_uri` has index `idx_files_folder_uri`.
- Folder and file per-row sync status: `local` | `cloud` | `local-cloud`.
- Query usage: `getFiles(folderUri?)`, `getFolders()`, `getFolderFolders(parentUri)`, `saveFolder`, `saveFile`, `saveUserPreferences`, `getUserPreferences`, `removeFolder`, `removeFile`.
- Heavy processing stays server-side; SQLite only persists local metadata/state.
