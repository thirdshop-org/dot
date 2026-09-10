import { DATABASE_VERSION, DEVICE_USER_ID_KEY } from './schema';

export type MigrationDb = {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  withExclusiveTransactionAsync(task: (txn: MigrationDb) => Promise<void>): Promise<void>;
};

export type Migration = {
  version: number;
  up: (db: MigrationDb) => Promise<void>;
};

export const MIGRATIONS: Migration[] = [
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
  {
    version: 3,
    up: async (db) => {
      await db.execAsync(`
CREATE TABLE IF NOT EXISTS resource_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('folder', 'file')),
  effective_access TEXT NOT NULL CHECK (effective_access IN ('owner', 'editor', 'commenter', 'viewer')),
  inherit INTEGER NOT NULL DEFAULT 1,
  owner_id TEXT,
  shared_by_id TEXT,
  expires_at INTEGER,
  cached_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (resource_id, resource_type)
);
CREATE TABLE IF NOT EXISTS shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('folder', 'file')),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('user', 'group')),
  recipient_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('owner', 'editor', 'commenter', 'viewer')),
  inherit INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (resource_id, resource_type, recipient_type, recipient_id)
);
CREATE TABLE IF NOT EXISTS recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('user', 'group')),
  recipient_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS share_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('folder', 'file')),
  has_password INTEGER NOT NULL DEFAULT 0,
  allow_download INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER,
  max_downloads INTEGER,
  downloads_count INTEGER NOT NULL DEFAULT 0,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (max_downloads IS NULL OR max_downloads >= 0),
  CHECK (downloads_count >= 0)
);
CREATE TABLE IF NOT EXISTS pending_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  resource_id TEXT,
  resource_type TEXT CHECK (resource_type IN ('folder', 'file')),
  ref_type TEXT CHECK (ref_type IN ('resource', 'share', 'share_link')),
  ref_id INTEGER,
  operation TEXT NOT NULL CHECK (operation IN (
    'create_resource', 'update_metadata', 'delete_resource', 'move_resource',
    'share', 'revoke_share', 'update_share',
    'create_link', 'revoke_link'
  )),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  next_retry_at INTEGER,
  last_error_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pending_queue ON pending_operations(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pending_resource ON pending_operations(resource_id);
`);
      await db.execAsync(
        `INSERT OR IGNORE INTO user_preferences ("key", "value", updated_at)
         VALUES ('${DEVICE_USER_ID_KEY}', lower(hex(randomblob(16))), ${Date.now()});`,
      );
    },
  },
  {
    version: 4,
    up: async (db) => {
      await db.execAsync('PRAGMA foreign_keys = OFF;');
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync(`
CREATE TABLE folders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  resource_id TEXT NOT NULL UNIQUE,
  uri TEXT,
  name TEXT NOT NULL,
  "exists" INTEGER,
  parent_resource_id TEXT REFERENCES folders_new(resource_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'local',
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`);
        await txn.execAsync(`
INSERT INTO folders_new (id, resource_id, uri, name, "exists", parent_resource_id, owner_id, sync_status, added_at, updated_at)
SELECT id, lower(hex(randomblob(16))), uri, name, "exists", NULL,
  (SELECT "value" FROM user_preferences WHERE "key" = '${DEVICE_USER_ID_KEY}'),
  sync_status, added_at, added_at FROM folders;
`);
        await txn.execAsync(`
UPDATE folders_new SET parent_resource_id = (
  SELECT parent_new.resource_id
  FROM folders old_child
  JOIN folders old_parent ON old_parent.uri = old_child.parent_uri
  JOIN folders_new parent_new ON parent_new.uri = old_parent.uri
  WHERE old_child.uri = folders_new.uri
);
`);
        await txn.execAsync('DROP TABLE folders;');
        await txn.execAsync('ALTER TABLE folders_new RENAME TO folders;');
        await txn.execAsync(`
CREATE TABLE files_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  resource_id TEXT NOT NULL UNIQUE,
  uri TEXT,
  name TEXT NOT NULL,
  folder_resource_id TEXT NOT NULL REFERENCES folders(resource_id) ON DELETE CASCADE,
  extension TEXT,
  size INTEGER,
  "type" TEXT,
  "exists" INTEGER,
  last_modified INTEGER,
  owner_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'local',
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`);
        await txn.execAsync(`
INSERT INTO files_new (id, resource_id, uri, name, folder_resource_id, extension, size, "type", "exists", last_modified, owner_id, sync_status, added_at, updated_at)
SELECT f.id, lower(hex(randomblob(16))), f.uri, f.name,
  fn.resource_id,
  f.extension, f.size, f."type", f."exists", f.last_modified,
  (SELECT "value" FROM user_preferences WHERE "key" = '${DEVICE_USER_ID_KEY}'),
  f.sync_status, f.added_at, f.added_at
FROM files f
JOIN folders fn ON fn.uri = f.folder_uri;
`);
        await txn.execAsync('DROP TABLE files;');
        await txn.execAsync('ALTER TABLE files_new RENAME TO files;');
        await txn.execAsync(`
CREATE INDEX IF NOT EXISTS idx_folders_resource_id ON folders(resource_id);
CREATE INDEX IF NOT EXISTS idx_files_resource_id ON files(resource_id);
CREATE INDEX IF NOT EXISTS idx_files_folder_resource ON files(folder_resource_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_resource_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_uri ON folders(uri) WHERE uri IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_uri ON files(uri) WHERE uri IS NOT NULL;
`);
        await txn.execAsync(`PRAGMA user_version = 4;`);
      });
      await db.execAsync('PRAGMA foreign_keys = ON;');
    },
  },
  {
    // User-first : pending_operations et resource_permissions deviennent
    // scopés par compte (`user_id`), NULL = entrées legacy/device-local. Le
    // UNIQUE de resource_permissions passe à (user_id, resource_id,
    // resource_type) pour qu'un même fichier partagé à deux comptes ne
    // collisionne pas côté cache. SQLite ne pouvant pas altérer un UNIQUE, la
    // table est reconstruite (le schéma v5 se base sur v3/v4 — l'indice
    // UNIQUE (resource_id, resource_type) a été posé en v3).
    version: 5,
    up: async (db) => {
      await db.execAsync('PRAGMA foreign_keys = OFF;');
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync(`
CREATE TABLE resource_permissions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id TEXT,
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('folder', 'file')),
  effective_access TEXT NOT NULL CHECK (effective_access IN ('owner', 'editor', 'commenter', 'viewer')),
  inherit INTEGER NOT NULL DEFAULT 1,
  owner_id TEXT,
  shared_by_id TEXT,
  expires_at INTEGER,
  cached_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, resource_id, resource_type)
);
INSERT INTO resource_permissions_new (id, user_id, resource_id, resource_type, effective_access, inherit, owner_id, shared_by_id, expires_at, cached_at, updated_at)
SELECT id, NULL, resource_id, resource_type, effective_access, inherit, owner_id, shared_by_id, expires_at, cached_at, updated_at FROM resource_permissions;
DROP TABLE resource_permissions;
ALTER TABLE resource_permissions_new RENAME TO resource_permissions;
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON resource_permissions(resource_id, resource_type);
`);
        await txn.execAsync(`
ALTER TABLE pending_operations ADD COLUMN user_id TEXT;
`);
        await txn.execAsync(`PRAGMA user_version = 5;`);
      });
      await db.execAsync('PRAGMA foreign_keys = ON;');
    },
  },
];

async function readUserVersion(db: MigrationDb): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

async function writeUserVersion(db: MigrationDb, version: number): Promise<void> {
  await db.execAsync(`PRAGMA user_version = ${version}`);
}

const migrationPromises = new WeakMap<MigrationDb, Promise<void>>();

export async function migrateDatabase(
  db: MigrationDb,
  targetVersion: number = DATABASE_VERSION,
): Promise<void> {
  const existing = migrationPromises.get(db);
  if (existing) return existing;

  const promise = runMigrations(db, targetVersion).finally(() => {
    migrationPromises.delete(db);
  });
  migrationPromises.set(db, promise);
  return promise;
}

async function runMigrations(db: MigrationDb, targetVersion: number): Promise<void> {
  let currentVersion = await readUserVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion && migration.version <= targetVersion) {
      await migration.up(db);
      await writeUserVersion(db, migration.version);
      currentVersion = migration.version;
    }
  }
}