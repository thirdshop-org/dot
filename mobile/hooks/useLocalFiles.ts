import { useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeviceFiles } from './useDeviceFiles';
import { fileStore } from '../services/fileStore';
import { generateLocalThumbnail } from '../services/thumbnail';
import { UnifiedFileItem } from '../types';

export function useLocalFiles() {
  const { files: deviceFiles, isLoading: deviceLoading, rescan, pickAndScanRecursive, folders, refreshFolders, discovered } = useDeviceFiles();
  const queryClient = useQueryClient();
  const lastDeviceCount = useRef(0);
  const thumbnailQueue = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (deviceFiles.length === 0) return;
    if (deviceFiles.length === lastDeviceCount.current) return;
    lastDeviceCount.current = deviceFiles.length;

    const toMerge = deviceFiles.map((df) => ({
      id: df.id,
      uri: df.uri,
      name: df.name,
      mimeType: df.mimeType,
      size: df.size,
      createdAt: df.createdAt,
      folderId: df.folderId,
    }));

    fileStore.mergeFromDevice(toMerge);

    const jobs: Promise<void>[] = [];
    for (const df of toMerge) {
      if (thumbnailQueue.current.has(df.id)) continue;
      const mime = (df.mimeType ?? '').toLowerCase();
      if (!mime.startsWith('image/')) continue;
      if (fileStore.getById(df.id)?.thumbnailLocal) continue;
      thumbnailQueue.current.add(df.id);
      jobs.push(
        generateLocalThumbnail(df.uri, df.mimeType).then((thumb) => {
          try {
            if (thumb) fileStore.setThumbnailLocal(df.id, thumb);
          } catch {}
        }).finally(() => {
          thumbnailQueue.current.delete(df.id);
        }),
      );
    }
    if (jobs.length > 0) {
      Promise.all(jobs).finally(() => {
        queryClient.invalidateQueries({ queryKey: ['resources'] });
      });
    }
  }, [deviceFiles, queryClient]);

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
        thumbnailUrl: entry.thumbnailUrl ?? undefined,
        thumbnailLocal: entry.thumbnailLocal ?? undefined,
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
    rescan,
    pickAndScanRecursive,
    folders,
    refreshFolders,
    discovered,
  };
}
