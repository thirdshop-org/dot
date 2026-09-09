import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { MIGRATIONS, migrateDatabase } from '../services/db/migrations';
import { DATABASE_VERSION, DEVICE_USER_ID_KEY } from '../services/db/schema';

type Harness = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<void>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  withExclusiveTransactionAsync<T>(task: (txn: Harness) => Promise<T>): Promise<T>;
  raw: Database.Database;
};

function createHarness(): Harness {
  const db = new Database(':memory:');
  const self: Harness = {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    runAsync: async (sql, ...params) => {
      db.prepare(sql).run(...params);
    },
    getFirstAsync: async (sql, ...params) =>
      (db.prepare(sql).get(...params) ?? null) as never,
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params) as never,
    withExclusiveTransactionAsync: async (task) => {
      db.exec('BEGIN');
      try {
        const result = await task(self);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    raw: db,
  };
  return self;
}

async function userVersion(h: Harness): Promise<number> {
  const row = await h.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

async function columnNames(h: Harness, table: string): Promise<string[]> {
  const rows = await h.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

async function foreignKeyViolations(h: Harness): Promise<unknown[]> {
  return h.getAllAsync('PRAGMA foreign_key_check');
}

const ROOT_URI = 'content://com.android.providers.documents/tree/primary%3ADocuments';
const SUB_URI = 'content://com.android.providers.documents/tree/primary%3ADocuments%2Fphotos%20encod%2520ed';
const EMPTY_URI = 'content://com.android.providers.documents/document/empty';
const MUSIC_URI = 'content://com.android.providers.documents/tree/primary%3AMusic';
const NOTE_URI = 'content://com.android.providers.documents/document/primary%20note.txt';
const PIC_URI = 'content://com.android.providers.documents/document/primary%3Aphotos%2Fpic%20.jpg';
const SONG_URI = 'content://com.android.providers.documents/document/primary%3ASong%20encod%2520.mp3';

async function seedLegacyTree(h: Harness): Promise<void> {
  await h.execAsync(`INSERT INTO folders (uri, name, "exists", sync_status, added_at, parent_uri)
    VALUES ('${ROOT_URI}', 'Docs', 1, 'local', 1000, NULL);`);
  await h.execAsync(`INSERT INTO folders (uri, name, "exists", sync_status, added_at, parent_uri)
    VALUES ('${SUB_URI}', 'Photos 2024', 1, 'local', 2000, '${ROOT_URI}');`);
  await h.execAsync(`INSERT INTO folders (uri, name, "exists", sync_status, added_at, parent_uri)
    VALUES ('${EMPTY_URI}', 'Empty', 1, 'cloud', 3000, NULL);`);
  await h.execAsync(`INSERT INTO folders (uri, name, "exists", sync_status, added_at, parent_uri)
    VALUES ('${MUSIC_URI}', 'Music', 0, 'local-cloud', 4000, NULL);`);
  await h.execAsync(`INSERT INTO files (uri, name, folder_uri, extension, size, "type", "exists", last_modified, sync_status, added_at)
    VALUES ('${NOTE_URI}', 'note.txt', '${ROOT_URI}', 'txt', 10, 'text/plain', 1, 1000, 'local', 1000);`);
  await h.execAsync(`INSERT INTO files (uri, name, folder_uri, extension, size, "type", "exists", last_modified, sync_status, added_at)
    VALUES ('${PIC_URI}', 'pic.jpg', '${SUB_URI}', 'jpg', 20, 'image/jpeg', 1, 2000, 'local-cloud', 2000);`);
  await h.execAsync(`INSERT INTO files (uri, name, folder_uri, extension, size, "type", "exists", last_modified, sync_status, added_at)
    VALUES ('${SONG_URI}', 'song.mp3', '${MUSIC_URI}', 'mp3', 30, 'audio/mpeg', 0, 3000, 'cloud', 3000);`);
}

test('fresh migrate v0 → v4 creates full schema and seeds device id', async () => {
  const h = createHarness();
  await migrateDatabase(h);

  assert.equal(await userVersion(h), DATABASE_VERSION, `user_version should be ${DATABASE_VERSION}`);

  const folderCols = await columnNames(h, 'folders');
  for (const col of ['resource_id', 'uri', 'parent_resource_id', 'owner_id', 'updated_at']) {
    assert.ok(folderCols.includes(col), `folders should have column ${col}`);
  }
  assert.ok(!folderCols.includes('parent_uri'), 'parent_uri must be replaced by parent_resource_id');

  const fileCols = await columnNames(h, 'files');
  for (const col of ['resource_id', 'folder_resource_id', 'owner_id', 'updated_at']) {
    assert.ok(fileCols.includes(col), `files should have column ${col}`);
  }

  for (const table of [
    'resource_permissions',
    'shares',
    'recipients',
    'share_links',
    'pending_operations',
  ]) {
    const names = await columnNames(h, table);
    assert.ok(names.length > 0, `table ${table} must exist`);
  }

  const device = await h.getFirstAsync<{ value: string }>(
    'SELECT "value" FROM user_preferences WHERE "key" = ?',
    DEVICE_USER_ID_KEY,
  );
  assert.ok(device && /^[0-9a-f]{32}$/.test(device.value), 'device_user_id seeded as 32-hex');

  assert.deepEqual(await foreignKeyViolations(h), [], 'no orphaned FKs after fresh migrate');
});

test('user_version is transactional (rollback restores previous version)', async () => {
  const h = createHarness();
  await migrateDatabase(h);
  const before = await userVersion(h);

  h.raw.exec('BEGIN');
  h.raw.exec('PRAGMA user_version = 999');
  h.raw.exec('ROLLBACK');

  assert.equal(await userVersion(h), before, 'user_version must be rolled back');
});

test('realistic v2 → v4 tree is preserved with correct reparenting', async () => {
  const h = createHarness();
  await migrateDatabase(h, 2);
  await seedLegacyTree(h);

  await migrateDatabase(h);

  assert.equal(await userVersion(h), DATABASE_VERSION);

  const folders = await h.getAllAsync<{
    resource_id: string;
    uri: string | null;
    name: string;
    parent_resource_id: string | null;
    owner_id: string;
    added_at: number;
    updated_at: number;
  }>('SELECT resource_id, uri, name, parent_resource_id, owner_id, added_at, updated_at FROM folders');
  const files = await h.getAllAsync<{
    resource_id: string;
    uri: string | null;
    name: string;
    folder_resource_id: string;
    owner_id: string;
    added_at: number;
    updated_at: number;
  }>('SELECT resource_id, uri, name, folder_resource_id, owner_id, added_at, updated_at FROM files');

  assert.equal(folders.length, 4, 'folders count preserved');
  assert.equal(files.length, 3, 'files count preserved');

  for (const f of folders) {
    assert.match(f.resource_id, /^[0-9a-f]{32}$/, 'resource_id must be 32-hex once');
    assert.ok(f.owner_id, 'owner_id must be set (never NULL implicit)');
    assert.equal(f.updated_at, f.added_at, 'backfilled updated_at = added_at');
  }
  for (const f of files) {
    assert.match(f.resource_id, /^[0-9a-f]{32}$/, 'resource_id must be 32-hex');
    assert.ok(f.owner_id, 'owner_id must be set');
  }
  const resourceIds = [...folders.map((f) => f.resource_id), ...files.map((f) => f.resource_id)];
  assert.equal(new Set(resourceIds).size, resourceIds.length, 'all resource ids unique in the same table');

  const device = await h.getFirstAsync<{ value: string }>(
    'SELECT "value" FROM user_preferences WHERE "key" = ?',
    DEVICE_USER_ID_KEY,
  );
  for (const f of [...folders, ...files]) {
    assert.equal(f.owner_id, device!.value, `owner_id must be device_user_id, got ${f.owner_id}`);
  }

  const byUri = new Map(folders.map((f) => [f.uri, f]));
  const root = byUri.get(ROOT_URI);
  const sub = byUri.get(SUB_URI);
  assert.ok(root && sub, 'local uris preserved on local rows');
  assert.equal(sub.parent_resource_id, root.resource_id, 'child folder reparented to root resource_id');

  const byName = new Map(folders.map((f) => [f.name, f]));
  const empty = byName.get('Empty');
  assert.equal(empty!.parent_resource_id, null, 'root folder stays root');

  const note = files.find((f) => f.name === 'note.txt');
  const pic = files.find((f) => f.name === 'pic.jpg');
  const song = files.find((f) => f.name === 'song.mp3');
  assert.equal(note!.folder_resource_id, root.resource_id, 'file linked to root folder');
  assert.equal(pic!.folder_resource_id, sub.resource_id, 'file linked to nested folder');
  assert.equal(song!.folder_resource_id, byName.get('Music')!.resource_id, 'cloud file linked to cloud folder');

  assert.deepEqual(await foreignKeyViolations(h), [], 'no orphaned FKs after v2→v4');
});

test('cascade delete works through the rebuilt self-FK', async () => {
  const h = createHarness();
  await migrateDatabase(h, 2);
  await seedLegacyTree(h);
  await migrateDatabase(h);

  const folders = await h.getAllAsync<{ resource_id: string; name: string; parent_resource_id: string | null }>(
    'SELECT resource_id, name, parent_resource_id FROM folders',
  );
  const root = folders.find((f) => f.name === 'Docs')!;

  await h.runAsync('DELETE FROM folders WHERE resource_id = ?', root.resource_id);

  const names = await h.getAllAsync<{ name: string }>('SELECT name FROM folders');
  assert.equal(names.length, 2, 'root and its subtree removed (Docs, Photos 2024)');
  const files = await h.getAllAsync<{ name: string }>('SELECT name FROM files');
  assert.equal(files.length, 1, 'only Music file remains (note + pic cascaded)');
  assert.deepEqual(await foreignKeyViolations(h), [], 'no orphans after cascade');
});

test('v4 crash is atomic: rollback keeps v3 schema and data, rerun succeeds', async () => {
  const h = createHarness();
  await migrateDatabase(h, 3);
  await seedLegacyTree(h);

  const originalExec = h.execAsync.bind(h);
  h.execAsync = async (sql) => {
    if (sql.startsWith('DROP TABLE files;')) {
      throw new Error('simulated crash during rebuild');
    }
    return originalExec(sql);
  };

  const v4 = MIGRATIONS.find((m) => m.version === 4);
  assert.ok(v4, 'v4 migration exists');
  await assert.rejects(() => v4.up(h), /simulated crash/);

  assert.equal(await userVersion(h), 3, 'user_version unchanged after failed rebuild');
  assert.ok((await columnNames(h, 'folders')).includes('parent_uri'), 'old folders schema restored');
  const folders = await h.getAllAsync<{ name: string }>('SELECT name FROM folders');
  assert.equal(folders.length, 4, 'data intact after rollback');

  h.execAsync = originalExec;
  await migrateDatabase(h);

  assert.equal(await userVersion(h), DATABASE_VERSION, 'rerun completes to newest version');
  assert.ok((await columnNames(h, 'folders')).includes('resource_id'));
  const files = await h.getAllAsync<{ name: string }>('SELECT name FROM files');
  assert.equal(files.length, 3, 'files preserved after rerun');
  assert.deepEqual(await foreignKeyViolations(h), [], 'no orphans after rerun');
});

test('concurrent migrateDatabase calls are single-flight', async () => {
  const h = createHarness();
  await Promise.all([migrateDatabase(h), migrateDatabase(h)]);
  assert.equal(await userVersion(h), DATABASE_VERSION);
});