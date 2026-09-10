import { listDirectory, listFoldersChunked, yieldToMainThread } from '../services/safDirectory';
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
  return uri.startsWith(rootUri);
}

export async function syncRoot(rootResourceId: string): Promise<SyncResult> {
  const root = await getFolder(rootResourceId);
  if (!root) throw new Error('unknown root folder');
  if (!root.uri) throw new Error(`root '${root.name}' has no physical uri`);

  return withTransaction(async () => {
    const seen = new Set<string>();

    const folders = (
      await listFoldersChunked(root.uri as string, { recursive: true, includeRoot: true })
    ).sort((a, b) => uriDepth(a.uri) - uriDepth(b.uri));

    const resourceIdByUri = new Map<string, string>();
    const savedFolders: StoredFolder[] = [];
    for (const folder of folders) {
      seen.add(folder.uri);
      const parentUri = dirname(folder.uri);
      const parentResourceId =
        folder.uri === root.uri ? null : (resourceIdByUri.get(parentUri) ?? root.resource_id);
      const saved = await saveFolder(
        { uri: folder.uri, name: folder.name, exists: folder.exists },
        { parentResourceId },
      );
      resourceIdByUri.set(folder.uri, saved.resource_id);
      savedFolders.push(saved);
    }

    let lastYield = Date.now();
    let files = 0;
    for (const folder of savedFolders) {
      if (!folder.uri) continue;
      if (Date.now() - lastYield >= 16) {
        lastYield = Date.now();
        await yieldToMainThread();
      }
      for (const entry of listDirectory(folder.uri)) {
        if (entry.isDirectory) continue;
        seen.add(entry.uri);
        await saveFile(entry, folder.resource_id);
        files++;
      }
    }

    let missing = 0;
    for (const folder of await getFolders()) {
      if (folder.uri && isChildOf(folder.uri, root.uri as string) && folder.exists && !seen.has(folder.uri)) {
        await saveFolder(
          { uri: folder.uri, name: folder.name, exists: false, resource_id: folder.resource_id },
          { syncStatus: folder.syncStatus },
        );
        missing++;
      }
    }
    for (const file of await getFiles()) {
      if (file.uri && isChildOf(file.uri, root.uri as string) && file.exists && !seen.has(file.uri)) {
        await saveFile(storedToEntry(file), file.folder_resource_id, {
          resource_id: file.resource_id,
          syncStatus: file.syncStatus,
        });
        missing++;
      }
    }

    return { rootUri: root.uri as string, folders: folders.length, files, missing };
  });
}

export async function syncDevice(): Promise<SyncResult[]> {
  const roots = (await getFolders()).filter(
    (folder) => folder.parent_resource_id === null && folder.uri !== null,
  );
  const results: SyncResult[] = [];
  for (const root of roots) {
    results.push(await syncRoot(root.resource_id));
  }
  await checkpointDatabase();
  return results;
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