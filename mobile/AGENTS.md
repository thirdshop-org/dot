# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Local storage

Persistence is SQLite-backed via `services/sqliteStorage.ts` (`expo-sqlite`, database `dot.db`).

- Tables: `folders`, `files`, `user_preferences` (schema migrated via `PRAGMA user_version`).
- Folder and file per-row sync status: `local` | `cloud` | `local-cloud`.
- `services/localStorage.ts` is a thin re-export of `sqliteStorage` for legacy imports.
- Query usage: `getFiles(folderUri?)`, `getFolders()`, `getFolderFolders(parentUri)`, `saveFolder`, `saveFile`, `saveUserPreferences`, `getUserPreferences`, `removeFolder`, `removeFile`.
- Heavy processing stays server-side; SQLite only persists local metadata/state.
