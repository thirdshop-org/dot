import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { downloadAsync, documentDirectory, makeDirectoryAsync, deleteAsync } from 'expo-file-system/legacy';
import { useFiles } from './useFiles';
import { useLocalFiles } from './useLocalFiles';
import { localFileRegistry } from '../services/localFileRegistry';
import { thumbnailCache } from '../services/thumbnailCache';
import { apiClient } from '../api/client';
import { FileItem, LocalFileEntry, SyncStatus, Tag } from '../types';

export interface UnifiedFileItem {
  id: string;
  backendFileId?: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt?: string;
  syncStatus: SyncStatus;
  localUri?: string;
  ocrText?: string;
  tags: Tag[];
  isFolder: boolean;
  parentFileId?: string;
  url?: string;
  thumbnailUrl?: string;
  isDeviceFile?: boolean;
  duplicateOf?: string;
}

const DOWNLOAD_DIR = `${documentDirectory}synced-files/`;

function getCacheKey(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot) : '';
}

function parseExpiresFromUrl(url: string): number {
  try {
    const u = new URL(url);
    const expires = u.searchParams.get('expires');
    if (expires) return Number(expires) * 1000;
  } catch {}
  return Date.now() + 50 * 60 * 1000;
}

export function useUnifiedFiles(page: number = 1, limit: number = 50) {
  const { data: backendData, isLoading: backendLoading, error: backendError } = useFiles(page, limit);
  const { localFiles, isLoading: localLoading, hasPermission, requestPermission, pickDirectory, folders, refreshFolders } = useLocalFiles();

  const unifiedFiles = useMemo(() => {
    const backendFiles = backendData?.data ?? [];
    const merged = new Map<string, UnifiedFileItem>();

    const registryAll = localFileRegistry.getAll();
    const backendIdToLocal = new Map<string, LocalFileEntry>();
    for (const entry of registryAll) {
      if (entry.backendFileId) {
        backendIdToLocal.set(entry.backendFileId, entry);
      }
    }

    const nameSizeIndex = new Map<string, string>();
    for (const bf of backendFiles) {
      if (!bf.isFolder && bf.size > 0) {
        nameSizeIndex.set(`${bf.name}::${bf.size}`, bf.id);
      }
    }

    for (const bf of backendFiles) {
      const localEntry = backendIdToLocal.get(bf.id);

      let thumbUrl = bf.thumbnailUrl;
      if (thumbUrl && bf.thumbnailUrl) {
        const expiresAt = parseExpiresFromUrl(bf.thumbnailUrl);
        thumbnailCache.set(bf.id, bf.thumbnailUrl, expiresAt);
      } else {
        const cached = thumbnailCache.get(bf.id);
        if (cached) thumbUrl = cached;
      }

      merged.set(bf.id, {
        id: bf.id,
        backendFileId: bf.id,
        name: bf.name,
        mimeType: bf.mimeType,
        size: bf.size,
        createdAt: bf.createdAt,
        updatedAt: bf.updatedAt,
        syncStatus: localEntry ? 'synced' : 'cloud',
        localUri: localEntry?.localUri,
        ocrText: bf.ocrText,
        tags: bf.tags,
        isFolder: bf.isFolder,
        parentFileId: bf.parentFileId,
        url: bf.url,
        thumbnailUrl: thumbUrl,
      });
    }

    for (const lf of localFiles) {
      if (lf.backendFileId && merged.has(lf.backendFileId)) continue;
      if (merged.has(lf.id)) continue;

      if (!lf.folderId && lf.size > 0) {
        const key = `${lf.name}::${lf.size}`;
        const matchId = nameSizeIndex.get(key);
        if (matchId) {
          const existing = merged.get(matchId);
          if (existing && !existing.localUri && lf.localUri) {
            merged.set(matchId, { ...existing, localUri: lf.localUri, syncStatus: 'synced' });
          }
          continue;
        }
      }

      merged.set(lf.id, {
        id: lf.id,
        backendFileId: lf.backendFileId,
        name: lf.name,
        mimeType: lf.mimeType,
        size: lf.size,
        createdAt: lf.createdAt,
        syncStatus: 'local',
        localUri: lf.localUri,
        tags: lf.tags ?? [],
        isFolder: false,
        isDeviceFile: true,
      });
    }

    return Array.from(merged.values()).sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [backendData, localFiles]);

  return {
    data: unifiedFiles,
    isLoading: backendLoading || localLoading,
    error: backendError,
    hasPermission,
    requestPermission,
    pickDirectory,
    folders,
    refreshFolders,
  };
}

export function useUnifiedFilesByParent(parentId: string) {
  const { data: backendData, isLoading: backendLoading } = useQuery({
    queryKey: ['files', 'parent', parentId],
    queryFn: () =>
      apiClient.get<{ data: FileItem[] }>(`/files/folders/${parentId}/files?thumbnail=thumbnail`),
    enabled: !!parentId,
  });

  const { localFiles, isLoading: localLoading } = useLocalFiles();

  const unifiedFiles = useMemo(() => {
    const backendFiles = backendData?.data ?? [];
    const merged = new Map<string, UnifiedFileItem>();

    const registryAll = localFileRegistry.getAll();
    const backendIdToLocal = new Map<string, LocalFileEntry>();
    for (const entry of registryAll) {
      if (entry.backendFileId) backendIdToLocal.set(entry.backendFileId, entry);
    }

    for (const bf of backendFiles) {
      const localEntry = backendIdToLocal.get(bf.id);

      let thumbUrl = bf.thumbnailUrl;
      if (thumbUrl && bf.thumbnailUrl) {
        const expiresAt = parseExpiresFromUrl(bf.thumbnailUrl);
        thumbnailCache.set(bf.id, bf.thumbnailUrl, expiresAt);
      } else {
        const cached = thumbnailCache.get(bf.id);
        if (cached) thumbUrl = cached;
      }

      merged.set(bf.id, {
        id: bf.id,
        backendFileId: bf.id,
        name: bf.name,
        mimeType: bf.mimeType,
        size: bf.size,
        createdAt: bf.createdAt,
        updatedAt: bf.updatedAt,
        syncStatus: localEntry ? 'synced' : 'cloud',
        localUri: localEntry?.localUri,
        ocrText: bf.ocrText,
        tags: bf.tags,
        isFolder: bf.isFolder,
        parentFileId: bf.parentFileId,
        url: bf.url,
        thumbnailUrl: thumbUrl,
      });
    }

    return Array.from(merged.values()).sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [backendData, localFiles]);

  return {
    data: unifiedFiles,
    isLoading: backendLoading || localLoading,
  };
}

export function useDownloadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: UnifiedFileItem): Promise<string> => {
      if (file.syncStatus !== 'cloud') {
        return file.localUri ?? '';
      }

      const res = await apiClient.get<{ data: { url: string; name: string } }>(
        `/files/${file.backendFileId}`
      );
      const downloadUrl = res.data.url;

      await makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
      const cacheKey = getCacheKey(file.name);
      const ext = getExtension(file.name);
      const fileUri = `${DOWNLOAD_DIR}${cacheKey}${ext}`;

      const result = await downloadAsync(downloadUrl, fileUri);

      const entry: LocalFileEntry = {
        id: `local_${file.backendFileId}`,
        backendFileId: file.backendFileId,
        localUri: result.uri,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        syncStatus: 'synced',
        createdAt: file.createdAt,
        tags: file.tags,
      };
      localFileRegistry.register(entry);

      queryClient.invalidateQueries({ queryKey: ['files'] });

      return result.uri;
    },
  });
}

export function useFreeLocalSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileIds: string[]) => {
      for (const fid of fileIds) {
        const entry = localFileRegistry.get(fid);
        if (!entry) continue;

        if (entry.localUri) {
          try {
            await deleteAsync(entry.localUri, { idempotent: true });
          } catch {}
        }

        localFileRegistry.markAsCloudOnly(fid);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}
