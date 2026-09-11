import { listEntries, listFoldersChunked, yieldToMainThread } from '../services/safWalk';
import type { FileEntry } from '../services/safDirectory.types';
import {
  checkpointDatabase,
  getFiles,
  getFolder,
  getFolders,
  saveFile,
  saveFolder,
  getUserPreferences,
  withTransaction,
  type StoredFile,
  type StoredFolder,
} from '../services/db';
import type { SyncResult } from './syncDevice.types';
import { pushPendingOps, refreshPermissions } from './syncOutbox';

function uriDepth(uri: string): number {
  return uri.split('/').length;
}

function dirname(uri: string): string {
  return uri.slice(0, uri.lastIndexOf('/'));
}

function storedToEntry(stored: StoredFile): FileEntry {
  return {
    uri: stored.uri ?? '',
    name: stored.name,
    isDirectory: false,
    extension: stored.extension,
    exists: false,
    size: stored.size,
    type: stored.type,
    lastModified: stored.lastModified,
  };
}

function isChildOf(uri: string, rootUri: string): boolean {
  return uri === rootUri || uri.startsWith(rootUri + '/');
}

// Single-flight : toutes les marches SAF (`syncRoot` manuel et boucle de fond)
// sont sérialisées sur une chaîne module-level. Sans cela, deux `withTransaction`
// concurrents entrelacent leurs upserts et heurtent l'index partiel unique sur
// `uri` → `SQLITE_CONSTRAINT` → transaction annulée (FEEDBACK #8).
let chain: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const p = chain.then(work, work);
  chain = p.catch(() => {});
  return p;
}

async function doSyncRoot(root: StoredFolder): Promise<SyncResult> {
  const rootUri = root.uri;
  if (!rootUri) throw new Error(`root '${root.name}' has no physical uri`);

  // Phase 1 — listing SAF (I/O disque, HORS transaction) : la phase d'écriture
  // ne doit verrouiller la base que pour les writes SQL purs, pas pendant tout
  // le parcours (FEEDBACK #9 : l'UI lit la DB pendant un walk de plusieurs minutes).
  const folders = (
    await listFoldersChunked(rootUri, { recursive: true, includeRoot: true })
  ).sort((a, b) => uriDepth(a.uri) - uriDepth(b.uri));

  const fileEntries = new Map<string, FileEntry[]>();
  let lastYield = Date.now();
  for (const folder of folders) {
    if (!folder.uri) continue;
    if (Date.now() - lastYield >= 16) {
      lastYield = Date.now();
      await yieldToMainThread();
    }
    fileEntries.set(
      folder.uri,
      listEntries(folder.uri).filter((entry) => !entry.isDirectory),
    );
  }

  // Phase 2 — writes DB (transaction courte, SQL pur).
  return withTransaction(async () => {
    const seen = new Set<string>();
    const resourceIdByUri = new Map<string, string>();
    let files = 0;

    for (const folder of folders) {
      seen.add(folder.uri);
      const parentUri = dirname(folder.uri);
      const parentResourceId =
        folder.uri === rootUri ? null : (resourceIdByUri.get(parentUri) ?? root.resource_id);
      const saved = await saveFolder(
        { uri: folder.uri, name: folder.name, exists: folder.exists },
        { parentResourceId },
      );
      resourceIdByUri.set(folder.uri, saved.resource_id);
    }

    for (const folder of folders) {
      if (!folder.uri) continue;
      const entries = fileEntries.get(folder.uri) ?? [];
      for (const entry of entries) {
        seen.add(entry.uri);
        await saveFile(entry, resourceIdByUri.get(folder.uri)!);
        files++;
      }
    }

    let missing = 0;
    for (const folder of await getFolders()) {
      if (folder.uri && isChildOf(folder.uri, rootUri) && folder.exists && !seen.has(folder.uri)) {
        await saveFolder(
          { uri: folder.uri, name: folder.name, exists: false, resource_id: folder.resource_id },
          { syncStatus: folder.syncStatus },
        );
        missing++;
      }
    }
    for (const file of await getFiles()) {
      if (file.uri && isChildOf(file.uri, rootUri) && file.exists && !seen.has(file.uri)) {
        await saveFile(storedToEntry(file), file.folder_resource_id, {
          resource_id: file.resource_id,
          syncStatus: file.syncStatus,
        });
        missing++;
      }
    }

    return { rootUri, folders: folders.length, files, missing };
  });
}

export async function syncRoot(rootResourceId: string): Promise<SyncResult> {
  const root = await getFolder(rootResourceId);
  if (!root) throw new Error('unknown root folder');
  return enqueue(() => doSyncRoot(root));
}

export async function syncDevice(): Promise<SyncResult[]> {
  return enqueue(async () => {
    const roots = (await getFolders()).filter(
      (folder) => folder.parent_resource_id === null && folder.uri !== null,
    );
    const results: SyncResult[] = [];
    for (const root of roots) {
      results.push(await doSyncRoot(root));
    }
    await checkpointDatabase();
    return results;
  });
}

export function useSyncDevice(intervalMs = 30_000): () => void {
  let stopped = false;

  const tick = async () => {
    try {
      const preferences = await getUserPreferences();
      if (preferences.syncMode === 'none') return;

      const results = await syncDevice();
      console.info('syncDevice', JSON.stringify(results));
      // Puis pousser l'outbox (si un token est disponible) et rafraîchir le
      // cache des permissions (delta).
      const { pushed, retried } = await pushPendingOps();
      if (pushed > 0 || retried > 0) {
        console.info('pushPendingOps', JSON.stringify({ pushed, retried }));
      }
      const perms = await refreshPermissions();
      if (perms > 0) {
        console.info('refreshPermissions', perms);
      }
    } catch (error) {
      console.warn('syncDevice failed, retrying later', error);
    }
  };

  const loop = async () => {
    while (!stopped) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      if (stopped) return;
      await tick();
    }
  };

  // Premier cycle différé : laisser le boot et l'écran actif répondre avant
  // de lancer un walk SAF (potentiellement long) en arrière-plan.
  const first = setTimeout(() => {
    void loop();
  }, 2000);

  return () => {
    stopped = true;
    clearTimeout(first);
  };
}