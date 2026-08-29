import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';
import { fileStore } from '../services/fileStore';

export type SyncProgress = {
  files: Array<{ id: string; name: string }>;
  currentIndex: number;
} | null;

const syncStateStorage = createMMKV({ id: 'vaultdrop-sync-state' });
const PROGRESS_KEY = 'sync_progress';

let syncRunning = false;
let cancelRequested = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function getIsSyncing(): boolean {
  return syncStateStorage.getString('is_syncing') === 'true';
}

export function setIsSyncing(value: boolean) {
  syncStateStorage.set('is_syncing', value ? 'true' : 'false');
  notify();
}

export function getSyncProgress(): SyncProgress {
  return parseProgress(syncStateStorage.getString(PROGRESS_KEY));
}

function parseProgress(raw: string | undefined): SyncProgress {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { files: Array<{ id: string; name: string }>; currentIndex: number };
    if (!parsed || !Array.isArray(parsed.files)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setSyncProgress(value: SyncProgress) {
  if (value === null) {
    syncStateStorage.remove(PROGRESS_KEY);
  } else {
    syncStateStorage.set(PROGRESS_KEY, JSON.stringify(value));
  }
  notify();
}

export function isSyncLoopRunning(): boolean {
  return syncRunning;
}

export function setSyncLoopRunning(value: boolean) {
  syncRunning = value;
}

export function requestSyncCancel() {
  cancelRequested = true;
}

export function isSyncCancelRequested(): boolean {
  return cancelRequested;
}

export function consumeSyncCancel(): boolean {
  const value = cancelRequested;
  cancelRequested = false;
  return value;
}

export function resetSyncState() {
  syncStateStorage.remove('is_syncing');
  syncStateStorage.remove(PROGRESS_KEY);
  syncRunning = false;
  cancelRequested = false;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let cachedIsSyncing = getIsSyncing();
let lastIsSyncingRaw: string | undefined;

function getIsSyncingSnapshot(): boolean {
  const raw = syncStateStorage.getString('is_syncing');
  if (raw !== lastIsSyncingRaw) {
    lastIsSyncingRaw = raw;
    cachedIsSyncing = raw === 'true';
  }
  return cachedIsSyncing;
}

let cachedProgress = getSyncProgress();
let lastProgressRaw: string | undefined;

function getSyncProgressSnapshot(): SyncProgress {
  const raw = syncStateStorage.getString(PROGRESS_KEY);
  if (raw !== lastProgressRaw) {
    lastProgressRaw = raw;
    cachedProgress = parseProgress(raw);
  }
  return cachedProgress;
}

export function useSyncQueue() {
  const isSyncing = useSyncExternalStore(subscribe, getIsSyncingSnapshot, getIsSyncingSnapshot);
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(() => {
    setPendingCount(fileStore.countPendingSync());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { pendingCount, isSyncing, refresh };
}

export function useSyncProgress() {
  const syncProgress = useSyncExternalStore(subscribe, getSyncProgressSnapshot, getSyncProgressSnapshot);
  return { syncProgress };
}