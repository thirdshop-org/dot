import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { FileEntry, Folder } from './safDirectory.types';
import type { UserPreferences,SyncStatus,FolderContext, FolderRow,StoredFile, FileRow } from './sqliteStorage.types';

const DATABASE_NAME = 'dot.db';
const DATABASE_VERSION = 1;

const PREFERENCES_KEY = 'user_preferences';

let database: SQLiteDatabase | null = null;

const DEFAULT_PREFERENCES: UserPreferences = {
  syncMode: 'full',
};

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (database) return database;

  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await migrateIfNeeded(db);
  database = db;
  return db;
}

async function migrateIfNeeded(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  if (currentVersion === 0) {
    await db.execAsync(`
PRAGMA journal_mode = 'wal';
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  uri TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  "exists" INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'local',
  added_at INTEGER NOT NULL,
  parent_uri TEXT
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  uri TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  folder_uri TEXT NOT NULL,
  extension TEXT,
  size INTEGER,
  "type" TEXT,
  "exists" INTEGER,
  last_modified INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'local',
  added_at INTEGER NOT NULL,
  FOREIGN KEY (folder_uri) REFERENCES folders(uri) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_preferences (
  "key" TEXT PRIMARY KEY NOT NULL,
  "value" TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export async function saveFolder(
  folder: Folder,
  options?: { parentUri?: string; syncStatus?: SyncStatus },
): Promise<void> {
  const db = await getDatabase();
  const exists = folder.exists === undefined ? null : folder.exists ? 1 : 0;

  await db.runAsync(
    `INSERT INTO folders (uri, name, "exists", sync_status, added_at, parent_uri)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(uri) DO UPDATE SET
       name = excluded.name, "exists" = excluded."exists", sync_status = excluded.sync_status`,
    folder.uri,
    folder.name,
    exists,
    options?.syncStatus ?? 'local',
    Date.now(),
    options?.parentUri ?? null,
  );
}

export async function saveDirectory(folder: Folder): Promise<boolean> {
  await saveFolder(folder);
  return true;
}

export async function getFolders(): Promise<FolderContext[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FolderRow>(
    'SELECT * FROM folders ORDER BY added_at ASC, name ASC',
  );
  return rows.map(toFolderContext);
}

export async function getFolderFolders(parentUri: string): Promise<FolderContext[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FolderRow>(
    'SELECT * FROM folders WHERE parent_uri = ? ORDER BY name ASC',
    parentUri,
  );
  return rows.map(toFolderContext);
}

export async function removeFolder(uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM folders WHERE uri = ?', uri);
}

export async function saveFile(file: FileEntry, folderUri: string): Promise<void> {
  const db = await getDatabase();
  const exists = file.exists ? 1 : 0;

  await db.runAsync(
    `INSERT INTO files (uri, name, folder_uri, extension, size, "type", "exists", last_modified, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(uri) DO UPDATE SET
       name = excluded.name, folder_uri = excluded.folder_uri, extension = excluded.extension,
       size = excluded.size, "type" = excluded."type", "exists" = excluded."exists",
       last_modified = excluded.last_modified`,
    file.uri,
    file.name,
    folderUri,
    file.extension ?? null,
    file.size,
    file.type ?? null,
    exists,
    file.lastModified,
    Date.now(),
  );
}

export async function getFiles(folderUri?: string): Promise<StoredFile[]> {
  const db = await getDatabase();
  const rows = folderUri
    ? await db.getAllAsync<FileRow>(
        'SELECT * FROM files WHERE folder_uri = ? ORDER BY name ASC',
        folderUri,
      )
    : await db.getAllAsync<FileRow>('SELECT * FROM files ORDER BY name ASC');
  return rows.map(toStoredFile);
}

export async function removeFile(uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM files WHERE uri = ?', uri);
}

export async function saveUserPreferences(preferences: UserPreferences): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO user_preferences ("key", "value", updated_at) VALUES (?, ?, ?)
     ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", updated_at = excluded.updated_at`,
    PREFERENCES_KEY,
    JSON.stringify(preferences),
    Date.now(),
  );
}

export async function getUserPreferences(): Promise<UserPreferences> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT "value" FROM user_preferences WHERE "key" = ?',
    PREFERENCES_KEY,
  );
  if (!row) return DEFAULT_PREFERENCES;

  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(row.value) } satisfies UserPreferences;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function toFolderContext(row: FolderRow): FolderContext {
  return {
    syncStatus: row.sync_status,
    addedAt: row.added_at,
    folder: {
      uri: row.uri,
      name: row.name,
      isDirectory: true,
      exists: row.exists === null ? undefined : row.exists === 1,
    },
  };
}

function toStoredFile(row: FileRow): StoredFile {
  return {
    uri: row.uri,
    name: row.name,
    isDirectory: false,
    extension: row.extension ?? '',
    exists: row.exists === 1,
    size: row.size,
    type: row.type ?? '',
    lastModified: row.last_modified,
    folderUri: row.folder_uri,
    syncStatus: row.sync_status,
    addedAt: row.added_at,
  };
}