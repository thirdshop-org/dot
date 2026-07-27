import { createMMKV } from 'react-native-mmkv';

export type SyncMode = 'none' | 'manual' | 'auto';

export type StoredFolder = {
  id: string;
  uri: string;
  name: string;
  visible: boolean;
  syncMode: SyncMode;
  syncCellular: boolean;
};

const storage = createMMKV({ id: 'vaultdrop-saf' });

const FOLDERS_KEY = 'saf_folders';

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
    const folder: StoredFolder = { id: generateId(), uri, name, visible: true, syncMode: 'none', syncCellular: false };
    folders.push(folder);
    saveAll(folders);
    return folder;
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

  clear() {
    storage.remove(FOLDERS_KEY);
  },
};
