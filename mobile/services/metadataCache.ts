import { createMMKV } from 'react-native-mmkv';
import { FileItem } from '../types';

const storage = createMMKV({ id: 'vaultdrop-metadata' });

const FILES_KEY = 'backend_files_cache';
const UPDATED_AT_KEY = 'cache_updated_at';
const STALE_MS = 5 * 60 * 1000;

interface CachedFiles {
  files: FileItem[];
  page: number;
  total: number;
}

export const metadataCache = {
  getFiles(): CachedFiles | null {
    const raw = storage.getString(FILES_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CachedFiles;
    } catch {
      return null;
    }
  },

  setFiles(files: FileItem[], page: number, total: number) {
    const data: CachedFiles = { files, page, total };
    storage.set(FILES_KEY, JSON.stringify(data));
    storage.set(UPDATED_AT_KEY, Date.now());
  },

  isStale(): boolean {
    const raw = storage.getString(UPDATED_AT_KEY);
    if (!raw) return true;
    const updatedAt = Number(raw);
    return Date.now() - updatedAt > STALE_MS;
  },

  clear() {
    storage.remove(FILES_KEY);
    storage.remove(UPDATED_AT_KEY);
  },
};
