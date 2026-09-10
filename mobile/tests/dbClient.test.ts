import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBrokenConnectionError,
  withDatabaseRetry,
  type DatabaseRetryDeps,
} from '../services/db/client';
import type { SQLiteDatabase } from 'expo-sqlite';

function brokenConnectionError(): Error {
  return new Error(
    "Call to function 'NativeDatabase.prepareAsync' has been rejected.\n→ Caused by: java.lang.NullPointerException: java.lang.NullPointerException",
  );
}

test('isBrokenConnectionError recognizes the expo-sqlite Android NPE signature', () => {
  assert.equal(isBrokenConnectionError(brokenConnectionError()), true);
  assert.equal(
    isBrokenConnectionError(
      new Error(
        "Call to function 'NativeDatabase.execAsync' has been rejected.\n→ Caused by: java.lang.NullPointerException: java.lang.NullPointerException",
      ),
    ),
    true,
  );
});

test('isBrokenConnectionError ignores regular and non-Error values', () => {
  assert.equal(isBrokenConnectionError(new Error('disk I/O error')), false);
  assert.equal(isBrokenConnectionError(null), false);
  assert.equal(isBrokenConnectionError('NativeDatabase.prepareAsync'), false);
});

test('withDatabaseRetry reconnects once on a dead connection and retries', async () => {
  let current: SQLiteDatabase = {
    runAsync: async () => {
      throw brokenConnectionError();
    },
  } as unknown as SQLiteDatabase;
  let getCalls = 0;
  let recoverCalls = 0;

  const deps: DatabaseRetryDeps = {
    get: async () => {
      getCalls++;
      return current;
    },
    recover: async () => {
      recoverCalls++;
      current = {
        runAsync: async () => 42 as never,
      } as unknown as SQLiteDatabase;
      return current;
    },
  };

  const result = await withDatabaseRetry(async (db) => db.runAsync('SELECT 1'), deps);
  assert.equal(result, 42);
  assert.equal(recoverCalls, 1);
  assert.equal(getCalls, 1);
});

test('withDatabaseRetry recovers when the open itself rejects with the NPE signature', async () => {
  let recoverCalls = 0;
  const deps: DatabaseRetryDeps = {
    get: async () => {
      throw brokenConnectionError();
    },
    recover: async () => {
      recoverCalls++;
      return {
        runAsync: async () => 42 as never,
      } as unknown as SQLiteDatabase;
    },
  };

  const result = await withDatabaseRetry(async (db) => db.runAsync('SELECT 1'), deps);
  assert.equal(result, 42);
  assert.equal(recoverCalls, 1);
});

test('withDatabaseRetry does not recover on a regular database error', async () => {
  let recoverCalls = 0;
  const deps: DatabaseRetryDeps = {
    get: async () =>
      ({
        runAsync: async () => {
          throw new Error('disk I/O error');
        },
      }) as unknown as SQLiteDatabase,
    recover: async () => {
      recoverCalls++;
      return {} as SQLiteDatabase;
    },
  };

  await assert.rejects(() => withDatabaseRetry(async (db) => db.runAsync('SELECT 1'), deps), {
    message: 'disk I/O error',
  });
  assert.equal(recoverCalls, 0);
});

test('withDatabaseRetry converges on a broken retry (recovery does not loop forever)', async () => {
  const deps: DatabaseRetryDeps = {
    get: async () => ({} as SQLiteDatabase),
    recover: async () => ({} as SQLiteDatabase),
  };

  await assert.rejects(
    () =>
      withDatabaseRetry(async () => {
        throw brokenConnectionError();
      }, deps),
    (error: unknown) =>
      error instanceof Error && isBrokenConnectionError(error),
  );
});