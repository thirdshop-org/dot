import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { fileStore } from '../services/fileStore';
import { useOcrDone } from '../contexts/SseContext';

export type OcrPollResult = { resourceId: string; status: 'completed' | 'failed' | 'timeout' };

type OcrState = Record<string, { resolve: (res: OcrPollResult) => void; timeout: ReturnType<typeof setTimeout> }>;

let globalOcrState: OcrState = {};
let globalSetState: React.Dispatch<React.SetStateAction<number>> | null = null;

function handleOcrDone(resourceId: string) {
  const entry = globalOcrState[resourceId];
  if (!entry) return;
  clearTimeout(entry.timeout);

  apiClient
    .get<{ data: { ocrText?: string } }>(`${ENDPOINTS.RESOURCES}/${resourceId}`)
    .then((detail) => {
      const ocrText = detail.data?.ocrText;
      if (ocrText) {
        fileStore.updatePartial(resourceId, { ocrText });
      }
      entry.resolve({ resourceId, status: 'completed' });
    })
    .catch(() => {
      entry.resolve({ resourceId, status: 'failed' });
    })
    .finally(() => {
      delete globalOcrState[resourceId];
      globalSetState?.(Date.now());
    });
}

export function SseOcrListener() {
  const { onOcrDone } = useOcrDone();

  useEffect(() => {
    const unsub = onOcrDone(handleOcrDone);
    return unsub;
  }, [onOcrDone]);

  return null;
}

export function usePollOcr() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    globalSetState = forceUpdate;
    return () => {
      globalSetState = null;
    };
  }, []);

  const pollOcr = useCallback(async (resourceId: string): Promise<OcrPollResult> => {
    const existing = globalOcrState[resourceId];
    if (existing) {
      return new Promise((resolve) => existing.resolve = resolve);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        delete globalOcrState[resourceId];
        resolve({ resourceId, status: 'timeout' });
      }, 120_000);

      globalOcrState[resourceId] = { resolve, timeout };
      globalSetState?.(Date.now());
    });
  }, []);

  return { pollOcr };
}
