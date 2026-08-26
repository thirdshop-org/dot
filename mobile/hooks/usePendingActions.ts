import { useState, useEffect, useCallback, useSyncExternalStore, useRef } from 'react';
import { actionQueue } from '../services/actionQueue';
import { useNetworkStatus } from './useNetworkStatus';

function subscribe(listener: () => void): () => void {
  return actionQueue.subscribe(listener);
}

function getSnapshot(): number {
  return actionQueue.getPendingCount();
}

export function usePendingActions() {
  const pendingCount = useSyncExternalStore(subscribe, getSnapshot);
  const { isOnline } = useNetworkStatus();
  const wasOffline = useRef(!isOnline);

  useEffect(() => {
    if (isOnline && wasOffline.current && pendingCount > 0) {
      actionQueue.processAll();
    }
    wasOffline.current = !isOnline;
  }, [isOnline, pendingCount]);

  useEffect(() => {
    if (pendingCount > 0 && isOnline) {
      actionQueue.scheduleRetry(5_000);
    }
    return () => actionQueue.cancelSchedule();
  }, [pendingCount, isOnline]);

  return {
    pendingCount,
    isProcessing: actionQueue.isProcessing(),
    processAll: useCallback(() => actionQueue.processAll(), []),
  };
}
