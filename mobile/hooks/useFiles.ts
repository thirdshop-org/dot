import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { FileItem, PaginatedResponse } from '../types';
import { metadataCache } from '../services/metadataCache';

export function useFiles(page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: ['files', page, limit],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<FileItem>>(
        `${ENDPOINTS.FILES}?page=${page}&limit=${limit}&thumbnail=thumbnail`
      );
      metadataCache.setFiles(res.data, res.meta.page, res.meta.total);
      return res;
    },
    initialData: () => {
      const cached = metadataCache.getFiles();
      if (cached && cached.page === page) {
        return { data: cached.files, meta: { page: cached.page, total: cached.total } };
      }
      return undefined;
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
    queryFn: () => apiClient.get<{ data: { id: string; name: string; url: string; size: number } }>(`${ENDPOINTS.FILE}/${fileId}`),
    enabled: !!fileId,
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`${ENDPOINTS.FILES}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      metadataCache.clear();
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
      metadataCache.clear();
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
      metadataCache.clear();
    },
  });
}

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: () => apiClient.get<{ data: FileItem[] }>(ENDPOINTS.FOLDERS),
  });
}

export function useFilesByParent(parentId: string) {
  return useQuery({
    queryKey: ['files', 'parent', parentId],
    queryFn: () =>
      apiClient.get<{ data: FileItem[] }>(`${ENDPOINTS.FOLDERS}/${parentId}/files?thumbnail=thumbnail`),
    enabled: !!parentId,
  });
}
