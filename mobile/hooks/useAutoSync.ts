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

      const registry = localFileRegistry.getAll();
      let pendingFiles = registry.filter(
        (entry) => !entry.backendFileId && entry.syncStatus === 'local' && entry.localUri
      );

      if (globalMode === 'auto') {
        // Mode auto global : tous les fichiers locaux sans backendFileId
        // (pas de filtre par dossier)
      } else {
        // Mode manuel : uniquement les fichiers des dossiers en mode auto
        const allFolders = safDirectory.getAll();
        const autoFolderIds = new Set(
          allFolders.filter((f) => f.syncMode === 'auto').map((f) => f.id)
        );
        pendingFiles = pendingFiles.filter(
          (entry) => entry.folderId && autoFolderIds.has(entry.folderId)
        );
      }

      if (pendingFiles.length === 0) return;

      console.log(`[useAutoSync] mode=${globalMode}, upload de ${pendingFiles.length} fichier(s)`);
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
