import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { MIGRATIONS, type MigrationDb } from '../services/db/migrations';
import type { DbSession } from '../services/db/session';
import { __setDbForTests } from '../services/db/session';
import {
  saveFolder,
  getFolders,
  getFolder,
  removeFolder,
  saveFile,
  getFiles,
  canAccess,
  saveResourcePermission,
  saveShare,
  getShares,
  createShareLink,
  getShareLinks,
  incrementLinkDownloads,
  enqueuePendingOperation,
  getPendingOperations,
  getNextQueuedOperation,
  markPendingOperation,
  getDeviceUserId,
  DEVICE_USER_ID_KEY,
  PERMISSION_TTL_MS,
} from '../services/db';
import type { FileEntry } from '../services/safDirectory.types';
import { MAX_PENDING_ATTEMPTS } from '../services/db/repositories/pendingOps';

type Harness = MigrationDb & DbSession;

let h: Harness;

function createHarness(): Harness {
  const sqlite = new Database(':memory:');
  const harness: Harness = {
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      sqlite.prepare(sql).run(...params);
    },
    getFirstAsync: async (sql: string, ...params: unknown[]) =>
      (sqlite.prepare(sql).get(...params) ?? null) as never,
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...params) as never,
    withExclusiveTransactionAsync: async (task: (txn: Harness) => Promise<void>) => {
      sqlite.exec('BEGIN');
      try {
        await task(harness);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return harness;
}

beforeEach(async () => {
  h = createHarness();
  for (const migration of MIGRATIONS) {
    await migration.up(h);
  }
  __setDbForTests(h);
});

afterEach(() => {
  __setDbForTests(null);
});

function fileEntry(uri: string, overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    uri,
    name: uri.split('/').pop() ?? uri,
    isDirectory: false,
    extension: uri.split('.').pop() ?? '',
    exists: true,
    size: 10,
    type: 'application/octet-stream',
    lastModified: 1,
    ...overrides,
  };
}

async function setOwner(
  table: 'folders' | 'files',
  resourceId: string,
  ownerId: string,
): Promise<void> {
  await h.runAsync(`UPDATE ${table} SET owner_id = ? WHERE resource_id = ?`, ownerId, resourceId);
}

test('folder upsert is idempotent by uri (same resource_id, single row)', async () => {
  const a = await saveFolder({ uri: 'content://a', name: 'A' });
  const b = await saveFolder({ uri: 'content://a', name: 'A renamed' });

  assert.equal(a.resource_id, b.resource_id);
  assert.equal(b.name, 'A renamed');
  assert.equal(b.uri, 'content://a');
  assert.equal((await getFolders()).length, 1);
});

test('distinct uris produce distinct rows', async () => {
  await saveFolder({ uri: 'content://a', name: 'A' });
  await saveFolder({ uri: 'content://b', name: 'B' });
  assert.equal((await getFolders()).length, 2);
});

test('cloud-only folder gains a uri without duplicating (reconciled by resource_id)', async () => {
  const cloud = await saveFolder({ uri: null, name: 'Cloud', resource_id: 'abc123' });
  assert.equal(cloud.uri, null);
  const wired = await saveFolder({ uri: 'content://cloud', name: 'Cloud', resource_id: 'abc123' });
  assert.equal(wired.resource_id, 'abc123');
  assert.equal(wired.uri, 'content://cloud');
  assert.equal((await getFolders()).length, 1);
});

test('inserting a folder with a nonexistent parent throws a FK error (no silent orphan)', async () => {
  await assert.rejects(
    () => saveFolder({ uri: 'content://child', name: 'C' }, { parentResourceId: 'does-not-exist' }),
    /FOREIGN KEY/,
  );
});

test('inserting a file before its parent folder throws a FK error', async () => {
  await assert.rejects(
    () => saveFile(fileEntry('content://orphan/f.pdf'), 'missing-folder'),
    /FOREIGN KEY/,
  );
});

test('re-saving a folder without a parent keeps the existing parent', async () => {
  const root = await saveFolder({ uri: 'content://r', name: 'R' });
  const child = await saveFolder({ uri: 'content://r/c', name: 'C' }, { parentResourceId: root.resource_id });
  const reSaved = await saveFolder({ uri: 'content://r/c', name: 'C2' });
  assert.equal(reSaved.parent_resource_id, root.resource_id);
});

