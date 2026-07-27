import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'vaultdrop-thumbnails' });

const BLOB_KEY = 'thumbnail_urls';
const STALE_MS = 50 * 60 * 1000;

interface ThumbnailCacheEntry {
  url: string;
  expiresAt: number;
}

let memoryCache: Record<string, ThumbnailCacheEntry> | null = null;

function loadCache(): Record<string, ThumbnailCacheEntry> {
  if (memoryCache) return memoryCache;
  const raw = storage.getString(BLOB_KEY);
  memoryCache = raw ? JSON.parse(raw) : {};
  return memoryCache!;
}

function saveCache(cache: Record<string, ThumbnailCacheEntry>) {
  memoryCache = cache;
  storage.set(BLOB_KEY, JSON.stringify(cache));
}

export const thumbnailCache = {
  get(fileId: string): string | null {
    const cache = loadCache();
    const entry = cache[fileId];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      delete cache[fileId];
      saveCache(cache);
      return null;
    }
    return entry.url;
  },

  set(fileId: string, url: string, expiresAt: number) {
    const cache = loadCache();
    cache[fileId] = { url, expiresAt };
    saveCache(cache);
  },

  setBatch(entries: Array<{ fileId: string; url: string; expiresAt: number }>) {
    if (entries.length === 0) return;
    const cache = loadCache();
    for (const e of entries) {
      cache[e.fileId] = { url: e.url, expiresAt: e.expiresAt };
    }
    saveCache(cache);
  },

  remove(fileId: string) {
    const cache = loadCache();
    delete cache[fileId];
    saveCache(cache);
  },

  clear() {
    memoryCache = {};
    storage.remove(BLOB_KEY);
  },
};
