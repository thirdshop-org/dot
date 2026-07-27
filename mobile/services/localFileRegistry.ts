import { createMMKV } from 'react-native-mmkv';
import { LocalFileEntry, SyncStatus } from '../types';

const storage = createMMKV({ id: 'vaultdrop-local-files' });

const INDEX_KEY = 'local_files_index';

function getAllIds(): string[] {
  const raw = storage.getString(INDEX_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as string[];
}

function setAllIds(ids: string[]) {
  storage.set(INDEX_KEY, JSON.stringify(ids));
}

function entryKey(id: string): string {
  return `local_file_${id}`;
}

export const localFileRegistry = {
  register(entry: LocalFileEntry) {
    storage.set(entryKey(entry.id), JSON.stringify(entry));
    const ids = getAllIds();
    if (!ids.includes(entry.id)) {
      setAllIds([entry.id, ...ids]);
    }
  },

  get(id: string): LocalFileEntry | undefined {
    const raw = storage.getString(entryKey(id));
    if (!raw) return undefined;
    return JSON.parse(raw) as LocalFileEntry;
  },

  getByBackendId(backendId: string): LocalFileEntry | undefined {
    const ids = getAllIds();
    for (const id of ids) {
      const entry = this.get(id);
      if (entry?.backendFileId === backendId) return entry;
    }
    return undefined;
  },

  getAll(): LocalFileEntry[] {
    const ids = getAllIds();
    return ids
      .map((id) => this.get(id))
      .filter((e): e is LocalFileEntry => e !== undefined);
  },

  update(id: string, updates: Partial<LocalFileEntry>) {
    const existing = this.get(id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    storage.set(entryKey(id), JSON.stringify(updated));
  },

  updateSyncStatus(id: string, syncStatus: SyncStatus) {
    this.update(id, { syncStatus });
  },

  markAsCloudOnly(id: string) {
    this.update(id, { syncStatus: 'cloud', localUri: '' });
  },

  remove(id: string) {
    storage.remove(entryKey(id));
    const ids = getAllIds().filter((i) => i !== id);
    setAllIds(ids);
  },

  removeByBackendId(backendId: string) {
    const entry = this.getByBackendId(backendId);
    if (entry) this.remove(entry.id);
  },

  count(): number {
    return getAllIds().length;
  },
};
