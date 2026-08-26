import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import type { UnifiedFileItem, PaginatedResponse, FileItem, Tag } from '../types';
import { fileStore } from '../services/fileStore';
import { actionQueue } from '../services/actionQueue';

function recordToUnifiedItem(record: ReturnType<typeof fileStore.getById>): UnifiedFileItem | null {
  if (!record) return null;
  return {
    id: record.id,
    backendResourceId: record.backendId ?? undefined,
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
    parentResourceId: record.parentResourceId ?? undefined,
    ownerId: record.ownerId ?? undefined,
    thumbnailUrl: record.thumbnailUrl ?? undefined,
    isDeviceFile: record.source === 'local' && !record.backendId,
  };
}

export function useFiles(parentId?: string | null, page: number = 1, limit: number = 100) {
  const queryKey = parentId
    ? ['resources', parentId, page, limit]
    : ['resources', 'root', page, limit];

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (parentId) {
        const backendRes = await apiClient.get<PaginatedResponse<FileItem>>(
          `${ENDPOINTS.RESOURCES}/folders/${parentId}/resources?page=${page}&limit=${limit}&thumbnail=thumbnail_small`,
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
            parentResourceId: f.parentResourceId,
            ownerId: f.ownerId,
            thumbnailUrl: f.thumbnailUrl,
          })),
        );
        const children = fileStore.getChildrenByParent(parentId);
        return {
          data: children.map((r) => recordToUnifiedItem(r)!).filter(Boolean),
          meta: { page, total: backendRes.meta?.total ?? children.length },
        };
      }

      const backendRes = await apiClient.get<PaginatedResponse<FileItem>>(
        `${ENDPOINTS.RESOURCES}?page=${page}&limit=${limit}&thumbnail=thumbnail_small`,
      );
      const returnedIds = new Set(backendRes.data.map((f) => f.id));

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
          parentResourceId: f.parentResourceId,
          ownerId: f.ownerId,
          thumbnailUrl: f.thumbnailUrl,
        })),
      );

      const cached = fileStore.getRootFiles();
      const localDeviceFiles = fileStore.getLocalDeviceFiles();
      const validFiles = cached.files.filter(
        (f) => !f.backendId || returnedIds.has(f.backendId) || f.source === 'local',
      );
      const validIds = new Set(validFiles.map((f) => f.id));
      const extraLocal = localDeviceFiles.filter((f) => !validIds.has(f.id));
      const mergedFiles = [...validFiles, ...extraLocal];
      return {
        data: mergedFiles.map((r) => recordToUnifiedItem(r)!).filter(Boolean),
        meta: { page, total: (backendRes.meta?.total ?? cached.total) + extraLocal.length },
      };
    },
    placeholderData: keepPreviousData,
    initialData: () => {
      if (!parentId) {
        const cached = fileStore.getRootFiles();
        const localDeviceFiles = fileStore.getLocalDeviceFiles();
        const validIds = new Set(cached.files.map((f) => f.id));
        const extraLocal = localDeviceFiles.filter((f) => !validIds.has(f.id));
        const allFiles = [...cached.files, ...extraLocal];
        if (allFiles.length === 0) return undefined;
        return {
          data: allFiles.map((r) => recordToUnifiedItem(r)!).filter(Boolean),
          meta: { page: 0, total: cached.total + extraLocal.length },
        };
      }
      const children = fileStore.getChildrenByParent(parentId);
      if (children.length === 0) return undefined;
      return {
        data: children.map((r) => recordToUnifiedItem(r)!).filter(Boolean),
        meta: { page: 0, total: children.length },
      };
    },
    staleTime: 30_000,
  });
}

export function useFile(id: string) {
  return useQuery({
    queryKey: ['resources', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: FileItem }>(`${ENDPOINTS.RESOURCES}/${id}?thumbnail=thumbnail_small`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const record = fileStore.getByBackendId(id) ?? fileStore.getById(id);

      if (record?.backendId) {
        actionQueue.enqueue('delete', { backendId: record.backendId }, record.backendId);
      }
      fileStore.deleteByBackendId(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}

export function useAddTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fileId, tags }: { fileId: string; tags: string[] }) => {
      const record = fileStore.getById(fileId) ?? fileStore.getByBackendId(fileId);
      if (record) {
        const existingTags = record.tags ?? [];
        const newTags = [...existingTags, ...tags.map((t) => ({ id: t, tag_name: t }))];
        const uniqueTags = newTags.filter((t, i, arr) => arr.findIndex((x) => x.tag_name === t.tag_name) === i);
        fileStore.updatePartial(record.id, {});
        actionQueue.enqueue('tag_add', { fileId: record.backendId ?? record.id, tags }, record.backendId ?? record.id);
      }
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}

export function useMoveResources() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resourceIds, parentResourceId }: { resourceIds: string[]; parentResourceId: string | null }) => {
      const backendIds: string[] = [];
      for (const id of resourceIds) {
        const record = fileStore.getById(id) ?? fileStore.getByBackendId(id);
        if (record?.backendId) {
          backendIds.push(record.backendId);
          fileStore.updatePartial(record.id, { parentResourceId: parentResourceId ?? null });
        }
      }
      if (backendIds.length > 0) {
        actionQueue.enqueue('move', { resourceIds: backendIds, parentResourceId });
      }
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
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
          parentResourceId: f.parentResourceId,
          ownerId: f.ownerId,
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

export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, parentResourceId }: { name: string; parentResourceId?: string }) => {
      const now = new Date().toISOString();
      const localId = `local_folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      fileStore.upsert({
        id: localId,
        backendId: null,
        name,
        mimeType: 'inode/directory',
        size: 0,
        source: 'local',
        localUri: null,
        syncStatus: 'local',
        parentResourceId: parentResourceId ?? null,
        isFolder: 1,
        ocrText: null,
        thumbnailUrl: null,
        ownerId: null,
        createdAt: now,
        updatedAt: now,
        lastSyncedAt: null,
      });
      actionQueue.enqueue('create_folder', { name, parentResourceId }, localId);
      return { id: localId, name };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
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

      const res = await apiClient.get<{ url: string }>(
        `${ENDPOINTS.RESOURCES}/${file.backendResourceId ?? file.id}`,
      );

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

      const result = await downloadAsync(res.url, fileUri);

      fileStore.upsert({
        id: file.backendResourceId ?? file.id,
        backendId: file.backendResourceId ?? file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        source: 'synced',
        localUri: result.uri,
        syncStatus: 'synced',
        parentResourceId: file.parentResourceId ?? null,
        isFolder: 0,
        ocrText: file.ocrText ?? null,
        thumbnailUrl: file.thumbnailUrl ?? null,
        ownerId: file.ownerId ?? null,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt ?? file.createdAt,
        lastSyncedAt: new Date().toISOString(),
        tags: file.tags,
      });

      queryClient.invalidateQueries({ queryKey: ['resources'] });
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
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}
