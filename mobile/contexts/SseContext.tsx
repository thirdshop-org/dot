import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from './AuthContext';

type OcrDoneCallback = (resourceId: string) => void;

interface SseContextValue {
  onOcrDone: (cb: OcrDoneCallback) => () => void;
}

const SseContext = createContext<SseContextValue>({
  onOcrDone: () => () => {},
});

export function SseProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const listenersRef = useRef<Set<OcrDoneCallback>>(new Set());
  const cancelRef = useRef<() => void>(() => {});
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (!user) return;

    let cancelled = false;

    const start = async () => {
      try {
        const cancel = await apiClient.subscribeEvents(
          (event, data) => {
            if (event === 'ocr_done') {
              listenersRef.current.forEach((cb) => cb(data));
            }
          },
          () => {
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
          },
        );
        if (cancelled) {
          cancel();
        } else {
          cancelRef.current = cancel;
        }
      } catch {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    start();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      cancelRef.current();
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);

  const onOcrDone = useCallback((cb: OcrDoneCallback) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  return (
    <SseContext.Provider value={{ onOcrDone }}>
      {children}
    </SseContext.Provider>
  );
}

export function useOcrDone(onDone?: OcrDoneCallback) {
  const ctx = useContext(SseContext);
  useEffect(() => {
    if (onDone) return ctx.onOcrDone(onDone);
  }, [onDone, ctx]);
  return { onOcrDone: ctx.onOcrDone };
}
