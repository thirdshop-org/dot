import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { FileItem, PaginatedResponse } from '../types';

export function useSearch(query: string, page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: ['search', query, page, limit],
    queryFn: () =>
      apiClient.get<PaginatedResponse<FileItem>>(
        `${ENDPOINTS.FILES}/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
      ),
    enabled: query.length > 0,
  });
}
