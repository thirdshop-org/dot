import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { __setSafWalkForTests, listFoldersChunked } from '../services/safWalk';
import type { DirectoryEntry, Folder } from '../services/safDirectory.types';

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
  '/root': [dir('/root/a'), dir('/root/b'), dir('/root/c'), file('/root/f1')],
  '/root/a': [dir('/root/a/x'), file('/root/a/f2')],
  '/root/a/x': [],
  '/root/b': [file('/root/b/f3')],
  '/root/c': [],
};

const restoreFns: Array<() => void> = [];

afterEach(() => {
  while (restoreFns.length) restoreFns.pop()?.();
});

function fakeSaf() {
  return __setSafWalkForTests({
    list: (uri) => tree[uri] ?? [],
    info,
  });
}

test('listFoldersChunked : parcours récursif identique à listFolders', async () => {
  restoreFns.push(fakeSaf());
  const folders = await listFoldersChunked('/root', { recursive: true, includeRoot: true });
  assert.deepEqual(
    folders.map((f) => f.uri),
    ['/root', '/root/a', '/root/a/x', '/root/b', '/root/c'],
  );
});

test('listFoldersChunked : non-récursif ne remonte que les sous-dossiers immédiats', async () => {
  restoreFns.push(fakeSaf());
  const folders = await listFoldersChunked('/root');
  assert.deepEqual(
    folders.map((f) => f.uri),
    ['/root/a', '/root/b', '/root/c'],
  );
});

test('listFoldersChunked : includeRoot=false ne retourne pas la racine', async () => {
  restoreFns.push(fakeSaf());
  const folders = await listFoldersChunked('/root', { recursive: true });
  assert.deepEqual(
    folders.map((f) => f.uri),
    ['/root/a', '/root/a/x', '/root/b', '/root/c'],
  );
});

test('listFoldersChunked : cède au event loop (budget 0 → yield par dossier)', async () => {
  restoreFns.push(fakeSaf());
  let yields = 0;
  restoreFns.push(
    __setSafWalkForTests({
      yield: async () => {
        yields++;
      },
    }),
  );

  const folders = await listFoldersChunked('/root', { recursive: true }, 0);
  assert.deepEqual(
    folders.map((f) => f.uri),
    ['/root/a', '/root/a/x', '/root/b', '/root/c'],
  );
  assert.ok(yields >= 5, `expected at least one yield per folder, got ${yields}`);
});

test('listFoldersChunked : budget maximum → aucun yield, résultat inchangé', async () => {
  restoreFns.push(fakeSaf());
  let yields = 0;
  restoreFns.push(
    __setSafWalkForTests({
      yield: async () => {
        yields++;
      },
    }),
  );

  const folders = await listFoldersChunked('/root', { recursive: true }, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(
    folders.map((f) => f.uri),
    ['/root/a', '/root/a/x', '/root/b', '/root/c'],
  );
  assert.equal(yields, 0);
});

test('__setSafWalkForTests : la restauration rend l’implémentation d’origine', async () => {
  restoreFns.push(fakeSaf());
  const restore = __setSafWalkForTests({ list: () => [dir('/fake')] });
  restore();

  let listed = false;
  restoreFns.push(
    __setSafWalkForTests({
      list: (uri) => {
        listed = true;
        return tree[uri] ?? [];
      },
    }),
  );
  await listFoldersChunked('/root', { recursive: true });
  assert.equal(listed, true);
});