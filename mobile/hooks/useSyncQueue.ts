import { useState, useEffect, useCallback } from 'react';
import { createMMKV } from 'react-native-mmkv';
import { fileStore } from '../services/fileStore';

const syncStateStorage = createMMKV({ id: 'vaultdrop-sync-state' });

export function getIsSyncing(): boolean {
  return syncStateStorage.getString('is_syncing') === 'true';
}

export function setIsSyncing(value: boolean) {
  syncStateStorage.set('is_syncing', value ? 'true' : 'false');
}

export function useSyncQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncingState] = useState(() => getIsSyncing());

  const refresh = useCallback(() => {
    const registry = fileStore.getAllLocal();
    let count = 0;

    for (const entry of registry) {
      if (entry.backendId || !entry.localUri) continue;
      if (entry.syncStatus !== 'local' && entry.syncStatus !== 'error') continue;
      count++;
    }

    setPendingCount(count);
    setIsSyncingState(getIsSyncing());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { pendingCount, isSyncing, refresh };
}
