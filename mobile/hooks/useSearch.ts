import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { FileDto } from '../api/types';

export function useSearch(q: string, page?: number, pageSize?: number) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ['search', trimmed, page, pageSize],
    queryFn: () => api.searchFiles(trimmed, { page, pageSize }),
    enabled: trimmed.length > 0,
  });
}

export type { FileDto };