import { useMemo, useEffect, useRef } from 'react';
import { useDeviceFiles } from './useDeviceFiles';
import { localFileRegistry } from '../services/localFileRegistry';
import { LocalFileEntry } from '../types';

export function useLocalFiles() {
  const { files: deviceFiles, isLoading: deviceLoading, hasPermission, requestPermission, rescan, pickDirectory, folders, refreshFolders } = useDeviceFiles();

  const registryEntries = useMemo(() => localFileRegistry.getAll(), []);

  useEffect(() => {
    for (const df of deviceFiles) {
      if (localFileRegistry.get(df.id)) continue;
      const entry: LocalFileEntry = {
        id: df.id,
        localUri: df.uri,
        name: df.name,
        mimeType: df.mimeType,
        size: df.size,
        syncStatus: 'local',
        createdAt: df.createdAt,
        folderId: df.folderId,
      };
      localFileRegistry.register(entry);
    }
  }, [deviceFiles]);

  const localFiles = useMemo(() => {
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

    const result = Array.from(merged.values());
    console.log(`[useLocalFiles] registry=${registryEntries.length} device=${deviceFiles.length} merged=${result.length}`);
    return result;
  }, [deviceFiles, registryEntries]);

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
