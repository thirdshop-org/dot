import { createMMKV } from 'react-native-mmkv';
import { LocalFileEntry, SyncStatus } from '../types';

const storage = createMMKV({ id: 'vaultdrop-local-files' });

const BLOB_KEY = 'local_files_v2';
const LEGACY_INDEX_KEY = 'local_files_index';

interface RegistryBlob {
  entries: Record<string, LocalFileEntry>;
  backendIndex: Record<string, string>;
}

let memoryCache: RegistryBlob | null = null;

function loadBlob(): RegistryBlob {
  if (memoryCache) return memoryCache;

  const raw = storage.getString(BLOB_KEY);
  if (raw) {
    memoryCache = JSON.parse(raw) as RegistryBlob;
    return memoryCache;
  }

  memoryCache = migrateFromLegacy();
  saveBlob(memoryCache);
  return memoryCache;
}

function saveBlob(blob: RegistryBlob) {
  memoryCache = blob;
  storage.set(BLOB_KEY, JSON.stringify(blob));
}

function migrateFromLegacy(): RegistryBlob {
  const blob: RegistryBlob = { entries: {}, backendIndex: {} };

  const rawIndex = storage.getString(LEGACY_INDEX_KEY);
  if (!rawIndex) return blob;

  const ids: string[] = JSON.parse(rawIndex);
  for (const id of ids) {
    const raw = storage.getString(`local_file_${id}`);
    if (!raw) continue;
    const entry: LocalFileEntry = JSON.parse(raw);
    blob.entries[entry.id] = entry;
    if (entry.backendFileId) {
      blob.backendIndex[entry.backendFileId] = entry.id;
    }
  }

  storage.remove(LEGACY_INDEX_KEY);
  for (const id of ids) {
    storage.remove(`local_file_${id}`);
  }

  return blob;
}

export const localFileRegistry = {
  register(entry: LocalFileEntry) {
    const blob = loadBlob();
    blob.entries[entry.id] = entry;
    if (entry.backendFileId) {
      blob.backendIndex[entry.backendFileId] = entry.id;
    }
    saveBlob(blob);
  },

  registerBatch(entries: LocalFileEntry[]) {
    if (entries.length === 0) return;
    const blob = loadBlob();
    for (const entry of entries) {
      blob.entries[entry.id] = entry;
      if (entry.backendFileId) {
        blob.backendIndex[entry.backendFileId] = entry.id;
      }
    }
    saveBlob(blob);
  },

  get(id: string): LocalFileEntry | undefined {
    return loadBlob().entries[id];
  },

  getByBackendId(backendId: string): LocalFileEntry | undefined {
    const blob = loadBlob();
    const entryId = blob.backendIndex[backendId];
    if (!entryId) return undefined;
    return blob.entries[entryId];
  },

  getAll(): LocalFileEntry[] {
    const blob = loadBlob();
    return Object.values(blob.entries);
  },

  update(id: string, updates: Partial<LocalFileEntry>) {
    const blob = loadBlob();
    const existing = blob.entries[id];
    if (!existing) return;

    if (existing.backendFileId && updates.backendFileId === undefined && updates.syncStatus === 'cloud') {
      delete blob.backendIndex[existing.backendFileId];
    }

    const updated = { ...existing, ...updates };
    blob.entries[id] = updated;
    if (updated.backendFileId) {
      blob.backendIndex[updated.backendFileId] = id;
    }
    saveBlob(blob);
  },

  updateSyncStatus(id: string, syncStatus: SyncStatus) {
    this.update(id, { syncStatus });
  },

  markAsCloudOnly(id: string) {
    this.update(id, { syncStatus: 'cloud', localUri: '' });
  },

  remove(id: string) {
    const blob = loadBlob();
    const entry = blob.entries[id];
    if (entry?.backendFileId) {
      delete blob.backendIndex[entry.backendFileId];
    }
    delete blob.entries[id];
    saveBlob(blob);
  },

  removeByBackendId(backendId: string) {
    const blob = loadBlob();
    const entryId = blob.backendIndex[backendId];
    if (entryId) {
      delete blob.entries[entryId];
      delete blob.backendIndex[backendId];
      saveBlob(blob);
    }
  },

  count(): number {
    return Object.keys(loadBlob().entries).length;
  },
};
