import { useCallback, useRef } from 'react';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { SyncQueueItem } from '../types';

export function useSyncPull() {
  const isRunning = useRef(false);

  const pull = useCallback(async (locationId?: string) => {
    if (isRunning.current) return { items: [] };
    isRunning.current = true;

    try {
      const body = locationId ? { location_id: locationId } : {};
      const result = await apiClient.post<SyncQueueItem[]>(ENDPOINTS.SYNC_PULL, body);
      return { items: result };
    } finally {
      isRunning.current = false;
    }
  }, []);

  return { pull };
}
