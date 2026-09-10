import { getSession } from '../session';
import { getActiveUserId } from './preferences';
import type {
  NewPendingOperation,
  PendingOperation,
  PendingOperationRow,
  PendingOperationStatus,
} from '../types';

const PENDING_OPERATION_COLUMNS = `
  id, resource_id, resource_type, ref_type, ref_id, operation, payload,
  status, attempts, error, created_at, next_retry_at, last_error_at`;

const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;
const BASE_BACKOFF_MS = 30 * 1000;

export const MAX_PENDING_ATTEMPTS = 5;

export async function enqueuePendingOperation(
  operation: NewPendingOperation,
): Promise<number> {
  const db = await getSession();
  const activeUserId = await getActiveUserId();
  const row = await db.getFirstAsync<{ id: number }>(
    `INSERT INTO pending_operations
       (resource_id, resource_type, ref_type, ref_id, operation, payload, status, attempts, created_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
     RETURNING id`,
    operation.resourceId ?? null,
    operation.resourceType ?? null,
    operation.refType ?? null,
    operation.refId ?? null,
    operation.operation,
    JSON.stringify(operation.payload ?? {}),
    Date.now(),
    activeUserId,
  );
  return row!.id;
}

export async function getPendingOperations(
  status?: PendingOperationStatus,
): Promise<PendingOperation[]> {
  const db = await getSession();
  const rows = status
    ? await db.getAllAsync<PendingOperationRow>(
        `SELECT ${PENDING_OPERATION_COLUMNS} FROM pending_operations
         WHERE status = ? AND (user_id = ? OR user_id IS NULL)
         ORDER BY created_at ASC, id ASC`,
        status,
        await getActiveUserId(),
      )
    : await db.getAllAsync<PendingOperationRow>(
        `SELECT ${PENDING_OPERATION_COLUMNS} FROM pending_operations
         WHERE user_id = ? OR user_id IS NULL
         ORDER BY created_at ASC, id ASC`,
        await getActiveUserId(),
      );
  return rows.map(toPendingOperation);
}

export async function getNextQueuedOperation(): Promise<PendingOperation | null> {
  const db = await getSession();
  const row = await db.getFirstAsync<PendingOperationRow>(
    `SELECT ${PENDING_OPERATION_COLUMNS} FROM pending_operations
     WHERE status = 'pending'
       AND (user_id = ? OR user_id IS NULL)
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY created_at ASC, id ASC
     LIMIT 1`,
    await getActiveUserId(),
    Date.now(),
  );
  return row ? toPendingOperation(row) : null;
}

// Même chose mais en batch (tri FIFO identique) — utilisé par pushPendingOps.
export async function listQueuedOperations(limit: number): Promise<PendingOperation[]> {
  if (limit <= 0) return [];
  const db = await getSession();
  const rows = await db.getAllAsync<PendingOperationRow>(
    `SELECT ${PENDING_OPERATION_COLUMNS} FROM pending_operations
     WHERE status = 'pending'
       AND (user_id = ? OR user_id IS NULL)
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY created_at ASC, id ASC
     LIMIT ?`,
    await getActiveUserId(),
    Date.now(),
    limit,
  );
  return rows.map(toPendingOperation);
}

// Reporter des opérations sans incrémenter attempts (utilisé en cas d'erreur
// transitoire réseau/serveur, pour éviter les dead-letters prématurées).
export async function scheduleRetries(ids: number[], retryAt: number): Promise<void> {
  const db = await getSession();
  const now = Date.now();
  for (const id of ids) {
    await db.runAsync(
      `UPDATE pending_operations SET next_retry_at = ?, last_error_at = ? WHERE id = ?`,
      retryAt,
      now,
      id,
    );
  }
}

export async function markPendingOperation(
  id: number,
  status: PendingOperationStatus,
  error?: string | null,
): Promise<void> {
  const db = await getSession();
  const now = Date.now();

  if (status === 'failed') {
    const current = await db.getFirstAsync<{ attempts: number }>(
      'SELECT attempts FROM pending_operations WHERE id = ?',
      id,
    );
    if (!current) return;
    const attempts = current.attempts + 1;
    if (attempts >= MAX_PENDING_ATTEMPTS) {
      await db.runAsync(
        `UPDATE pending_operations SET
           status = 'failed', attempts = ?, error = ?, next_retry_at = NULL, last_error_at = ?
         WHERE id = ?`,
        attempts,
        error ?? null,
        now,
        id,
      );
      return;
    }
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
    await db.runAsync(
      `UPDATE pending_operations SET
         status = 'pending', attempts = ?, error = ?, next_retry_at = ?, last_error_at = ?
       WHERE id = ?`,
      attempts,
      error ?? null,
      now + backoff,
      now,
      id,
    );
    return;
  }

  await db.runAsync(
    `UPDATE pending_operations SET status = ?, error = ?, next_retry_at = NULL, last_error_at = NULL WHERE id = ?`,
    status,
    status === 'in_progress' ? null : error ?? null,
    id,
  );
}

function toPendingOperation(row: PendingOperationRow): PendingOperation {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceType: row.resource_type,
    refType: row.ref_type,
    refId: row.ref_id,
    operation: row.operation,
    payload: safeParse(row.payload),
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    createdAt: row.created_at,
    nextRetryAt: row.next_retry_at,
    lastErrorAt: row.last_error_at,
  };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}