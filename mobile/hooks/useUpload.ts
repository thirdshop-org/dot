import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { OcrJob } from '../types';

export function useUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      return apiClient.uploadFile<{ id: string; ocrJobId: string }>(
        ENDPOINTS.UPLOAD,
        formData
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

export function useOcrJobStatus(jobId: string) {
  return useQuery({
    queryKey: ['ocr', jobId],
    queryFn: () => apiClient.get<OcrJob>(`${ENDPOINTS.OCR_JOBS}/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query: any) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 1000;
    },
  });
}
