import { fileStore } from './fileStore';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { HttpError } from '../types';
import type { PendingAction, PendingActionType } from '../types';

type Listener = () => void;

const MAX_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 2000;

function genId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function executeAction(action: PendingAction): Promise<void> {
  const { type, payload, resourceId } = action;

  switch (type) {
    case 'tag_add': {
      const { fileId, tags } = payload as { fileId: string; tags: string[] };
      await apiClient.post(`${ENDPOINTS.RESOURCES}/${fileId}/tags`, { tags });
      break;
    }
    case 'delete': {
      const { backendId } = payload as { backendId: string };
      try {
        await apiClient.delete(`${ENDPOINTS.RESOURCES}/${backendId}`);
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) {
          break;
        }
        throw err;
      }
      break;
    }
    case 'move': {
      const { resourceIds, parentResourceId } = payload as { resourceIds: string[]; parentResourceId: string | null };
      await apiClient.post(ENDPOINTS.MOVE, { resource_ids: resourceIds, parent_resource_id: parentResourceId });
      break;
    }
    case 'create_folder': {
      const { name, parentResourceId } = payload as { name: string; parentResourceId?: string };
      await apiClient.post(ENDPOINTS.FOLDERS, { name, parent_resource_id: parentResourceId });
      break;
    }
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

class ActionQueue {
  private processing = false;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  enqueue(type: PendingActionType, payload: Record<string, unknown>, resourceId?: string): PendingAction {
    const action: PendingAction = {
      id: genId(),
      type,
      payload,
      status: 'pending',
      attempts: 0,
      lastError: null,
      resourceId: resourceId ?? null,
      createdAt: new Date().toISOString(),
    };
    fileStore.insertPendingAction(action);
    this.notify();
    return action;
  }

  async processNext(): Promise<boolean> {
    const pending = fileStore.getPendingActions();
    if (pending.length === 0) return false;

    const action = pending[0];

    // Check if a prior delete makes this action obsolete
    if (action.type !== 'delete' && action.resourceId) {
      const priorDelete = fileStore.getPendingActions().find(
        (a) => a.type === 'delete' && a.resourceId === action.resourceId && a.createdAt < action.createdAt
      );
      if (priorDelete) {
        fileStore.markPendingActionObsolete(action.id);
        this.notify();
        return true;
      }
    }

    try {
      await executeAction(action);
      fileStore.markPendingActionDone(action.id);
      this.notify();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fileStore.markPendingActionError(action.id, msg);

      if (action.attempts + 1 >= MAX_ATTEMPTS) {
        fileStore.markPendingActionObsolete(action.id);
      }

      this.notify();
      return false;
    }
  }

  async processAll(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      let hasMore = true;
      while (hasMore) {
        const pending = fileStore.getPendingActions();
        if (pending.length === 0) break;

        const success = await this.processNext();
        if (!success) {
          // Wait before retrying on error
          await new Promise((r) => setTimeout(r, BASE_RETRY_DELAY_MS));
          // Check if there are still pending actions (not just the one we failed on)
          const remaining = fileStore.getPendingActions();
          if (remaining.length === 0 || remaining[0].status !== 'pending') break;
        }
      }
    } finally {
      this.processing = false;
      fileStore.clearDonePendingActions();
      this.notify();
    }
  }

  isProcessing(): boolean {
    return this.processing;
  }

  getPendingCount(): number {
    return fileStore.getPendingActionsCount();
  }

  scheduleRetry(delayMs: number = 10_000) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.processAll();
    }, delayMs);
  }

  cancelSchedule() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export const actionQueue = new ActionQueue();