test('a full SAF walk repeated twice is a no-op (BFS order, uri reconciliation)', async () => {
  const root = await saveFolder({ uri: 'content://root', name: 'Root' });
  const sub = await saveFolder({ uri: 'content://root/sub', name: 'Sub' }, { parentResourceId: root.resource_id });
  await saveFile(fileEntry('content://root/sub/f1.pdf'), sub.resource_id);

  const root2 = await saveFolder({ uri: 'content://root', name: 'Root' });
  const sub2 = await saveFolder({ uri: 'content://root/sub', name: 'Sub' }, { parentResourceId: root2.resource_id });
  await saveFile(fileEntry('content://root/sub/f1.pdf'), sub2.resource_id);

  assert.equal(root.resource_id, root2.resource_id);
  assert.equal(sub.resource_id, sub2.resource_id);
  assert.equal(sub2.parent_resource_id, root2.resource_id);
  assert.equal((await getFolders()).length, 2);
  assert.equal((await getFiles()).length, 1);
  const stored = await getFiles(sub2.resource_id);
  assert.equal(stored.length, 1);
});

test('removing a root folder cascades to its subtree and files', async () => {
  const root = await saveFolder({ uri: 'content://root', name: 'Root' });
  const sub = await saveFolder({ uri: 'content://root/sub', name: 'Sub' }, { parentResourceId: root.resource_id });
  await saveFile(fileEntry('content://root/sub/f1.pdf'), sub.resource_id);

  await removeFolder(root.resource_id);

  assert.equal((await getFolders()).length, 0);
  assert.equal((await getFiles()).length, 0);
});

test('canAccess: nothing granted => denied, owner fallback grants owner', async () => {
  const root = await saveFolder({ uri: 'content://r', name: 'R' });
  const sub = await saveFolder({ uri: 'content://r/s', name: 'S' }, { parentResourceId: root.resource_id });
  const f = await saveFile(fileEntry('content://r/s/f.pdf'), sub.resource_id);

  const device = await getDeviceUserId();
  await setOwner('folders', root.resource_id, 'other');
  await setOwner('folders', sub.resource_id, 'other');
  await setOwner('files', f.resource_id, 'other');

  assert.equal((await canAccess(f.resource_id, 'file', 'viewer')).allowed, false);
  assert.equal((await canAccess(sub.resource_id, 'folder', 'viewer')).allowed, false);

  await setOwner('folders', sub.resource_id, device);
  assert.equal((await canAccess(f.resource_id, 'file', 'owner')).allowed, true);
  assert.equal((await canAccess(f.resource_id, 'file', 'viewer')).source, 'owner');
});

test('canAccess: granted permission on an ancestor inherits through deep folders', async () => {
  const ids: string[] = [];
  let parentResourceId: string | null = null;
  for (let depth = 0; depth < 5; depth++) {
    const folder = await saveFolder(
      { uri: `content://chain/${depth}`, name: `n${depth}` },
      { parentResourceId },
    );
    ids.push(folder.resource_id);
    parentResourceId = folder.resource_id;
  }
  const f = await saveFile(fileEntry('content://chain/f.pdf'), parentResourceId!);
  const device = await getDeviceUserId();
  for (const id of ids) await setOwner('folders', id, 'other');
  await setOwner('files', f.resource_id, 'other');

  await saveResourcePermission({
    resource_id: ids[0],
    resourceType: 'folder',
    effectiveAccess: 'viewer',
    inherit: true,
  });
  assert.equal((await canAccess(f.resource_id, 'file', 'viewer')).allowed, true, 'viewer inherited from root');
  assert.equal((await canAccess(f.resource_id, 'file', 'editor')).allowed, false, 'viewer is not editor');
  assert.equal((await canAccess(f.resource_id, 'file', 'viewer')).source, 'inherited');
});

test('canAccess: inherit=false blocks propagation but allows the node itself', async () => {
  const root = await saveFolder({ uri: 'content://r', name: 'R' });
  const sub = await saveFolder({ uri: 'content://r/s', name: 'S' }, { parentResourceId: root.resource_id });
  const f = await saveFile(fileEntry('content://r/s/f.pdf'), sub.resource_id);
  const device = await getDeviceUserId();
  await setOwner('folders', root.resource_id, 'other');
  await setOwner('folders', sub.resource_id, 'other');
  await setOwner('files', f.resource_id, 'other');

  await saveResourcePermission({
    resource_id: root.resource_id,
    resourceType: 'folder',
    effectiveAccess: 'viewer',
    inherit: false,
  });
  assert.equal((await canAccess(root.resource_id, 'folder', 'viewer')).allowed, true, 'root itself keeps viewer');
  assert.equal((await canAccess(sub.resource_id, 'folder', 'viewer')).allowed, false, 'inheritance stopped');
  assert.equal((await canAccess(f.resource_id, 'file', 'viewer')).allowed, false);

  await saveResourcePermission({
    resource_id: sub.resource_id,
    resourceType: 'folder',
    effectiveAccess: 'viewer',
    inherit: true,
  });
  assert.equal((await canAccess(f.resource_id, 'file', 'viewer')).allowed, true, 'closer ancestor grants descend');
});

