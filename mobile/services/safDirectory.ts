import { createMMKV } from 'react-native-mmkv';

export type SyncMode = 'none' | 'manual' | 'auto';
export type SyncGlobalMode = 'off' | 'auto' | 'manual';
export type FolderSource = 'saf' | 'media-library' | 'recursive';

export type StoredFolder = {
  id: string;
  uri: string;
  name: string;
  visible: boolean;
  syncMode: SyncMode;
  syncCellular: boolean;
  source: FolderSource;
  albumId?: string;
  parentUri?: string;
};

const storage = createMMKV({ id: 'vaultdrop-saf' });

const FOLDERS_KEY = 'saf_folders';
const SYNC_GLOBAL_MODE_KEY = 'sync_global_mode';
const SYNC_GLOBAL_CELLULAR_KEY = 'sync_global_cellular';
const DISCOVERED_KEY = 'folders_discovered';

function generateId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getAllRaw(): StoredFolder[] {
  const raw = storage.getString(FOLDERS_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as StoredFolder[];
  let migrated = false;
  for (const f of parsed) {
    if (f.syncMode === undefined) {
      (f as any).syncMode = 'none';
      migrated = true;
    }
    if (f.syncCellular === undefined) {
      (f as any).syncCellular = false;
      migrated = true;
    }
    if (f.source === undefined) {
      (f as any).source = 'saf';
      migrated = true;
    }
  }
  if (migrated) saveAll(parsed);
  return parsed;
}

function saveAll(folders: StoredFolder[]) {
  storage.set(FOLDERS_KEY, JSON.stringify(folders));
}

export const safDirectory = {
  getAll(): StoredFolder[] {
    return getAllRaw();
  },

  getVisibleFolders(): StoredFolder[] {
    return getAllRaw().filter((f) => f.visible);
  },

  addFolder(uri: string, name: string): StoredFolder {
    const folders = getAllRaw();
    if (folders.some((f) => f.uri === uri)) {
      return folders.find((f) => f.uri === uri)!;
    }
    const folder: StoredFolder = { id: generateId(), uri, name, visible: true, syncMode: 'none', syncCellular: false, source: 'saf' };
    folders.push(folder);
    saveAll(folders);
    return folder;
  },

  addMediaFolder(albumId: string, name: string, uri: string): StoredFolder {
    const folders = getAllRaw();
    const key = `media://${albumId}`;
    if (folders.some((f) => f.uri === key)) {
      return folders.find((f) => f.uri === key)!;
    }
    const folder: StoredFolder = {
      id: generateId(),
      uri: key,
      name,
      visible: true,
      syncMode: 'none',
      syncCellular: false,
      source: 'media-library',
      albumId,
    };
    folders.push(folder);
    saveAll(folders);
    return folder;
  },

  addBatchFolders(folders: Array<{ uri: string; name: string; source?: FolderSource; parentUri?: string }>): StoredFolder[] {
    const current = getAllRaw();
    const added: StoredFolder[] = [];
    for (const f of folders) {
      if (current.some((existing) => existing.uri === f.uri)) continue;
      const folder: StoredFolder = {
        id: generateId(),
        uri: f.uri,
        name: f.name,
        visible: true,
        syncMode: 'none',
        syncCellular: false,
        source: f.source ?? 'recursive',
        parentUri: f.parentUri,
      };
      current.push(folder);
      added.push(folder);
    }
    saveAll(current);
    return added;
  },

  getDiscovered(): boolean {
    return storage.getString(DISCOVERED_KEY) === 'true';
  },

  setDiscovered() {
    storage.set(DISCOVERED_KEY, 'true');
  },

  resetDiscovered() {
    storage.remove(DISCOVERED_KEY);
  },

  removeFolder(id: string) {
    const folders = getAllRaw().filter((f) => f.id !== id);
    saveAll(folders);
  },

  toggleVisibility(id: string) {
    const folders = getAllRaw().map((f) =>
      f.id === id ? { ...f, visible: !f.visible } : f
    );
    saveAll(folders);
  },

  updateSyncMode(id: string, syncMode: SyncMode) {
    const folders = getAllRaw().map((f) =>
      f.id === id ? { ...f, syncMode } : f
    );
    saveAll(folders);
  },

  updateSyncCellular(id: string, syncCellular: boolean) {
    const folders = getAllRaw().map((f) =>
      f.id === id ? { ...f, syncCellular } : f
    );
    saveAll(folders);
  },

  getGlobalSyncMode(): SyncGlobalMode {
    const raw = storage.getString(SYNC_GLOBAL_MODE_KEY);
    if (raw === 'auto' || raw === 'manual') return raw;
    return 'off';
  },

  setGlobalSyncMode(mode: SyncGlobalMode) {
    storage.set(SYNC_GLOBAL_MODE_KEY, mode);
  },

  getGlobalSyncCellular(): boolean {
    return storage.getString(SYNC_GLOBAL_CELLULAR_KEY) === 'true';
  },

  setGlobalSyncCellular(enabled: boolean) {
    storage.set(SYNC_GLOBAL_CELLULAR_KEY, enabled ? 'true' : 'false');
  },

  clear() {
    storage.remove(FOLDERS_KEY);
  },
};
