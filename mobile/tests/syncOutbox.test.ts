import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { MIGRATIONS, type MigrationDb } from '../services/db/migrations';
import type { DbSession } from '../services/db/session';
import { __setDbForTests } from '../services/db/session';
import { api, setAuthToken } from '../api/client';
import {
  enqueuePendingOperation,
  getPendingOperations,
  getResourcePermission,
  listQueuedOperations,
  markPendingOperation,
  scheduleRetries,
  MAX_PENDING_ATTEMPTS,
} from '../services/db';
import {
  pushPendingOps,
  refreshPermissions,
  resetPermissionCachedAtForTests,
} from '../features/syncOutbox';

import type { PendingOperationType } from '../services/db/types';

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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ok(data: unknown): Response {
  return jsonResponse(200, { data });
}

let calls: { url: string; init: RequestInit }[] = [];
const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init: RequestInit) => Promise<Response> | Response): void {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const initSafe = init ?? {};
    calls.push({ url: String(input), init: initSafe });
    return handler(String(input), initSafe);
  };
}

function pathOf(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

beforeEach(async () => {
  h = createHarness();
  for (const migration of MIGRATIONS) {
    await migration.up(h);
  }
  __setDbForTests(h);
  calls = [];
  setAuthToken('v4.local.test-token');
  resetPermissionCachedAtForTests();
  stubFetch(() => ok({ applied: 0, failed: null }));
});

afterEach(() => {
  __setDbForTests(null);
  globalThis.fetch = originalFetch;
});

async function enqueue(op: {
  operation: PendingOperationType;
  resourceId?: string;
  payload?: Record<string, unknown>;
}) {
  return enqueuePendingOperation({
    resourceId: op.resourceId ?? 'a'.repeat(32),
    resourceType: 'folder',
    refType: 'resource',
    refId: 7,
    operation: op.operation,
    payload: op.payload ?? { name: 'Dossier' },
  });
}

test('sans token : aucun push, aucune requête réseau', async () => {
  setAuthToken(null);
  await enqueue({ operation: 'create_resource' });
  const result = await pushPendingOps();
  assert.deepEqual(result, { pushed: 0, retried: 0 });
  assert.equal(calls.length, 0);
});

test('queue vide : aucune requête réseau', async () => {
  const result = await pushPendingOps();
  assert.deepEqual(result, { pushed: 0, retried: 0 });
  assert.equal(calls.length, 0);
});

test('succès complet : toutes les ops passent à completed, body conforme', async () => {
  const id1 = await enqueue({ operation: 'create_resource', payload: { name: 'A' } });
  const id2 = await enqueue({ operation: 'create_resource', payload: { name: 'B' } });
  stubFetch(() => ok({ applied: 2, failed: null }));

  const result = await pushPendingOps();

  assert.deepEqual(result, { pushed: 2, retried: 0 });
  assert.equal(pathOf(calls[0].url), '/api/v1/sync/ops');
  assert.equal(calls[0].init.method, 'POST');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.operations.length, 2);
  assert.equal(body.operations[0].operation_id, id1);
  assert.equal(body.operations[0].resource_type, 'folder');
  assert.deepEqual(body.operations[0].payload, { name: 'A' });
  assert.equal(body.operations[1].operation_id, id2);

  const ops = await getPendingOperations();
  const byId = new Map(ops.map((op) => [op.id, op]));
  assert.equal(byId.get(id1)?.status, 'completed');
  assert.equal(byId.get(id2)?.status, 'completed');
  assert.equal(byId.get(id1)?.attempts, 0);
});

test('succès partiel : reprise exacte à l’index applied (les suivantes intactes)', async () => {
  const id1 = await enqueue({ operation: 'create_resource' });
  const id2 = await enqueue({ operation: 'create_resource' });
  const id3 = await enqueue({ operation: 'create_resource' });
  stubFetch(() =>
    ok({
      applied: 1,
      failed: { operation_id: id2, code: 'NAME_CONFLICT', message: 'exists déjà' },
    }),
  );

  const result = await pushPendingOps();

  assert.deepEqual(result, { pushed: 1, retried: 0 });
  const ops = await getPendingOperations();
  const byId = new Map(ops.map((op) => [op.id, op]));
  assert.equal(byId.get(id1)?.status, 'completed');
  assert.equal(byId.get(id2)?.status, 'pending');
  assert.equal(byId.get(id2)?.attempts, 1); // backoff programmé, par dead-letter
  assert.ok((byId.get(id2)?.nextRetryAt ?? 0) > 0);
  assert.match(byId.get(id2)?.error ?? '', /NAME_CONFLICT/);
  assert.equal(byId.get(id3)?.status, 'pending');
  assert.equal(byId.get(id3)?.attempts, 0); // jamais soumise → intacte
});

test('applied = 0 + échec : rien commité, pas de dead-letter prématurée', async () => {
  const id1 = await enqueue({ operation: 'create_resource' });
  stubFetch(() =>
    ok({ applied: 0, failed: { operation_id: id1, code: 'INVALID_REQUEST', message: 'payload invalide' } }),
  );

  const result = await pushPendingOps();

  assert.deepEqual(result, { pushed: 0, retried: 0 });
  const [op] = await getPendingOperations();
  assert.equal(op.status, 'pending');
  assert.equal(op.attempts, 1); // < MAX_PENDING_ATTEMPTS, le cycle recommence
  assert.ok((op.nextRetryAt ?? 0) > 0);
});

