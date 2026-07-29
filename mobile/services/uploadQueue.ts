import { File, UploadType } from 'expo-file-system';
import { apiClient } from '../api/client';
import { API_BASE_URL, ENDPOINTS } from '../constants/api';
import { ApiError, UploadError } from '../types';

export type UploadFile = { uri: string; type: string; name: string };
export type UploadResult = { name: string; id: string };

export type UploadTaskStatus = 'pending' | 'uploading' | 'done' | 'error';

export type UploadTask = {
  id: string;
  file: UploadFile;
  status: UploadTaskStatus;
  progress: number;
  result?: UploadResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type Listener = () => void;

let nextId = 0;
function genId() {
  nextId++;
  return `upload_${Date.now()}_${nextId}`;
}

class UploadQueue {
  private tasks: UploadTask[] = [];
  private listeners = new Set<Listener>();
  private concurrency = 3;
  private active = 0;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;

  getTasks(): UploadTask[] {
    return this.tasks;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  enqueue(files: UploadFile[]) {
    const now = Date.now();
    for (const file of files) {
      this.tasks.push({
        id: genId(),
        file,
        status: 'pending',
        progress: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    this.notify();
    this.processNext();
  }

  cancel(id: string) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || task.status === 'done') return;
    task.status = 'error';
    task.error = 'Annulé';
    task.updatedAt = Date.now();
    this.notify();
  }

  retry(id: string) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || task.status !== 'error') return;
    task.status = 'pending';
    task.progress = 0;
    task.error = undefined;
    task.result = undefined;
    task.updatedAt = Date.now();
    this.notify();
    this.processNext();
  }

  retryAll() {
    for (const task of this.tasks) {
      if (task.status === 'error') {
        task.status = 'pending';
        task.progress = 0;
        task.error = undefined;
        task.result = undefined;
        task.updatedAt = Date.now();
      }
    }
    this.notify();
    this.processNext();
  }

  private processNext() {
    while (this.active < this.concurrency) {
      const next = this.tasks.find((t) => t.status === 'pending');
      if (!next) break;
      this.active++;
      next.status = 'uploading';
      next.updatedAt = Date.now();
      this.notify();
      this.runTask(next);
    }
  }

  private async runTask(task: UploadTask) {
    try {
      const fsFile = new File(task.file.uri);
      const headers: Record<string, string> = {};
      const token = apiClient.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const result = await fsFile.upload(`${API_BASE_URL}${ENDPOINTS.UPLOAD}`, {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType: task.file.type,
        headers,
      });

      if (result.status >= 400) {
        let serverMessage = 'Erreur serveur';
        try {
          const body: ApiError = JSON.parse(result.body);
          serverMessage = body.error?.message || serverMessage;
        } catch {
          serverMessage = result.body || serverMessage;
        }
        throw new UploadError(task.file.name, result.status, serverMessage);
      }

      const body = JSON.parse(result.body);
      const items = body.data ?? body;
      const item = Array.isArray(items) ? items[0] : items;

      task.status = 'done';
      task.progress = 100;
      task.result = item as UploadResult;
      task.updatedAt = Date.now();
      this.notify();
      this.scheduleCleanup();
    } catch (err) {
      task.status = 'error';
      task.error =
        err instanceof UploadError
          ? `${err.fileName} : ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Erreur inconnue';
      task.updatedAt = Date.now();
      this.notify();
    } finally {
      this.active--;
      this.notify();
      this.processNext();
    }
  }

  private scheduleCleanup() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setTimeout(() => {
      this.cleanupTimer = null;
      const now = Date.now();
      const before = this.tasks.length;
      this.tasks = this.tasks.filter(
        (t) => t.status !== 'done' || now - t.updatedAt < 5000,
      );
      if (this.tasks.length !== before) {
        this.notify();
      }
      if (this.tasks.some((t) => t.status === 'done')) {
        this.scheduleCleanup();
      }
    }, 6000);
  }
}

export const uploadQueue = new UploadQueue();
