// Smoke test live contre un backend démarré (POSTGRES + serveur Go) :
//   docker compose up postgres -d   (racine repo)
//   cd backend && go run cmd/server/main.go
//   cd mobile && npm run test:e2e
//
// NON agrégé dans `npm test` (il exige un backend fonctionnel). Si le serveur
// est injoignable, les tests sont marqués skipped, pas échoués.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { MIGRATIONS, type MigrationDb } from '../services/db/migrations';
import type { DbSession } from '../services/db/session';
import { __setDbForTests } from '../services/db/session';
import { api, setAuthToken } from '../api/client';
import {
  clearActiveUserId,
  enqueuePendingOperation,
  getPendingOperations,
  setActiveUserId,
} from '../services/db';
import { pushPendingOps, refreshPermissions, resetPermissionCachedAtForTests } from '../features/syncOutbox';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1';
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin';

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

let deviceId: string;

function newDeviceId(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function isBackendUp(): boolean {
  return !!process.env.CI_E2E_REQUIRE_BACKEND;
}

beforeEach(async () => {
  h = createHarness();
  for (const migration of MIGRATIONS) {
    await migration.up(h);
  }
  __setDbForTests(h);
  resetPermissionCachedAtForTests();
});

afterEach(() => {
  __setDbForTests(null);
  setAuthToken(null);
  clearActiveUserId();
});

test('bout en bout : register + login admin → push outbox → snapshot → relecture serveur', async (t) => {
  try {
    await api.health();
  } catch (error) {
    if (!isBackendUp()) {
      t.skip(`backend injoignable sur ${BASE_URL} — lancer serveur + postgres`);
      return;
    }
    throw error;
  }

  // Enregistrement du device (idempotent) puis login = SEULE porte de token.
  deviceId = newDeviceId();
  await api.registerDevice(deviceId);
  const login = await api.login(ADMIN_USERNAME, ADMIN_PASSWORD, deviceId);
  setAuthToken(login.data.token);
  await setActiveUserId(login.data.user.id);
  assert.equal(login.data.user.is_admin, true, 'l’admin E2E doit exister (ADMIN_*)');

  // 1. Enqueue un CREATE_RESOURCE puis push (scopé au compte connecté)
  const name = `e2e-${deviceId.slice(0, 8)}`;
  const resourceId = newDeviceId();
  const opId = await enqueuePendingOperation({
    resourceId,
    resourceType: 'folder',
    refType: 'resource',
    refId: null,
    operation: 'create_resource',
    payload: { name },
  });
  const push = await pushPendingOps();
  assert.deepEqual(push, { pushed: 1, retried: 0 });

  const local = await getPendingOperations();
  const done = local.find((op) => op.id === opId);
  assert.equal(done?.status, 'completed');
  assert.equal(done?.attempts, 0);

  // 2. Relecture côté serveur : le dossier racine créé est visible
  const folders = await api.listFolders();
  assert.ok(folders.data.some((f) => f.name === name), 'dossier absent côté serveur');

  // 3. Snapshot des permissions → persisté localement
  const snapshotCount = await refreshPermissions();
  assert.ok(snapshotCount < 10_000, `snapshot trop volumineux (${snapshotCount})`);
});