test('canAccess: an expired permission is denied and does not propagate', async () => {
  const root = await saveFolder({ uri: 'content://r', name: 'R' });
  const sub = await saveFolder({ uri: 'content://r/s', name: 'S' }, { parentResourceId: root.resource_id });
  const device = await getDeviceUserId();
  await setOwner('folders', root.resource_id, 'other');
  await setOwner('folders', sub.resource_id, 'other');

  await saveResourcePermission({
    resource_id: root.resource_id,
    resourceType: 'folder',
    effectiveAccess: 'viewer',
    inherit: true,
    expiresAt: Date.now() - 1000,
  });
  assert.equal((await canAccess(root.resource_id, 'folder', 'viewer')).allowed, false);
  assert.equal((await canAccess(sub.resource_id, 'folder', 'viewer')).allowed, false);
});

test('canAccess: stale cache only allows read (viewer), fresh cache allows the granted level', async () => {
  const root = await saveFolder({ uri: 'content://r', name: 'R' });
  const sub = await saveFolder({ uri: 'content://r/s', name: 'S' }, { parentResourceId: root.resource_id });
  const device = await getDeviceUserId();
  await setOwner('folders', root.resource_id, 'other');
  await setOwner('folders', sub.resource_id, 'other');

  await saveResourcePermission({
    resource_id: root.resource_id,
    resourceType: 'folder',
    effectiveAccess: 'editor',
    inherit: true,
  });
  assert.equal((await canAccess(sub.resource_id, 'folder', 'editor')).allowed, true, 'fresh editor grant');

  await h.runAsync(
    'UPDATE resource_permissions SET cached_at = ? WHERE resource_id = ?',
    Date.now() - PERMISSION_TTL_MS - 60_000,
    root.resource_id,
  );
  assert.equal((await canAccess(sub.resource_id, 'folder', 'viewer')).allowed, true, 'stale still allows read');
  assert.equal((await canAccess(sub.resource_id, 'folder', 'editor')).allowed, false, 'stale blocks writes');
  assert.equal((await canAccess(sub.resource_id, 'folder', 'viewer')).stale, true);
});

test('canAccess: a cached decision on the exact node is authoritative even if weaker', async () => {
  const root = await saveFolder({ uri: 'content://r', name: 'R' });
  const sub = await saveFolder({ uri: 'content://r/s', name: 'S' }, { parentResourceId: root.resource_id });
  const device = await getDeviceUserId();
  await setOwner('folders', root.resource_id, 'other');
  await setOwner('folders', sub.resource_id, 'other');

  await saveResourcePermission({
    resource_id: root.resource_id,
    resourceType: 'folder',
    effectiveAccess: 'editor',
    inherit: true,
  });
  await saveResourcePermission({
    resource_id: sub.resource_id,
    resourceType: 'folder',
    effectiveAccess: 'viewer',
    inherit: true,
  });

  assert.equal((await canAccess(sub.resource_id, 'folder', 'viewer')).allowed, true);
  assert.equal((await canAccess(sub.resource_id, 'folder', 'editor')).allowed, false, 'exact viewer cache overrides inherited editor');
});

test('outbox: ops on the same resource are drained in FIFO order (id tie-break)', async () => {
  const id1 = await enqueuePendingOperation({ operation: 'create_resource', resourceId: 'a' });
  const id2 = await enqueuePendingOperation({ operation: 'update_metadata', resourceId: 'a' });
  const id3 = await enqueuePendingOperation({ operation: 'delete_resource', resourceId: 'a' });
  await h.runAsync('UPDATE pending_operations SET created_at = ?', 1000);

  const ops = await getPendingOperations();
  assert.deepEqual(
    ops.map((o) => o.operation),
    ['create_resource', 'update_metadata', 'delete_resource'],
  );

  const first = await getNextQueuedOperation();
  assert.equal(first!.id, id1);
  await markPendingOperation(first!.id, 'completed');
  const second = await getNextQueuedOperation();
  assert.equal(second!.id, id2);
  await markPendingOperation(second!.id, 'completed');
  assert.equal((await getNextQueuedOperation())!.id, id3);
});

