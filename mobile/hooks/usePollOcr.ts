import { useCallback, useRef } from 'react';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { fileStore } from '../services/fileStore';

const MAX_POLL_MS = 120_000;
const POLL_INTERVAL = 3_000;

export type OcrPollResult = { resourceId: string; status: 'completed' | 'failed' | 'timeout' };

export function usePollOcr() {
  const running = useRef<Set<string>>(new Set());

  const pollOcr = useCallback(async (resourceId: string): Promise<OcrPollResult> => {
    if (running.current.has(resourceId)) return { resourceId, status: 'failed' };
    running.current.add(resourceId);

    const start = Date.now();
    try {
      while (Date.now() - start < MAX_POLL_MS) {
        try {
          const detail = await apiClient.get<{ data: { ocrText?: string } }>(
            `${ENDPOINTS.RESOURCES}/${resourceId}`,
          );
          const ocrText = detail.data?.ocrText;
          if (ocrText && ocrText.length > 0) {
            fileStore.updatePartial(resourceId, { ocrText });
            return { resourceId, status: 'completed' };
          }
        } catch {
          return { resourceId, status: 'failed' };
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }
      return { resourceId, status: 'timeout' };
    } finally {
      running.current.delete(resourceId);
    }
  }, []);

  return { pollOcr };
}
