import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { FileDto, OcrJob } from '../api/types';

export function useUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      file: { uri: string; name: string; mimeType: string };
      folderId?: string | null;
    }) => api.uploadFile(input.file, input.folderId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      return result;
    },
  });
}

export function useOcrJob(jobId?: string | null) {
  return useQuery({
    queryKey: ['ocr', jobId],
    queryFn: () => api.getOcrJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) =>
      query.state.data && query.state.data.data.status === 'done' ? false : 3000,
  });
}

export function useCreateOcrJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => api.createOcrJob(fileId),
    onSuccess: (result) => {
      queryClient.setQueryData(['ocr', result.data.id], result.data);
    },
  });
}

export type { FileDto, OcrJob };