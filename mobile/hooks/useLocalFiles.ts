import { useMemo, useEffect, useRef } from 'react';
import { useDeviceFiles } from './useDeviceFiles';
import { localFileRegistry } from '../services/localFileRegistry';
import { LocalFileEntry } from '../types';

export function useLocalFiles() {
  const { files: deviceFiles, isLoading: deviceLoading, hasPermission, requestPermission, rescan, pickDirectory, folders, refreshFolders } = useDeviceFiles();
  const lastDeviceCount = useRef(0);

  useEffect(() => {
    if (deviceFiles.length === 0) return;
    if (deviceFiles.length === lastDeviceCount.current) return;
    lastDeviceCount.current = deviceFiles.length;

    const newEntries: LocalFileEntry[] = [];
    for (const df of deviceFiles) {
      if (localFileRegistry.get(df.id)) continue;
      newEntries.push({
        id: df.id,
        localUri: df.uri,
        name: df.name,
        mimeType: df.mimeType,
        size: df.size,
        syncStatus: 'local',
        createdAt: df.createdAt,
        folderId: df.folderId,
      });
    }
    if (newEntries.length > 0) {
      localFileRegistry.registerBatch(newEntries);
    }
  }, [deviceFiles]);

  const localFiles = useMemo(() => {
    const registryEntries = localFileRegistry.getAll();
    const merged = new Map<string, LocalFileEntry>();

    for (const entry of registryEntries) {
      merged.set(entry.id, entry);
    }

    for (const df of deviceFiles) {
      if (!merged.has(df.id)) {
        merged.set(df.id, {
          id: df.id,
          localUri: df.uri,
          name: df.name,
          mimeType: df.mimeType,
          size: df.size,
          syncStatus: 'local',
          createdAt: df.createdAt,
          folderId: df.folderId,
        });
      }
    }

    return Array.from(merged.values());
  }, [deviceFiles]);

  return {
    localFiles,
    isLoading: deviceLoading,
    hasPermission,
    requestPermission,
    rescan,
    pickDirectory,
    folders,
    refreshFolders,
  };
}
