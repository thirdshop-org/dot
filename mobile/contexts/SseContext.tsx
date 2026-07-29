import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from './AuthContext';

type OcrDoneCallback = (resourceId: string) => void;
type ResourceCreatedCallback = (resourceId: string) => void;

interface SseContextValue {
  onOcrDone: (cb: OcrDoneCallback) => () => void;
  onResourceCreated: (cb: ResourceCreatedCallback) => () => void;
}

const SseContext = createContext<SseContextValue>({
  onOcrDone: () => () => {},
  onResourceCreated: () => () => {},
});

export function SseProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const ocrListenersRef = useRef<Set<OcrDoneCallback>>(new Set());
  const resourceListenersRef = useRef<Set<ResourceCreatedCallback>>(new Set());
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
              ocrListenersRef.current.forEach((cb) => cb(data));
            } else if (event === 'resource.created') {
              resourceListenersRef.current.forEach((cb) => cb(data));
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
    ocrListenersRef.current.add(cb);
    return () => {
      ocrListenersRef.current.delete(cb);
    };
  }, []);

  const onResourceCreated = useCallback((cb: ResourceCreatedCallback) => {
    resourceListenersRef.current.add(cb);
    return () => {
      resourceListenersRef.current.delete(cb);
    };
  }, []);

  return (
    <SseContext.Provider value={{ onOcrDone, onResourceCreated }}>
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

export function useResourceCreated(onCreated?: ResourceCreatedCallback) {
  const ctx = useContext(SseContext);
  useEffect(() => {
    if (onCreated) return ctx.onResourceCreated(onCreated);
  }, [onCreated, ctx]);
  return { onResourceCreated: ctx.onResourceCreated };
}
