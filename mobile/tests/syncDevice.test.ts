import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { MIGRATIONS, type MigrationDb } from '../services/db/migrations';
import type { DbSession } from '../services/db/session';
import { __setDbForTests } from '../services/db/session';
import { __setWithTransactionForTests } from '../services/db/client';
import { __setSafWalkForTests } from '../services/safWalk';
import type { DirectoryEntry, Folder } from '../services/safDirectory.types';
import { syncRoot, syncDevice } from '../features/syncDevice';
import { saveFolder, getFolders, getFolderFolders, getFiles } from '../services/db';

type Harness = MigrationDb & DbSession;

let h: Harness;
let restoreFns: Array<() => void> = [];

function dir(uri: string): Folder {
  return { uri, name: uri.split('/').pop() ?? uri, isDirectory: true, exists: true };
}

function file(uri: string): DirectoryEntry {
  return {
    uri,
    name: uri.split('/').pop() ?? uri,
    isDirectory: false,
    extension: '',
    exists: true,
    size: 1,
    type: 'text/plain',
    lastModified: 0,
  };
}

function info(uri: string): { uri: string; name: string; exists: boolean } {
  return { uri, name: uri.split('/').pop() ?? uri, exists: true };
}

const tree: Record<string, DirectoryEntry[]> = {
  '/root': [dir('/root/a'), dir('/root/b'), file('/root/f1.txt')],
  '/root/a': [dir('/root/a/x'), file('/root/a/f2.txt')],
  '/root/a/x': [],
  '/root/b': [file('/root/b/f3.txt')],
  '/rootA': [dir('/rootA/sub')],
  '/rootA/sub': [],
  '/rootB': [file('/rootB/fB.txt')],
};

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

function fakeSaf(): () => void {
  return __setSafWalkForTests({
    list: (uri) => tree[uri] ?? [],
    info,
  });
}

async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start >= timeoutMs) throw new Error('waitUntil: timeout');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

beforeEach(async () => {
  h = createHarness();
  for (const migration of MIGRATIONS) {
    await migration.up(h);
  }
  __setDbForTests(h);
  __setWithTransactionForTests(async (work) => work({} as never));
  restoreFns.push(fakeSaf());
});

afterEach(() => {
  __setDbForTests(null);
  __setWithTransactionForTests(null);
  while (restoreFns.length) restoreFns.pop()?.();
});

test('walk complet : comptes folders/files/missing, parent_resource_id cohérent, exists=1', async () => {
  const root = await saveFolder({ uri: '/root', name: 'Root' });

  const result = await syncRoot(root.resource_id);

  assert.deepEqual(result, { rootUri: '/root', folders: 4, files: 3, missing: 0 });

  const stored = await getFiles();
  assert.equal(stored.length, 3);
  for (const f of stored) {
    assert.equal(f.exists, true);
  }

  const subs = await getFolderFolders(root.resource_id);
  assert.equal(subs.length, 2);
  const a = subs.find((f) => f.name === 'a')!;
  assert.equal(a.parent_resource_id, root.resource_id);
  assert.equal(a.exists, true);

  const deep = await getFolderFolders(a.resource_id);
  assert.equal(deep.length, 1);
  assert.equal(deep[0].name, 'x');
  assert.equal(deep[0].parent_resource_id, a.resource_id);
  assert.equal(deep[0].exists, true);
});

