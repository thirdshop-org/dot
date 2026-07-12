import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, UploadType } from 'expo-file-system';
import { apiClient } from '../api/client';
import { API_BASE_URL, ENDPOINTS } from '../constants/api';
import { ApiError, OcrJob, UploadError } from '../types';

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

          if (result.status >= 400) {
            let serverMessage = 'Erreur serveur';
            let serverCode: string | undefined;
            try {
              const body: ApiError = JSON.parse(result.body);
              serverMessage = body.error?.message || serverMessage;
              serverCode = body.error?.code;
            } catch {
              serverMessage = result.body || serverMessage;
            }
            throw new UploadError(file.name, result.status, serverMessage, serverCode);
          }

          return JSON.parse(result.body) as UploadResult;
        })
      );

      const uploaded: UploadResult[] = [];
      const errors: UploadError[] = [];

      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          uploaded.push(r.value);
        } else {
          const reason = r.reason;
          if (reason instanceof UploadError) {
            errors.push(reason);
          } else {
            errors.push(new UploadError(files[i].name, 0, reason?.message || 'Upload failed'));
          }
        }
      });

      if (errors.length > 0 && uploaded.length === 0) {
        throw errors[0];
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
