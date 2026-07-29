import { File, UploadType } from 'expo-file-system';
import { createMMKV } from 'react-native-mmkv';
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

const storage = createMMKV({ id: 'vaultdrop-upload-queue' });
const STORAGE_KEY = 'tasks';

function serialize(task: UploadTask): unknown {
  return {
    id: task.id,
    file: task.file,
    status: task.status,
    progress: task.progress,
    result: task.result ?? null,
    error: task.error ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function deserialize(data: unknown): UploadTask | null {
  const d = data as Record<string, unknown>;
  if (!d || !d.id || !d.file) return null;
  const file = d.file as Record<string, string>;
  if (!file.uri || !file.type || !file.name) return null;
  return {
    id: d.id as string,
    file: { uri: file.uri, type: file.type, name: file.name },
    status: d.status as UploadTaskStatus,
    progress: d.progress as number,
    result: d.result ? (d.result as UploadResult) : undefined,
    error: d.error ? (d.error as string) : undefined,
    createdAt: d.createdAt as number,
    updatedAt: d.updatedAt as number,
  };
}

function saveTasks(tasks: UploadTask[]) {
  const persistable = tasks
    .filter((t) => t.status !== 'done')
    .map(serialize);
  storage.set(STORAGE_KEY, JSON.stringify(persistable));
}

function loadTasks(): UploadTask[] {
  try {
    const raw = storage.getString(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const tasks: UploadTask[] = [];
    let maxId = 0;
    for (const item of parsed) {
      const t = deserialize(item);
      if (t) {
        tasks.push(t);
        const num = parseInt(t.id.replace('upload_', ''), 10);
        if (num > maxId) maxId = num;
      }
    }
    nextId = maxId;
    return tasks;
  } catch {
    return [];
  }
}

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

  constructor() {
    this.tasks = loadTasks();
    const pendingExist = this.tasks.some(
      (t) => t.status === 'pending' || t.status === 'uploading',
    );
    if (pendingExist) {
      setTimeout(() => {
        this.restartUploading();
        this.processNext();
      }, 0);
    }
  }

  private restartUploading() {
    for (const task of this.tasks) {
      if (task.status === 'uploading') {
        task.status = 'pending';
        task.progress = 0;
        task.updatedAt = Date.now();
      }
    }
    this.persist();
  }

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

  private persist() {
    saveTasks(this.tasks);
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
    this.persist();
    this.notify();
    this.processNext();
  }

  cancel(id: string) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || task.status === 'done') return;
    task.status = 'error';
    task.error = 'Annulé';
    task.updatedAt = Date.now();
    this.persist();
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
    this.persist();
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
    this.persist();
    this.notify();
    this.processNext();
  }

  getPendingCount(): number {
    return this.tasks.filter((t) => t.status === 'pending' || t.status === 'uploading').length;
  }

  private processNext() {
    while (this.active < this.concurrency) {
      const next = this.tasks.find((t) => t.status === 'pending');
      if (!next) break;
      this.active++;
      next.status = 'uploading';
      next.updatedAt = Date.now();
      this.persist();
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
      this.persist();
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
      this.persist();
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
        this.persist();
        this.notify();
      }
      if (this.tasks.some((t) => t.status === 'done')) {
        this.scheduleCleanup();
      }
    }, 6000);
  }
}

export const uploadQueue = new UploadQueue();
