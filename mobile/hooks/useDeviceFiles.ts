import { useState, useEffect, useCallback } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { safDirectory, type StoredFolder } from '../services/safDirectory';
import { downloadRegistry } from '../services/downloadRegistry';
import { useFileWatcher } from './useFileWatcher';
import { FileDetectedEvent } from '../modules/expo-download-detect';

export interface DeviceFile {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  folderId?: string;
}

function guessMimeType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return map[ext] ?? 'application/octet-stream';
}

function eventToDeviceFile(event: FileDetectedEvent): DeviceFile {
  return {
    id: event.id,
    uri: event.uri,
    name: event.name,
    mimeType: event.mimeType,
    size: event.size,
    createdAt: new Date(event.createdAt).toISOString(),
  };
}

const SKIP_SUBDIRS = new Set([
  'Android', 'android', 'data', 'obb', 'cache',
  '.thumbnails', '.Trash', 'lost+found',
  'LOST.DIR', 'System Volume Information',
  'com.android', '.cache', 'tmp', '.tmp',
]);

function shouldSkipDir(name: string): boolean {
  if (name.startsWith('.')) return true;
  return SKIP_SUBDIRS.has(name);
}

async function scanSafFolder(folder: StoredFolder): Promise<DeviceFile[]> {
  try {
    const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(folder.uri);
    const files: DeviceFile[] = [];
    for (const entryUri of entries) {
      const parts = entryUri.split('/');
      const name = decodeURIComponent(parts[parts.length - 1]);
      if (name.startsWith('.')) continue;
      files.push({
        id: `saf_${folder.id}_${entryUri}`,
        uri: entryUri,
        name,
        mimeType: guessMimeType(name),
        size: 0,
        createdAt: new Date().toISOString(),
        folderId: folder.id,
      });
    }
    return files;
    } catch (err) {
      return [];
    }
}

export async function scanSubdirectories(
  baseUri: string,
  depth: number = 0,
  maxDepth: number = 3,
  discovered: Array<{ uri: string; name: string; parentUri: string }> = []
): Promise<Array<{ uri: string; name: string; parentUri: string }>> {
  if (depth >= maxDepth || discovered.length >= 300) return discovered;

  try {
    const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(baseUri);
    for (const entryUri of entries) {
      const parts = entryUri.split('/');
      const name = decodeURIComponent(parts[parts.length - 1]);
      if (shouldSkipDir(name)) continue;

      try {
        await FileSystem.StorageAccessFramework.readDirectoryAsync(entryUri);
        discovered.push({ uri: entryUri, name, parentUri: baseUri });
        await scanSubdirectories(entryUri, depth + 1, maxDepth, discovered);
      } catch {}
    }
  } catch {}

  return discovered;
}

export function useDeviceFiles() {
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [folders, setFolders] = useState<StoredFolder[]>(() => safDirectory.getAll());
  const [discovered, setDiscovered] = useState(() => safDirectory.getDiscovered());
  const { newFiles, clearNewFiles } = useFileWatcher();

  const scanVisibleFolders = useCallback(async () => {
    const visibleFolders = safDirectory.getVisibleFolders().filter((f) => f.source !== 'media-library');
    if (visibleFolders.length === 0) return;

    const results = await Promise.all(visibleFolders.map((folder) => scanSafFolder(folder)));
    const safFiles = results.flat();

    setFiles((prev) => {
      const existing = new Set(prev.filter((f) => !f.folderId).map((f) => f.id));
      const mediaOnly = prev.filter((f) => !f.folderId);
      const merged = [...mediaOnly];
      for (const f of safFiles) {
        if (!existing.has(f.id)) merged.push(f);
      }
      return merged;
    });
  }, []);

  const loadRegistryFiles = useCallback(() => {
    const registryEntries = downloadRegistry.getAll();
    const registryFiles: DeviceFile[] = registryEntries.map((entry) => ({
      id: entry.id,
      uri: entry.uri,
      name: entry.name,
      mimeType: entry.mimeType,
      size: entry.size,
      createdAt: new Date(entry.createdAt).toISOString(),
    }));

    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.id));
      const merged = [...prev];
      for (const f of registryFiles) {
        if (!existing.has(f.id)) merged.push(f);
      }
      return merged;
    });
  }, []);

  const pickAndScanRecursive = useCallback(async (): Promise<{ addedFolders: number }> => {
    try {
      const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!result.granted) return { addedFolders: 0 };

      const dirUri = result.directoryUri;
      const parts = dirUri.split('/');
      const dirName = decodeURIComponent(parts[parts.length - 1] ?? 'Dossier');

      safDirectory.addFolder(dirUri, dirName);

      const subdirs = await scanSubdirectories(dirUri);
      if (subdirs.length > 0) {
        safDirectory.addBatchFolders(
          subdirs.map((d) => ({ uri: d.uri, name: d.name, source: 'recursive', parentUri: d.parentUri }))
        );
      }

      setFolders(safDirectory.getAll());

      if (!discovered) {
        safDirectory.setDiscovered();
        setDiscovered(true);
      }

      await scanVisibleFolders();

      return { addedFolders: 1 + subdirs.length };
    } catch (err) {
      return { addedFolders: 0 };
    }
  }, [discovered, scanVisibleFolders]);

  const refreshFolders = useCallback(() => {
    setFolders(safDirectory.getAll());
  }, []);

  const rescan = useCallback(async () => {
    setIsLoading(true);
    try {
      await scanVisibleFolders();
      loadRegistryFiles();
    } finally {
      setIsLoading(false);
    }
  }, [scanVisibleFolders, loadRegistryFiles]);

  // Handle new files detected by native module
  useEffect(() => {
    if (newFiles.length === 0) return;

    downloadRegistry.addBatch(newFiles);

    const newDeviceFiles = newFiles.map(eventToDeviceFile);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.id));
      const merged = [...prev];
      for (const f of newDeviceFiles) {
        if (!existing.has(f.id)) merged.push(f);
      }
      return merged;
    });

    clearNewFiles();
  }, [newFiles, clearNewFiles]);

  // Initial load
  useEffect(() => {
    scanVisibleFolders();
    loadRegistryFiles();
  }, [scanVisibleFolders, loadRegistryFiles]);

  return {
    files, isLoading,
    rescan,
    pickAndScanRecursive,
    folders, refreshFolders,
    discovered,
  };
}

