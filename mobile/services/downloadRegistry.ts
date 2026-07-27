import { createMMKV } from 'react-native-mmkv';
import { FileDetectedEvent } from '../modules/expo-download-detect';

const storage = createMMKV({ id: 'vaultdrop-download-registry' });

const FILES_KEY = 'detected_files';

export type DownloadRegistryEntry = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  source: string;
  detectedAt: number;
};

function getAllRaw(): DownloadRegistryEntry[] {
  const raw = storage.getString(FILES_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as DownloadRegistryEntry[];
}

function saveAll(entries: DownloadRegistryEntry[]) {
  storage.set(FILES_KEY, JSON.stringify(entries));
}

export const downloadRegistry = {
  getAll(): DownloadRegistryEntry[] {
    return getAllRaw();
  },

  getById(id: string): DownloadRegistryEntry | undefined {
    return getAllRaw().find((e) => e.id === id);
  },

  add(event: FileDetectedEvent): DownloadRegistryEntry | null {
    const entries = getAllRaw();
    if (entries.some((e) => e.id === event.id)) return null;

    const entry: DownloadRegistryEntry = {
      id: event.id,
      uri: event.uri,
      name: event.name,
      mimeType: event.mimeType,
      size: event.size,
      createdAt: event.createdAt,
      source: event.source,
      detectedAt: Date.now(),
    };

    entries.push(entry);
    saveAll(entries);
    return entry;
  },

  addBatch(events: FileDetectedEvent[]): DownloadRegistryEntry[] {
    const entries = getAllRaw();
    const existingIds = new Set(entries.map((e) => e.id));
    const newEntries: DownloadRegistryEntry[] = [];

    for (const event of events) {
      if (existingIds.has(event.id)) continue;
      const entry: DownloadRegistryEntry = {
        id: event.id,
        uri: event.uri,
        name: event.name,
        mimeType: event.mimeType,
        size: event.size,
        createdAt: event.createdAt,
        source: event.source,
        detectedAt: Date.now(),
      };
      newEntries.push(entry);
      existingIds.add(event.id);
    }

    if (newEntries.length > 0) {
      saveAll([...entries, ...newEntries]);
    }

    return newEntries;
  },

  remove(id: string) {
    const entries = getAllRaw().filter((e) => e.id !== id);
    saveAll(entries);
  },

  clear() {
    storage.remove(FILES_KEY);
  },

  count(): number {
    return getAllRaw().length;
  },
};
