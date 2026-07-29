import React, { useEffect } from 'react';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { fileStore } from '../services/fileStore';
import { useOcrDone } from '../contexts/SseContext';

function handleOcrDone(resourceId: string) {
  apiClient
    .get<{ data: { ocrText?: string } }>(`${ENDPOINTS.RESOURCES}/${resourceId}`)
    .then((detail) => {
      const ocrText = detail.data?.ocrText;
      if (ocrText) {
        fileStore.updatePartial(resourceId, { ocrText });
      }
    })
    .catch(() => {});
}

export function SseOcrListener() {
  const { onOcrDone } = useOcrDone();

  useEffect(() => {
    const unsub = onOcrDone(handleOcrDone);
    return unsub;
  }, [onOcrDone]);

  return null;
}
