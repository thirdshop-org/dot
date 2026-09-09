import { getDatabase } from '../client';
import type { NewShare, ResourceType, Share, ShareRow } from '../types';

const PUSH_STATUS_SQL = `(
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pending_operations p
      WHERE p.ref_type = 'share' AND p.ref_id = s.id AND p.status IN ('pending', 'in_progress')
    ) THEN 'pending'
    WHEN EXISTS (
      SELECT 1 FROM pending_operations p
      WHERE p.ref_type = 'share' AND p.ref_id = s.id AND p.status = 'failed'
    ) THEN 'failed'
    ELSE 'synced'
  END
) AS push_status`;

export async function saveShare(share: NewShare): Promise<Share> {
  const db = await getDatabase();
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO shares
       (resource_id, resource_type, recipient_type, recipient_id, relation, inherit, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(resource_id, resource_type, recipient_type, recipient_id) DO UPDATE SET
       relation = excluded.relation,
       inherit = excluded.inherit,
       expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`,
    share.resourceId,
    share.resourceType,
    share.recipientType,
    share.recipientId,
    share.relation,
    share.inherit === false ? 0 : 1,
    share.expiresAt ?? null,
    now,
    now,
  );

  const row = await db.getFirstAsync<ShareRow & { push_status: Share['pushStatus'] }>(
    `SELECT s.*, ${PUSH_STATUS_SQL} FROM shares s
     WHERE s.resource_id = ? AND s.resource_type = ? AND s.recipient_type = ? AND s.recipient_id = ?`,
    share.resourceId,
    share.resourceType,
    share.recipientType,
    share.recipientId,
  );
  return toShare(row!);
}

export async function getShare(
  resourceId: string,
  resourceType: ResourceType,
  recipientType: 'user' | 'group',
  recipientId: string,
): Promise<Share | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ShareRow & { push_status: Share['pushStatus'] }>(
    `SELECT s.*, ${PUSH_STATUS_SQL} FROM shares s
     WHERE s.resource_id = ? AND s.resource_type = ? AND s.recipient_type = ? AND s.recipient_id = ?`,
    resourceId,
    resourceType,
    recipientType,
    recipientId,
  );
  return row ? toShare(row) : null;
}

export async function getShares(
  resourceId?: string,
  resourceType?: ResourceType,
): Promise<Share[]> {
  const db = await getDatabase();
  let sql = `SELECT s.*, ${PUSH_STATUS_SQL} FROM shares s`;
  const params: string[] = [];
  if (resourceId) {
    sql += ' WHERE s.resource_id = ?';
    params.push(resourceId);
    if (resourceType) {
      sql += ' AND s.resource_type = ?';
      params.push(resourceType);
    }
  }
  sql += ' ORDER BY s.created_at ASC';
  const rows = await db.getAllAsync<ShareRow & { push_status: Share['pushStatus'] }>(sql, ...params);
  return rows.map(toShare);
}

export async function removeShare(
  resourceId: string,
  resourceType: ResourceType,
  recipientType: 'user' | 'group',
  recipientId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM shares
     WHERE resource_id = ? AND resource_type = ? AND recipient_type = ? AND recipient_id = ?`,
    resourceId,
    resourceType,
    recipientType,
    recipientId,
  );
}

export async function removeSharesForResource(
  resourceId: string,
  resourceType: ResourceType,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM shares WHERE resource_id = ? AND resource_type = ?', resourceId, resourceType);
}

function toShare(row: ShareRow & { push_status: Share['pushStatus'] }): Share {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceType: row.resource_type,
    recipientType: row.recipient_type,
    recipientId: row.recipient_id,
    relation: row.relation,
    inherit: row.inherit === 1,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pushStatus: row.push_status,
  };
}