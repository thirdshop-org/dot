import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { FileDto, ListFilesParams } from '../api/types';

export function useFiles(params?: ListFilesParams) {
  return useQuery({
    queryKey: ['files', params],
    queryFn: () => api.listFiles(params),
  });
}

export function useFile(id: string) {
  return useQuery({
    queryKey: ['files', id],
    queryFn: () => api.getFile(id),
    enabled: id.length > 0,
  });
}

export function useFileTags(id: string) {
  return useQuery({
    queryKey: ['files', id, 'tags'],
    queryFn: async (): Promise<string[]> => {
      const { data } = await api.getFile(id);
      return data.tags ?? [];
    },
    enabled: id.length > 0,
  });
}

export type { FileDto };