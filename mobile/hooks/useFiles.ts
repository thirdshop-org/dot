import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import type { UnifiedFileItem, PaginatedResponse, FileItem, Tag } from '../types';
import { fileStore } from '../services/fileStore';

function recordToUnifiedItem(record: ReturnType<typeof fileStore.getById>): UnifiedFileItem | null {
  if (!record) return null;
  return {
    id: record.id,
    backendFileId: record.backendId ?? undefined,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: record.source as UnifiedFileItem['source'],
    syncStatus: record.syncStatus as UnifiedFileItem['syncStatus'],
    localUri: record.localUri ?? undefined,
    ocrText: record.ocrText ?? undefined,
    tags: record.tags ?? [],
    isFolder: record.isFolder === 1,
    parentFileId: record.parentFileId ?? undefined,
    thumbnailUrl: record.thumbnailUrl ?? undefined,
    isDeviceFile: record.source === 'local' && !record.backendId,
  };
}

function recordsToUnifiedItems(records: ReturnType<typeof fileStore.getPaginated>): {
  data: UnifiedFileItem[];
  meta: { page: number; total: number };
} {
  return {
    data: records.files.map((r) => recordToUnifiedItem(r)!).filter(Boolean),
    meta: { page: 0, total: records.total },
  };
}

export function useFiles(parentId?: string | null, page: number = 1, limit: number = 50) {
  const queryKey = parentId
    ? ['files', parentId]
    : ['files', 'root', page, limit];

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (parentId) {
        const backendRes = await apiClient.get<{ data: FileItem[] }>(
          `/files/folders/${parentId}/files?thumbnail=thumbnail`,
        );
        fileStore.mergeFromBackend(
          backendRes.data.map((f) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
            ocrText: f.ocrText,
            tags: f.tags,
            isFolder: f.isFolder,
            parentFileId: f.parentFileId,
            thumbnailUrl: f.thumbnailUrl,
          })),
        );

        const children = fileStore.getChildrenByParent(parentId);
        return {
          data: children.map((r) => recordToUnifiedItem(r)!).filter(Boolean),
          meta: { page: 0, total: children.length },
        };
      }

      const backendRes = await apiClient.get<PaginatedResponse<FileItem>>(
        `${ENDPOINTS.FILES}?page=${page}&limit=${limit}&thumbnail=thumbnail`,
      );
      fileStore.mergeFromBackend(
        backendRes.data.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
          ocrText: f.ocrText,
          tags: f.tags,
          isFolder: f.isFolder,
          parentFileId: f.parentFileId,
          thumbnailUrl: f.thumbnailUrl,
        })),
      );

      const cached = fileStore.getPaginated(page, limit);
      return recordsToUnifiedItems(cached);
    },
    initialData: () => {
      let records;
      if (parentId) {
        const children = fileStore.getChildrenByParent(parentId);
        records = { files: children, total: children.length };
      } else {
        records = fileStore.getPaginated(page, limit);
      }
      if (records.files.length === 0) return undefined;
      return recordsToUnifiedItems(records);
    },
    staleTime: 30_000,
  });
}

export function useFile(id: string) {
  return useQuery({
    queryKey: ['files', id],
    queryFn: () => apiClient.get<FileItem>(`${ENDPOINTS.FILES}/${id}?thumbnail=thumbnail`),
    enabled: !!id,
  });
}

export function useFileImage(fileId: string) {
  return useQuery({
    queryKey: ['fileImage', fileId],
    queryFn: () =>
      apiClient.get<{ data: { id: string; name: string; url: string; size: number } }>(
        `${ENDPOINTS.FILE}/${fileId}`,
      ),
    enabled: !!fileId,
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.delete(`${ENDPOINTS.FILES}/${id}`);
      fileStore.deleteByBackendId(id);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

export function useAddTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fileId, tags, tagType }: { fileId: string; tags: string[]; tagType?: string }) =>
      apiClient.post(`${ENDPOINTS.FILES}/${fileId}/tags`, { tags, tag_type: tagType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

export function useMoveFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fileIds, parentFileId }: { fileIds: string[]; parentFileId: string | null }) =>
      apiClient.post(ENDPOINTS.MOVE, { file_ids: fileIds, parent_file_id: parentFileId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: async () => {
      const backendRes = await apiClient.get<{ data: FileItem[] }>(ENDPOINTS.FOLDERS);
      fileStore.mergeFromBackend(
        backendRes.data.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
          ocrText: f.ocrText,
          tags: f.tags,
          isFolder: f.isFolder,
          parentFileId: f.parentFileId,
          thumbnailUrl: f.thumbnailUrl,
        })),
      );
      return fileStore.getAllFolders();
    },
    initialData: () => {
      const folders = fileStore.getAllFolders();
      return folders.length > 0 ? folders : undefined;
    },
    staleTime: 60_000,
  });
}

export function useFilesByParent(parentId: string) {
  return useFiles(parentId);
}

export function useDownloadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: UnifiedFileItem): Promise<string> => {
      if (file.syncStatus !== 'cloud') {
        return file.localUri ?? '';
      }

      const res = await apiClient.get<{ data: { url: string; name: string } }>(
        `/files/${file.backendFileId}`,
      );
      const downloadUrl = res.data.url;

      const { downloadAsync, documentDirectory, makeDirectoryAsync } = await import('expo-file-system/legacy');
      const DOWNLOAD_DIR = `${documentDirectory}synced-files/`;
      await makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });

      let hash = 0;
      for (let i = 0; i < file.name.length; i++) {
        hash = ((hash << 5) - hash + file.name.charCodeAt(i)) | 0;
      }
      const cacheKey = Math.abs(hash).toString(36);
      const dot = file.name.lastIndexOf('.');
      const ext = dot >= 0 ? file.name.slice(dot) : '';
      const fileUri = `${DOWNLOAD_DIR}${cacheKey}${ext}`;

      const result = await downloadAsync(downloadUrl, fileUri);

      fileStore.upsert({
        id: file.backendFileId ?? file.id,
        backendId: file.backendFileId ?? file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        source: 'synced',
        localUri: result.uri,
        syncStatus: 'synced',
        parentFileId: file.parentFileId ?? null,
        isFolder: 0,
        ocrText: file.ocrText ?? null,
        thumbnailUrl: file.thumbnailUrl ?? null,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt ?? file.createdAt,
        lastSyncedAt: new Date().toISOString(),
        tags: file.tags,
      });

      queryClient.invalidateQueries({ queryKey: ['files'] });
      return result.uri;
    },
  });
}

export function useFreeLocalSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileIds: string[]) => {
      const { deleteAsync } = await import('expo-file-system/legacy');
      for (const fid of fileIds) {
        const entry = fileStore.getByBackendId(fid);
        if (!entry) continue;

        if (entry.localUri) {
          try {
            await deleteAsync(entry.localUri, { idempotent: true });
          } catch {}
        }

        fileStore.markAsCloudOnly(entry.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}
