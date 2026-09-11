import { api, hasAuthToken, ApiError } from '../api/client';
import type { SyncOperation } from '../api/types';
import {
  getActiveUserId,
  listQueuedOperations,
  markPendingOperation,
  scheduleRetries,
  saveResourcePermission,
  MAX_PENDING_ATTEMPTS,
} from '../services/db';
import type { PendingOperation } from '../services/db/types';

// Nombre max d'opérations par push (pour ne pas dépasser la taille du body).
const SYNC_BATCH_SIZE = 50;

// Délai minimal avant de réessayer un batch complet après une erreur transitoire
// (réseau, proxy, 5xx).  Aucun compteur d'attempts n'est incrémenté pour éviter
// les dead-letters prématurées.
const TRANSIENT_RETRY_MS = 15_000;

function isTransientError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.code === 'NETWORK_ERROR' || error.code.startsWith('HTTP_5')) return true;
  if (error.code.startsWith('HTTP_4')) return false;
  return true;
}

function toSyncOperation(op: PendingOperation): SyncOperation {
  return {
    operation_id: op.id,
    ref_type: op.refType,
    ref_id: op.refId,
    resource_id: op.resourceId ?? '',
    resource_type: op.resourceType ?? 'file',
    operation: op.operation,
    payload: (typeof op.payload === 'object' && op.payload !== null ? op.payload : {}) as Record<string, unknown>,
  };
}

// ---- outbox push -----------------------------------------------------------

export type PushResult = { pushed: number; retried: number };

export async function pushPendingOps(): Promise<PushResult> {
  if (!hasAuthToken()) return { pushed: 0, retried: 0 };

  const queued = await listQueuedOperations(SYNC_BATCH_SIZE);
  if (queued.length === 0) return { pushed: 0, retried: 0 };

  let result;
  try {
    result = (await api.syncOps(queued.map(toSyncOperation))).data;
  } catch (error) {
    if (isTransientError(error)) {
      const retryAt = Date.now() + TRANSIENT_RETRY_MS;
      await scheduleRetries(queued.map((op) => op.id), retryAt);
      return { pushed: 0, retried: queued.length };
    }
    const firstOp = queued[0];
    await markPendingOperation(
      firstOp.id,
      'failed',
      error instanceof ApiError ? `${error.code}: ${error.message}` : String(error),
    );
    return { pushed: 0, retried: 0 };
  }

  // `applied` = INDEX : les opérations [0, applied) sont confirmées côté serveur.
  const applied = Math.min(result.applied, queued.length);
  for (const op of queued.slice(0, applied)) {
    await markPendingOperation(op.id, 'completed');
  }

  if (result.failed && applied < queued.length) {
    const failed = queued[applied];
    await markPendingOperation(failed.id, 'failed', `${result.failed.code}: ${result.failed.message}`);
    // Les opérations [applied+1, length) restent pending : le serveur ne les
    // a pas reçues (il s'arrête à l'index) et elles seront resoumises au
    // prochain tick.
  }

  return { pushed: applied, retried: 0 };
}

// ---- permissions snapshot --------------------------------------------------

// Delta monotone PAR COMPTE (clé = active_user_id, NULL hors compte) : la
// valeur max de cached_at du dernier snapshot sert de borne `after` pour le
// prochain appel. Le snapshot n'est pas rejoué quand on change de compte.
const lastPermissionCachedAtByUser = new Map<string | null, number>();

export async function refreshPermissions(): Promise<number> {
  if (!hasAuthToken()) return 0;
  const activeUserId = await getActiveUserId();
  const after = lastPermissionCachedAtByUser.get(activeUserId) ?? undefined;
  const perms = await api.getSyncPermissions(after);
  if (perms.data.length === 0) return 0;
  for (const p of perms.data) {
    await saveResourcePermission(p);
  }
  lastPermissionCachedAtByUser.set(activeUserId, Math.max(...perms.data.map((p) => p.cachedAt)));
  return perms.data.length;
}

// Visible uniquement pour les tests unitaires (reset de l'état en mémoire).
export function resetPermissionCachedAtForTests(): void {
  lastPermissionCachedAtByUser.clear();
}