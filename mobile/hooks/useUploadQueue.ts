import { useSyncExternalStore } from 'react';
import { uploadQueue, UploadFile } from '../services/uploadQueue';

export function useUploadQueue() {
  const tasks = useSyncExternalStore(
    uploadQueue.subscribe.bind(uploadQueue),
    uploadQueue.getTasks.bind(uploadQueue),
  );

  return {
    tasks,
    enqueue: (files: UploadFile[]) => uploadQueue.enqueue(files),
    cancel: (id: string) => uploadQueue.cancel(id),
    retry: (id: string) => uploadQueue.retry(id),
    retryAll: () => uploadQueue.retryAll(),
  };
}
