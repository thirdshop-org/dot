import type { SQLiteDatabase } from 'expo-sqlite';
import { DATABASE_VERSION } from './schema';

type Migration = {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: async (db) => {
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
    },
  },
  {
    version: 2,
    up: async (db) => {
      await db.execAsync(`
CREATE INDEX IF NOT EXISTS idx_files_folder_uri ON files(folder_uri);
`);
    },
  },
];

async function readUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

async function writeUserVersion(db: SQLiteDatabase, version: number): Promise<void> {
  await db.execAsync(`PRAGMA user_version = ${version}`);
}

export async function migrateDatabase(
  db: SQLiteDatabase,
  targetVersion: number = DATABASE_VERSION,
): Promise<void> {
  let currentVersion = await readUserVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion && migration.version <= targetVersion) {
      await migration.up(db);
      await writeUserVersion(db, migration.version);
      currentVersion = migration.version;
    }
  }
}