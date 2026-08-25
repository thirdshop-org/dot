import { useEffect, useCallback, useRef } from 'react';
import { createMMKV } from 'react-native-mmkv';
import { useQueryClient } from '@tanstack/react-query';
import { File, UploadType } from 'expo-file-system';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { safDirectory, StoredFolder } from '../services/safDirectory';
import { fileStore } from '../services/fileStore';
import { activeUploadUris } from '../services/uploadQueue';
import { apiClient } from '../api/client';
import { API_BASE_URL, ENDPOINTS } from '../constants/api';
import { ApiError } from '../types';
import { setIsSyncing } from './useSyncQueue';

const MAX_RETRIES = 5;
const RETRY_MMKV_ID = 'vaultdrop-sync-retries';

const retryStorage = createMMKV({ id: RETRY_MMKV_ID });

function getRetryCount(fileId: string): number {
  return retryStorage.getNumber(`${fileId}_retries`) ?? 0;
}

function incrementRetry(fileId: string): number {
  const count = getRetryCount(fileId) + 1;
  retryStorage.set(`${fileId}_retries`, count);
  return count;
}

function resetRetry(fileId: string) {
  retryStorage.remove(`${fileId}_retries`);
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

function canSyncBasedOnNetwork(netInfo: NetInfoState, cellularAllowed: boolean): boolean {
  if (!netInfo.isConnected) return false;
  if (!cellularAllowed && netInfo.type !== 'wifi') return false;
  return true;
}

export function useAutoSync() {
  const queryClient = useQueryClient();
  const isRunning = useRef(false);

  const checkAndSync = useCallback(async () => {
    if (isRunning.current) return;

    const globalMode = safDirectory.getGlobalSyncMode();
    if (globalMode === 'off') return;

    isRunning.current = true;

    try {
      const globalCellular = safDirectory.getGlobalSyncCellular();
      const netInfo = await NetInfo.fetch();

      if (!canSyncBasedOnNetwork(netInfo, globalCellular)) return;

      const registry = fileStore.getAllLocal();
      let pendingFiles = registry.filter(
        (entry) => !entry.backendId && entry.syncStatus === 'local' && entry.localUri
      );

      if (globalMode === 'auto') {
        // Mode auto global : tous les fichiers locaux sans backendId
      } else {
        // Mode manuel : uniquement les fichiers des dossiers en mode auto
        const allFolders = safDirectory.getAll();
        const autoFolderIds = new Set(
          allFolders.filter((f) => f.syncMode === 'auto').map((f) => f.id)
        );
        pendingFiles = pendingFiles.filter(
          (entry) => entry.parentResourceId && autoFolderIds.has(entry.parentResourceId)
        );
      }

      if (pendingFiles.length === 0) return;

      setIsSyncing(true);

      for (const entry of pendingFiles) {
        const uri = entry.localUri;
        if (!uri || activeUploadUris.has(uri)) continue;
        activeUploadUris.add(uri);
        try {
          const uploaded = await uploadFile({
            uri,
            type: entry.mimeType,
            name: entry.name,
          });

          resetRetry(entry.id);
          fileStore.updatePartial(entry.id, {
            backendId: uploaded.id,
            syncStatus: 'synced',
            source: 'synced',
          });
        } catch (err) {
          const retries = incrementRetry(entry.id);
          if (retries >= MAX_RETRIES) {
            fileStore.updatePartial(entry.id, {
              syncStatus: 'error',
            });
            resetRetry(entry.id);
          }
        } finally {
          activeUploadUris.delete(uri);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['resources'] });
    } finally {
      setIsSyncing(false);
      isRunning.current = false;
    }
  }, [queryClient]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      checkAndSync();
    }, 5_000);
    const interval = setInterval(checkAndSync, 30_000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [checkAndSync]);

  return { triggerSync: checkAndSync };
}
