import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { File, UploadType } from 'expo-file-system';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { safDirectory, StoredFolder } from '../services/safDirectory';
import { localFileRegistry } from '../services/localFileRegistry';
import { apiClient } from '../api/client';
import { API_BASE_URL, ENDPOINTS } from '../constants/api';
import { ApiError } from '../types';
import { setIsSyncing } from './useSyncQueue';

function canSyncFolder(folder: StoredFolder, netInfo: NetInfoState): boolean {
  if (folder.syncMode !== 'auto') return false;
  if (!netInfo.isConnected) return false;
  if (!folder.syncCellular && netInfo.type !== 'wifi') return false;
  return true;
}

interface UploadResult {
  name: string;
  id: string;
}

async function uploadFile(file: { uri: string; type: string; name: string }): Promise<UploadResult> {
  const fsFile = new File(file.uri);
  const headers: Record<string, string> = {};
  const token = apiClient.getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const result = await fsFile.upload(`${API_BASE_URL}${ENDPOINTS.UPLOAD}`, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType: file.type,
    headers,
  });

  if (result.status >= 400) {
    let message = 'Upload failed';
    try {
      const body: ApiError = JSON.parse(result.body);
      message = body.error?.message || message;
    } catch {
      message = result.body || message;
    }
    throw new Error(message);
  }

  const body = JSON.parse(result.body);
  const items = body.data ?? body;
  const item = Array.isArray(items) ? items[0] : items;
  return item as UploadResult;
}

export function useAutoSync() {
  const queryClient = useQueryClient();
  const isRunning = useRef(false);

  const checkAndSync = useCallback(async () => {
    if (isRunning.current) return;
    isRunning.current = true;

    try {
      const folders = safDirectory.getAll();
      const autoFolders = folders.filter((f) => f.syncMode === 'auto');
      if (autoFolders.length === 0) return;

      const netInfo = await NetInfo.fetch();
      const eligible = autoFolders.filter((f) => canSyncFolder(f, netInfo));
      if (eligible.length === 0) return;

      const eligibleIds = new Set(eligible.map((f) => f.id));
      const registry = localFileRegistry.getAll();

      const pendingFiles = registry.filter(
        (entry) =>
          !entry.backendFileId &&
          entry.syncStatus === 'local' &&
          entry.folderId &&
          eligibleIds.has(entry.folderId) &&
          entry.localUri
      );

      if (pendingFiles.length === 0) return;

      console.log(`[useAutoSync] upload de ${pendingFiles.length} fichier(s)`);
      setIsSyncing(true);

      for (const entry of pendingFiles) {
        try {
          const uploaded = await uploadFile({
            uri: entry.localUri,
            type: entry.mimeType,
            name: entry.name,
          });

          localFileRegistry.register({
            ...entry,
            backendFileId: uploaded.id,
            syncStatus: 'synced',
          });

          console.log(`[useAutoSync] "${entry.name}" uploadé → id=${uploaded.id}`);
        } catch (err) {
          console.error(`[useAutoSync] échec upload "${entry.name}":`, err);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['files'] });
      console.log(`[useAutoSync] sync terminé`);
    } finally {
      setIsSyncing(false);
      isRunning.current = false;
    }
  }, [queryClient]);

  useEffect(() => {
    const interval = setInterval(checkAndSync, 30_000);
    checkAndSync();
    return () => clearInterval(interval);
  }, [checkAndSync]);

  return { triggerSync: checkAndSync };
}