test('échec transitoire (fetch rejette) : retrié sans incrémenter attempts', async () => {
  const id1 = await enqueue({ operation: 'create_resource' });
  const id2 = await enqueue({ operation: 'create_resource' });
  stubFetch(() => {
    throw new Error('network unreachable');
  });

  const result = await pushPendingOps();

  assert.deepEqual(result, { pushed: 0, retried: 2 });
  const ops = await getPendingOperations();
  for (const op of ops) {
    assert.equal(op.status, 'pending');
    assert.equal(op.attempts, 0);
    assert.ok((op.nextRetryAt ?? 0) > Date.now());
  }
});

test('échec transitoire 5xx : idem (HTTP_500 → retry, pas de dead-letter)', async () => {
  const id1 = await enqueue({ operation: 'create_resource' });
  stubFetch(() => jsonResponse(500, { error: { code: 'INTERNAL', message: 'boom' } }));

  const result = await pushPendingOps();

  assert.deepEqual(result, { pushed: 0, retried: 1 });
  const [op] = await getPendingOperations();
  assert.equal(op.status, 'pending');
  assert.equal(op.attempts, 0);
});

test('refus terminal répété : dead-letter après MAX_PENDING_ATTEMPTS', async () => {
  const id1 = await enqueue({ operation: 'create_resource' });
  stubFetch(() =>
    ok({ applied: 0, failed: { operation_id: id1, code: 'NAME_CONFLICT', message: 'dup' } }),
  );

  for (let i = 0; i < MAX_PENDING_ATTEMPTS; i++) {
    await pushPendingOps();
    // le backoff repousse next_retry_at : on force le reset pour re-soumettre
    await h.runAsync('UPDATE pending_operations SET next_retry_at = NULL');
  }

  const [op] = await getPendingOperations();
  assert.equal(op.status, 'failed');
  assert.equal(op.attempts, MAX_PENDING_ATTEMPTS);
  assert.equal(op.nextRetryAt, null); // plus jamais rejouée
});

test('listQueuedOperations honore le tri FIFO et le LIMIT', async () => {
  const id1 = await enqueue({ operation: 'create_resource' });
  const id2 = await enqueue({ operation: 'create_resource' });
  const id3 = await enqueue({ operation: 'create_resource' });

  const first = await listQueuedOperations(2);
  assert.deepEqual(first.map((op) => op.id), [id1, id2]);

  const later = Date.now() + 60_000;
  await scheduleRetries([id2], later);
  const due = await listQueuedOperations(10);
  assert.deepEqual(due.map((op) => op.id), [id1, id3]); // id2 pas encore due
});

test('scheduleRetries ne change pas attempts (différent de markPendingOperation failed)', async () => {
  const id1 = await enqueue({ operation: 'create_resource' });
  await scheduleRetries([id1], Date.now() + 1);
  const [op] = await getPendingOperations();
  assert.equal(op.attempts, 0);
  assert.ok((op.nextRetryAt ?? 0) > 0);
});

test('refreshPermissions : delta après = max cachedAt du snapshot', async () => {
  const perms = [
    {
      resource_id: 'a'.repeat(32),
      resourceType: 'folder',
      effectiveAccess: 'owner',
      inherit: true,
      ownerId: 'u1',
      sharedById: null,
      expiresAt: null,
      cachedAt: 1000,
      updatedAt: 1000,
    },
    {
      resource_id: 'b'.repeat(32),
      resourceType: 'file',
      effectiveAccess: 'viewer',
      inherit: false,
      ownerId: 'u2',
      sharedById: 'u1',
      expiresAt: 5,
      cachedAt: 2000,
      updatedAt: 2000,
    },
  ];
  stubFetch((url) => (new URL(url).searchParams.get('after') === null ? ok(perms) : ok([])));

  const n1 = await refreshPermissions();
  assert.equal(n1, 2);
  assert.equal(pathOf(calls[0].url), '/api/v1/sync/permissions');
  assert.equal((await getResourcePermission('a'.repeat(32), 'folder'))?.effectiveAccess, 'owner');
  assert.equal((await getResourcePermission('b'.repeat(32), 'file'))?.expiresAt, 5);

  // 2e tick (snapshot vide) → after = max cachedAt du 1er
  const n2 = await refreshPermissions();
  assert.equal(n2, 0);
  assert.equal(pathOf(calls[1].url), '/api/v1/sync/permissions?after=2000');
});

test('refreshPermissions garde la référence dans le temps pour after', async () => {
  const first = {
    resource_id: 'c'.repeat(32),
    resourceType: 'folder',
    effectiveAccess: 'editor',
    inherit: true,
    ownerId: 'u1',
    sharedById: null,
    expiresAt: null,
    cachedAt: 42,
    updatedAt: 42,
  };
  const second = {
    resource_id: 'd'.repeat(32),
    resourceType: 'folder',
    effectiveAccess: 'viewer',
    inherit: false,
    ownerId: 'u3',
    sharedById: 'u1',
    expiresAt: null,
    cachedAt: 84,
    updatedAt: 84,
  };
  stubFetch((url) => {
    const after = new URL(url).searchParams.get('after');
    return ok(after === null ? [first] : [second]);
  });

  await refreshPermissions();
  await refreshPermissions();
  assert.equal((await getResourcePermission('d'.repeat(32), 'folder'))?.effectiveAccess, 'viewer');
  assert.equal(pathOf(calls[1].url), '/api/v1/sync/permissions?after=42');
});