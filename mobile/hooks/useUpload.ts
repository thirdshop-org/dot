import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, UploadType } from 'expo-file-system';
import { apiClient } from '../api/client';
import { API_BASE_URL, ENDPOINTS } from '../constants/api';
import { OcrJob } from '../types';

export type UploadFile = { uri: string; type: string; name: string };
export type UploadResult = { name: string; id: string };

export function useUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: UploadFile[]) => {
      const results = await Promise.allSettled(
        files.map(async (file) => {
          const fsFile = new File(file.uri);
          const result = await fsFile.upload(`${API_BASE_URL}${ENDPOINTS.UPLOAD}`, {
            httpMethod: 'POST',
            uploadType: UploadType.MULTIPART,
            fieldName: 'file',
            mimeType: file.type,
          });
          return JSON.parse(result.body) as UploadResult;
        })
      );

      const uploaded: UploadResult[] = [];
      const errors: { name: string; error: string }[] = [];

      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          uploaded.push(r.value);
        } else {
          errors.push({ name: files[i].name, error: r.reason?.message || 'Upload failed' });
        }
      });

      if (errors.length > 0 && uploaded.length === 0) {
        throw new Error(errors.map((e) => `${e.name}: ${e.error}`).join('\n'));
      }

      return { uploaded, errors };
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
