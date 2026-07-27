import { createMMKV } from 'react-native-mmkv';

export type StoredFolder = {
  id: string;
  uri: string;
  name: string;
  visible: boolean;
};

const storage = createMMKV({ id: 'vaultdrop-saf' });

const FOLDERS_KEY = 'saf_folders';

function generateId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getAllRaw(): StoredFolder[] {
  const raw = storage.getString(FOLDERS_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as StoredFolder[];
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
    const folder: StoredFolder = { id: generateId(), uri, name, visible: true };
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

  clear() {
    storage.remove(FOLDERS_KEY);
  },
};
