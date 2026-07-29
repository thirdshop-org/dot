import { useState, useEffect, useCallback } from 'react';
import * as MediaLibrary from 'expo-media-library/legacy';
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

async function scanMediaAlbum(folder: StoredFolder): Promise<DeviceFile[]> {
  try {
    if (!folder.albumId) return [];
    const result = await MediaLibrary.getAssetsAsync({
      album: folder.albumId,
      first: 500,
      sortBy: 'creationTime',
    });
    return result.assets.map((asset) => ({
      id: `media_${folder.id}_${asset.id}`,
      uri: asset.uri,
      name: asset.filename,
      mimeType: asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
      size: 0,
      createdAt: asset.creationTime
        ? new Date(asset.creationTime).toISOString()
        : new Date().toISOString(),
      folderId: folder.id,
    }));
  } catch (err) {
    return [];
  }
}

async function scanSubdirectories(
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
  const [hasPermission, setHasPermission] = useState(false);
  const [folders, setFolders] = useState<StoredFolder[]>(() => safDirectory.getAll());
  const [discovered, setDiscovered] = useState(() => safDirectory.getDiscovered());
  const { newFiles, clearNewFiles } = useFileWatcher();

  const requestPermission = useCallback(async () => {
    const req = await MediaLibrary.requestPermissionsAsync();
    if (req.granted) {
      setHasPermission(true);
      return true;
    }
    const check = await MediaLibrary.getPermissionsAsync();
    const granted = check.granted;
    setHasPermission(granted);
    return granted;
  }, []);

  const loadAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        first: 500,
        mediaType: ['photo', 'video'],
        sortBy: 'creationTime',
      });

      const deviceFiles: DeviceFile[] = result.assets.map((asset) => ({
        id: asset.id,
        uri: asset.uri,
        name: asset.filename,
        mimeType: asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
        size: 0,
        createdAt: asset.creationTime
          ? new Date(asset.creationTime).toISOString()
          : new Date().toISOString(),
      }));

      setFiles(deviceFiles);
    } catch (err) {
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const discoverMediaAlbums = useCallback(async (): Promise<number> => {
    try {
      const albums = await MediaLibrary.getAlbumsAsync();
      let added = 0;
      for (const album of albums) {
        if (album.title && album.assetCount > 0) {
          safDirectory.addMediaFolder(album.id, album.title, '');
          added++;
        }
      }
      if (added > 0) {
        setFolders(safDirectory.getAll());
      }
      return added;
    } catch (err) {
      return 0;
    }
  }, []);

  const scanVisibleFolders = useCallback(async () => {
    const visibleFolders = safDirectory.getVisibleFolders();
    if (visibleFolders.length === 0) return;

    const results = await Promise.all(
      visibleFolders.map((folder) => {
        if (folder.source === 'media-library') return scanMediaAlbum(folder);
        return scanSafFolder(folder);
      })
    );
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

  const pickDirectory = useCallback(async () => {
    try {
      const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!result.granted) return false;
      const dirUri = result.directoryUri;
      const parts = dirUri.split('/');
      const dirName = decodeURIComponent(parts[parts.length - 1] ?? 'Dossier');
      safDirectory.addFolder(dirUri, dirName);
      setFolders(safDirectory.getAll());

      const folderFiles = await scanSafFolder({ id: 'new', uri: dirUri, name: dirName, visible: true, syncMode: 'none', syncCellular: false, source: 'saf' });
      setFiles((prev) => {
        const existing = new Set(prev.map((f) => f.id));
        const merged = [...prev];
        for (const f of folderFiles) {
          if (!existing.has(f.id)) merged.push(f);
        }
        return merged;
      });
      return true;
    } catch (err) {
      return false;
    }
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

  const runInitialDiscovery = useCallback(async () => {
    if (safDirectory.getDiscovered()) return;

    const granted = hasPermission || await requestPermission();
    if (granted) {
      const mediaCount = await discoverMediaAlbums();
      if (mediaCount > 0) {
        await scanVisibleFolders();
      }
    }

    safDirectory.setDiscovered();
    setDiscovered(true);
  }, [hasPermission, requestPermission, discoverMediaAlbums, scanVisibleFolders]);

  const refreshFolders = useCallback(() => {
    setFolders(safDirectory.getAll());
  }, []);

  const rescan = useCallback(async () => {
    const granted = await requestPermission();
    if (granted) {
      await loadAssets();
    }
    await scanVisibleFolders();
    loadRegistryFiles();
  }, [requestPermission, loadAssets, scanVisibleFolders, loadRegistryFiles]);

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
    requestPermission().then((granted) => {
      if (granted) {
        loadAssets();
      }
    });
    scanVisibleFolders();
    loadRegistryFiles();
    runInitialDiscovery();
  }, []);

  return {
    files, isLoading, hasPermission,
    requestPermission, rescan,
    pickDirectory, pickAndScanRecursive,
    folders, refreshFolders,
    discovered, discoverMediaAlbums,
  };
}

