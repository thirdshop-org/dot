import { listDirectory, listFolders } from '../services/safDirectory';
import type { FileEntry } from '../services/safDirectory.types';
import {
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

export type SyncResult = {
  rootUri: string;
  folders: number;
  files: number;
  missing: number;
};

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

    const folders = listFolders(root.uri as string, { recursive: true, includeRoot: true }).sort(
      (a, b) => uriDepth(a.uri) - uriDepth(b.uri),
    );

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

    let files = 0;
    for (const folder of savedFolders) {
      if (!folder.uri) continue;
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
  return results;
}

export async function useSyncDevice(intervalMs = 30_000): Promise<void> {
  const preferences = await getUserPreferences();
  if (preferences.syncMode === 'none') return;

  while (true) {
    const results = await syncDevice();
    console.info('syncDevice', JSON.stringify(results));
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}