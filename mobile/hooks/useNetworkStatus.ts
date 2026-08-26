import { useSyncExternalStore, useRef } from 'react';
import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';

type Listener = () => void;

let state: NetInfoState | null = null;
const listeners = new Set<Listener>();
let subscription: NetInfoSubscription | null = null;

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): boolean {
  return state?.isConnected ?? true;
}

function initIfNeeded() {
  if (subscription) return;
  NetInfo.fetch().then((info) => {
    state = info;
    listeners.forEach((l) => l());
  });
  subscription = NetInfo.addEventListener((info) => {
    state = info;
    listeners.forEach((l) => l());
  });
}

export interface NetworkStatus {
  isOnline: boolean;
  isWifi: boolean;
  isCellular: boolean;
  connectionType: string;
  isInternetReachable: boolean | null;
}

export function useNetworkStatus(): NetworkStatus {
  const mountRef = useRef(false);
  if (!mountRef.current) {
    initIfNeeded();
    mountRef.current = true;
  }

  const isConnected = useSyncExternalStore(subscribe, getSnapshot);

  return {
    isOnline: isConnected,
    isWifi: state?.type === 'wifi',
    isCellular: state?.type === 'cellular',
    connectionType: state?.type ?? 'unknown',
    isInternetReachable: state?.isInternetReachable ?? null,
  };
}
