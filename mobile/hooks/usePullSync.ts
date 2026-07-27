import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { downloadAsync, documentDirectory, makeDirectoryAsync } from 'expo-file-system/legacy';
import { fileStore } from '../services/fileStore';
import { apiClient } from '../api/client';
import { setIsSyncing } from './useSyncQueue';

const SYNC_DIR = `${documentDirectory}synced-files/`;

export function usePullSync() {
  const queryClient = useQueryClient();
  const isRunning = useRef(false);

  const pullNewFiles = useCallback(async () => {
    if (isRunning.current) return { pulled: 0 };
    isRunning.current = true;

    try {
      setIsSyncing(true);

      const res = await apiClient.get<{ data: Array<{
        id: string;
        name: string;
        mimeType: string;
        size: number;
        createdAt: string;
        url?: string;
      }> }>('/files?page=1&limit=100&thumbnail=thumbnail');

      const backendFiles = res.data ?? [];
      const registry = fileStore.getAllSynced();
      const existingBackendIds = new Set(
        registry.filter((e) => e.backendId).map((e) => e.backendId)
      );

      let pulled = 0;

      for (const bf of backendFiles) {
        if (existingBackendIds.has(bf.id)) continue;
        if (bf.size === 0) continue;

        try {
          const detail = await apiClient.get<{ data: { url: string } }>(`/files/${bf.id}`);
          const downloadUrl = detail.data.url;

          await makeDirectoryAsync(SYNC_DIR, { intermediates: true });
          const safeName = bf.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const fileUri = `${SYNC_DIR}${bf.id}_${safeName}`;

          const result = await downloadAsync(downloadUrl, fileUri);

          fileStore.upsert({
            id: bf.id,
            backendId: bf.id,
            name: bf.name,
            mimeType: bf.mimeType,
            size: bf.size,
            source: 'synced',
            localUri: result.uri,
            syncStatus: 'synced',
            parentFileId: null,
            isFolder: 0,
            ocrText: null,
            thumbnailUrl: null,
            createdAt: bf.createdAt,
            updatedAt: bf.createdAt,
            lastSyncedAt: new Date().toISOString(),
          });
          pulled++;
        } catch {
          // skip individual file failures
        }
      }

      if (pulled > 0) {
        queryClient.invalidateQueries({ queryKey: ['files'] });
      }

      return { pulled };
    } finally {
      setIsSyncing(false);
      isRunning.current = false;
    }
  }, [queryClient]);

  return { pullNewFiles };
}