test('outbox: a failure stays pending with a backoff, then dead-letters after max attempts', async () => {
  const id = await enqueuePendingOperation({ operation: 'create_resource', resourceId: 'a' });

  await markPendingOperation(id, 'failed', 'boom');
  let row = await h.getFirstAsync<{
    status: string;
    attempts: number;
    next_retry_at: number | null;
  }>('SELECT status, attempts, next_retry_at FROM pending_operations WHERE id = ?', id);
  assert.equal(row!.status, 'pending');
  assert.equal(row!.attempts, 1);
  assert.ok((row!.next_retry_at ?? 0) > Date.now(), 'retry scheduled in the future');

  assert.equal(await getNextQueuedOperation(), null, 'backoff respects next_retry_at');

  await h.runAsync('UPDATE pending_operations SET next_retry_at = ? WHERE id = ?', 0, id);
  const due = await getNextQueuedOperation();
  assert.ok(due);
  assert.equal(due.attempts, 1);

  for (let i = 0; i < MAX_PENDING_ATTEMPTS - 1; i++) {
    await markPendingOperation(id, 'failed', 'still failing');
  }
  row = await h.getFirstAsync<{
    status: string;
    attempts: number;
    next_retry_at: number | null;
  }>('SELECT status, attempts, next_retry_at FROM pending_operations WHERE id = ?', id);
  assert.equal(row!.status, 'failed', 'dead-lettered');
  assert.equal(row!.attempts, MAX_PENDING_ATTEMPTS);
  assert.equal(row!.next_retry_at, null);
  assert.equal(await getNextQueuedOperation(), null, 'dead-lettered ops are never re-picked');

  const share = await saveShare({
    resourceId: 'a',
    resourceType: 'folder',
    recipientType: 'user',
    recipientId: 'u1',
    relation: 'viewer',
  });
  assert.equal(share.pushStatus, 'synced');
});

test('shares and share links derive pushStatus from the outbox', async () => {
  const share = await saveShare({
    resourceId: 'res-1',
    resourceType: 'folder',
    recipientType: 'user',
    recipientId: 'u1',
    relation: 'editor',
  });
  assert.equal(share.pushStatus, 'synced');

  const opId = await enqueuePendingOperation({
    refType: 'share',
    refId: share.id,
    operation: 'share',
    resourceId: 'res-1',
    resourceType: 'folder',
  });
  assert.equal((await getShares('res-1', 'folder'))[0].pushStatus, 'pending');

  await markPendingOperation(opId, 'failed', 'nope');
  assert.equal(
    (await getShares('res-1', 'folder'))[0].pushStatus,
    'pending',
    'a single failure schedules a retry, share stays pending',
  );

  for (let attempt = 1; attempt < MAX_PENDING_ATTEMPTS; attempt++) {
    await markPendingOperation(opId, 'failed', 'still failing');
  }
  assert.equal((await getShares('res-1', 'folder'))[0].pushStatus, 'failed', 'dead-lettered');

  await markPendingOperation(opId, 'completed');
  const shares = await getShares('res-1', 'folder');
  assert.equal(shares.length, 1);
  assert.equal(shares[0].pushStatus, 'synced', 'no pending/failed left');

  const link = await createShareLink({ resourceId: 'res-1', resourceType: 'folder' });
  assert.match(link.token, /^[0-9a-f]{32}$/);
  assert.equal(link.pushStatus, 'synced');

  const linkOpId = await enqueuePendingOperation({
    refType: 'share_link',
    refId: link.id,
    operation: 'create_link',
  });
  assert.equal((await getShareLinks('res-1', 'folder'))[0].pushStatus, 'pending');
  await markPendingOperation(linkOpId, 'completed');
  assert.equal((await getShareLinks('res-1', 'folder'))[0].pushStatus, 'synced');

  await incrementLinkDownloads(link.id);
  assert.equal((await getShareLinks('res-1', 'folder'))[0].downloadsCount, 1);
});

test('device user id is a stable lowercase 32-hex string shared by all rows', async () => {
  const device = await getDeviceUserId();
  assert.match(device, /^[0-9a-f]{32}$/);

  const root = await saveFolder({ uri: 'content://r', name: 'R' });
  const rootRow = await getFolder(root.resource_id);
  assert.equal(rootRow!.owner_id, device);

  const seeded = await h.getFirstAsync<{ value: string }>(
    'SELECT "value" FROM user_preferences WHERE "key" = ?',
    DEVICE_USER_ID_KEY,
  );
  assert.equal(seeded!.value, device);
});