test('single-flight : un second walk n’est pas lancé tant que le premier est en cours', async () => {
  const rootA = await saveFolder({ uri: '/rootA', name: 'RootA' });
  const rootB = await saveFolder({ uri: '/rootB', name: 'RootB' });

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let enteredYield = false;
  let listingsB = 0;

  restoreFns.push(
    __setSafWalkForTests({
      list: (uri) => {
        if (uri.startsWith('/rootA') && !enteredYield) {
          // Prolonge le walk de A pour dépasser le budget de 16ms et atteindre
          // son premier `yield` (qui bloque sur la gate) — sinon A se termine
          // trop vite et la sérialisation ne peut pas être observée.
          const until = Date.now() + 20;
          while (Date.now() < until) {}
        }
        if (uri.startsWith('/rootB')) listingsB++;
        return tree[uri] ?? [];
      },
      yield: async () => {
        enteredYield = true;
        await gate;
      },
      info,
    }),
  );

  const pA = syncRoot(rootA.resource_id);
  await waitUntil(() => enteredYield);

  const pB = syncRoot(rootB.resource_id);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(listingsB, 0, 'pB doit attendre la fin de pA (sérialisation des walks)');

  release();
  const [rA, rB] = await Promise.all([pA, pB]);

  assert.equal(rA.folders, 2);
  assert.equal(rB.folders, 1);
  assert.ok(listingsB > 0, 'pB doit avoir walké après la libération');
});

test('toute la phase de listing SAF précède la moindre écriture DB', async () => {
  const root = await saveFolder({ uri: '/root', name: 'Root' });

  let txStarted = false;
  __setWithTransactionForTests(async (work) => {
    txStarted = true;
    return work({} as never);
  });

  let listCount = 0;
  restoreFns.push(
    __setSafWalkForTests({
      list: (uri) => {
        assert.equal(txStarted, false, `écriture DB pendant le listing SAF (liste ${uri})`);
        listCount++;
        return tree[uri] ?? [];
      },
      info,
    }),
  );

  const result = await syncRoot(root.resource_id);

  assert.ok(listCount >= 4, `listing complet attendu, obtenu ${listCount}`);
  assert.equal(result.folders, 4);
  assert.equal(result.files, 3);
});

test('walk répété : idempotent, pas de doublon ni SQLITE_CONSTRAINT', async () => {
  const root = await saveFolder({ uri: '/root', name: 'Root' });
  await syncRoot(root.resource_id);

  const foldersBefore = new Map((await getFolders()).map((f) => [f.uri, f.resource_id]));
  const filesUriBefore = new Set((await getFiles()).map((f) => f.uri));

  await syncRoot(root.resource_id);

  const foldersAfter = await getFolders();
  assert.equal(foldersAfter.length, foldersBefore.size);
  for (const f of foldersAfter) {
    assert.equal(foldersBefore.get(f.uri), f.resource_id, `resource_id stable pour ${f.uri}`);
  }

  const filesAfter = await getFiles();
  assert.equal(filesAfter.length, filesUriBefore.size);
  for (const f of filesAfter) {
    assert.ok(filesUriBefore.has(f.uri));
    assert.equal(f.exists, true);
  }
});

test('réconciliation : un fichier retiré du SAF passe à exists=0 et compte en missing', async () => {
  const root = await saveFolder({ uri: '/root', name: 'Root' });
  await syncRoot(root.resource_id);
  assert.equal((await getFiles()).length, 3);

  restoreFns.push(
    __setSafWalkForTests({
      list: (uri) =>
        uri === '/root'
          ? (tree['/root'] ?? []).filter((e) => e.uri !== '/root/f1.txt')
          : (tree[uri] ?? []),
      info,
    }),
  );

  const result = await syncRoot(root.resource_id);

  assert.equal(result.missing, 1);
  const f1 = (await getFiles()).find((f) => f.uri === '/root/f1.txt')!;
  assert.equal(f1.exists, false);
  const remaining = (await getFiles()).filter((f) => f.exists);
  assert.equal(remaining.length, 2);
});

test('syncDevice marche toutes les roots présentes', async () => {
  const rootA = await saveFolder({ uri: '/rootA', name: 'RootA' });
  await saveFolder({ uri: '/rootB', name: 'RootB' });
  assert.equal(rootA.parent_resource_id, null);

  const results = await syncDevice();

  assert.equal(results.length, 2);
  const byRoot = new Map(results.map((r) => [r.rootUri, r]));
  assert.deepEqual(byRoot.get('/rootA'), {
    rootUri: '/rootA',
    folders: 2,
    files: 0,
    missing: 0,
  });
  assert.deepEqual(byRoot.get('/rootB'), {
    rootUri: '/rootB',
    folders: 1,
    files: 1,
    missing: 0,
  });
});