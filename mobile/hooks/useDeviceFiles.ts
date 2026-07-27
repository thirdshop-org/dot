import { useState, useEffect, useCallback } from 'react';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import { LocalFileEntry } from '../types';
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

export function useDeviceFiles() {
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [folders, setFolders] = useState<StoredFolder[]>(() => safDirectory.getAll());
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

  const scanVisibleFolders = useCallback(async () => {
    const visibleFolders = safDirectory.getVisibleFolders();
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

  const pickDirectory = useCallback(async () => {
    try {
      const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!result.granted) return false;
      const dirUri = result.directoryUri;
      const parts = dirUri.split('/');
      const dirName = decodeURIComponent(parts[parts.length - 1] ?? 'Dossier');
      safDirectory.addFolder(dirUri, dirName);
      setFolders(safDirectory.getAll());

      const folderFiles = await scanSafFolder({ id: 'new', uri: dirUri, name: dirName, visible: true, syncMode: 'none', syncCellular: false });
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

    // Persist to MMKV
    downloadRegistry.addBatch(newFiles);

    // Add to in-memory state
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
  }, []);

  return { files, isLoading, hasPermission, requestPermission, rescan, pickDirectory, folders, refreshFolders };
}

export function deviceFileToLocalEntry(deviceFile: DeviceFile): LocalFileEntry {
  return {
    id: deviceFile.id,
    localUri: deviceFile.uri,
    name: deviceFile.name,
    mimeType: deviceFile.mimeType,
    size: deviceFile.size,
    syncStatus: 'local',
    createdAt: deviceFile.createdAt,
  };
}
