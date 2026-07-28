import { useCallback, useRef } from 'react';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';

export function useSyncPush() {
  const isRunning = useRef(false);

  const push = useCallback(async (locationId: string) => {
    if (isRunning.current) return { pending: 0 };
    isRunning.current = true;

    try {
      const result = await apiClient.post<{ pending: number; message: string }>(ENDPOINTS.SYNC_PUSH, {
        location_id: locationId,
      });
      return { pending: result.pending };
    } finally {
      isRunning.current = false;
    }
  }, []);

  return { push };
}
