import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_UPLOAD_TASK = 'BACKGROUND_UPLOAD';

TaskManager.defineTask(BACKGROUND_UPLOAD_TASK, async () => {
  try {
    const { uploadQueue } = await import('./uploadQueue');
    const { actionQueue } = await import('./actionQueue');
    const { apiClient } = await import('../api/client');
    const { tokenStorage } = await import('../api/secureStorage');

    const pendingUploads = uploadQueue.getPendingCount();
    const pendingActions = actionQueue.getPendingCount();
    if (pendingUploads === 0 && pendingActions === 0) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const token = await tokenStorage.getAccessToken();
    if (!token) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    apiClient.setAccessToken(token);

    if (pendingUploads > 0) {
      uploadQueue.retryAll();
    }
    if (pendingActions > 0) {
      actionQueue.processAll();
    }

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (uploadQueue.getPendingCount() === 0 && actionQueue.getPendingCount() === 0) {
          clearInterval(check);
          resolve();
        }
      }, 1000);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 25000);
    });

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

let isRegistered = false;

export async function registerBackgroundUpload() {
  if (isRegistered) return;
  isRegistered = true;

  const status = await BackgroundTask.getStatusAsync();

  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
    console.warn('[BackgroundUpload] Permission refusée');
    return;
  }

  await BackgroundTask.registerTaskAsync(BACKGROUND_UPLOAD_TASK, {
    minimumInterval: 15,
  });

  console.log('[BackgroundUpload] Enregistré (intervalle: 15min)');
}
