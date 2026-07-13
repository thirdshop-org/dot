import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { FileItem, PaginatedResponse } from '../types';

export function useFiles(page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: ['files', page, limit],
    queryFn: () =>
      apiClient.get<PaginatedResponse<FileItem>>(
        `${ENDPOINTS.FILES}?page=${page}&limit=${limit}`
      ),
  });
}

export function useFile(id: string) {
  return useQuery({
    queryKey: ['files', id],
    queryFn: () => apiClient.get<FileItem>(`${ENDPOINTS.FILES}/${id}`),
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
