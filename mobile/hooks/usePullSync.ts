import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { downloadAsync, documentDirectory, makeDirectoryAsync } from 'expo-file-system/legacy';
import { fileStore } from '../services/fileStore';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
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
        thumbnailUrl?: string;
        ownerId?: string;
      }> }>(`${ENDPOINTS.RESOURCES}?page=1&limit=100&thumbnail=thumbnail_small`);

      const backendResources = res.data ?? [];
      const registry = fileStore.getAllSynced();
      const existingBackendIds = new Set(
        registry.filter((e) => e.backendId).map((e) => e.backendId)
      );

      let pulled = 0;

      for (const br of backendResources) {
        if (existingBackendIds.has(br.id)) continue;
        if (br.size === 0) continue;

        try {
          const detail = await apiClient.get<{ url: string }>(`${ENDPOINTS.RESOURCES}/${br.id}`);
          const downloadUrl = detail.url;

          await makeDirectoryAsync(SYNC_DIR, { intermediates: true });
          const safeName = br.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const fileUri = `${SYNC_DIR}${br.id}_${safeName}`;

          const result = await downloadAsync(downloadUrl, fileUri);

          fileStore.upsert({
            id: br.id,
            backendId: br.id,
            name: br.name,
            mimeType: br.mimeType,
            size: br.size,
            source: 'synced',
            localUri: result.uri,
            syncStatus: 'synced',
            parentResourceId: null,
            isFolder: 0,
            ocrText: null,
            thumbnailUrl: br.thumbnailUrl ?? null,
            ownerId: br.ownerId ?? null,
            createdAt: br.createdAt,
            updatedAt: br.createdAt,
            lastSyncedAt: new Date().toISOString(),
          });
          pulled++;
        } catch {
          // skip individual file failures
        }
      }

      if (pulled > 0) {
        queryClient.invalidateQueries({ queryKey: ['resources'] });
      }

      return { pulled };
    } finally {
      setIsSyncing(false);
      isRunning.current = false;
    }
  }, [queryClient]);

  return { pullNewFiles };
}
