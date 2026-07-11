import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, UploadType } from 'expo-file-system';
import { apiClient } from '../api/client';
import { API_BASE_URL, ENDPOINTS } from '../constants/api';
import { OcrJob } from '../types';

export function useUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: { uri: string; type: string; name: string }) => {
      const fsFile = new File(file.uri);
      const result = await fsFile.upload(`${API_BASE_URL}${ENDPOINTS.UPLOAD}`, {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType: file.type,
      });

      return JSON.parse(result.body) as { id: string; ocrJobId: string };
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
