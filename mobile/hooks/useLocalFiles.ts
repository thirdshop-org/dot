import { useMemo, useEffect, useRef } from 'react';
import { useDeviceFiles } from './useDeviceFiles';
import { fileStore } from '../services/fileStore';
import { UnifiedFileItem } from '../types';

export function useLocalFiles() {
  const { files: deviceFiles, isLoading: deviceLoading, hasPermission, requestPermission, rescan, pickDirectory, folders, refreshFolders } = useDeviceFiles();
  const lastDeviceCount = useRef(0);

  useEffect(() => {
    if (deviceFiles.length === 0) return;
    if (deviceFiles.length === lastDeviceCount.current) return;
    lastDeviceCount.current = deviceFiles.length;

    fileStore.mergeFromDevice(
      deviceFiles.map((df) => ({
        id: df.id,
        uri: df.uri,
        name: df.name,
        mimeType: df.mimeType,
        size: df.size,
        createdAt: df.createdAt,
        folderId: df.folderId,
      })),
    );
  }, [deviceFiles]);

  const localFiles = useMemo(() => {
    const registryEntries = fileStore.getAllLocal();
    const merged = new Map<string, UnifiedFileItem>();

    for (const entry of registryEntries) {
      merged.set(entry.id, {
        id: entry.id,
        backendResourceId: entry.backendId ?? undefined,
        name: entry.name,
        mimeType: entry.mimeType,
        size: entry.size,
        createdAt: entry.createdAt,
        source: entry.source as UnifiedFileItem['source'],
        syncStatus: entry.syncStatus as UnifiedFileItem['syncStatus'],
        localUri: entry.localUri ?? undefined,
        tags: entry.tags ?? [],
        isFolder: entry.isFolder === 1,
        parentResourceId: entry.parentResourceId ?? undefined,
        isDeviceFile: entry.source === 'local' && !entry.backendId,
      });
    }

    for (const df of deviceFiles) {
      if (!merged.has(df.id) && !fileStore.isDeleted(df.id)) {
        merged.set(df.id, {
          id: df.id,
          name: df.name,
          mimeType: df.mimeType,
          size: df.size,
          createdAt: df.createdAt,
          source: 'local',
          syncStatus: 'local',
          localUri: df.uri,
          tags: [],
          isFolder: false,
          isDeviceFile: true,
          parentResourceId: df.folderId,
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
