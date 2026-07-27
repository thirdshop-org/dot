import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { downloadAsync, documentDirectory, makeDirectoryAsync } from 'expo-file-system/legacy';
import { useFiles } from './useFiles';
import { localFileRegistry } from '../services/localFileRegistry';
import { apiClient } from '../api/client';
import { LocalFileEntry } from '../types';
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
      const registry = localFileRegistry.getAll();
      const existingBackendIds = new Set(
        registry.filter((e) => e.backendFileId).map((e) => e.backendFileId)
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

          const entry: LocalFileEntry = {
            id: `pull_${bf.id}`,
            backendFileId: bf.id,
            localUri: result.uri,
            name: bf.name,
            mimeType: bf.mimeType,
            size: bf.size,
            syncStatus: 'synced',
            createdAt: bf.createdAt,
          };
          localFileRegistry.register(entry);
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
