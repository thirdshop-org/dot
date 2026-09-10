import { getSession } from '../session';
import type { NewShareLink, ResourceType, ShareLink, ShareLinkRow } from '../types';

const PUSH_STATUS_SQL = `(
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pending_operations p
      WHERE p.ref_type = 'share_link' AND p.ref_id = sl.id AND p.status IN ('pending', 'in_progress')
    ) THEN 'pending'
    WHEN EXISTS (
      SELECT 1 FROM pending_operations p
      WHERE p.ref_type = 'share_link' AND p.ref_id = sl.id AND p.status = 'failed'
    ) THEN 'failed'
    ELSE 'synced'
  END
) AS push_status`;

export async function createShareLink(input: NewShareLink): Promise<ShareLink> {
  const db = await getSession();
  const now = Date.now();

  let token = input.token;
  if (!token) {
    const tokenRow = await db.getFirstAsync<{ token: string }>(
      'SELECT lower(hex(randomblob(16))) AS token',
    );
    token = tokenRow!.token;
  }

  const row = await db.getFirstAsync<{ id: number }>(
    `INSERT INTO share_links
       (token, resource_id, resource_type, has_password, allow_download, expires_at, max_downloads, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    token,
    input.resourceId,
    input.resourceType,
    input.hasPassword ? 1 : 0,
    input.allowDownload === false ? 0 : 1,
    input.expiresAt ?? null,
    input.maxDownloads ?? null,
    now,
    now,
  );

  const created = await getShareLinkById(row!.id);
  if (!created) throw new Error('share link insert failed');
  return created;
}

export async function getShareLinkById(id: number): Promise<ShareLink | null> {
  const db = await getSession();
  const row = await db.getFirstAsync<ShareLinkRow & { push_status: ShareLink['pushStatus'] }>(
    `SELECT sl.*, ${PUSH_STATUS_SQL} FROM share_links sl WHERE sl.id = ?`,
    id,
  );
  return row ? toShareLink(row) : null;
}

export async function getShareLinkByToken(token: string): Promise<ShareLink | null> {
  const db = await getSession();
  const row = await db.getFirstAsync<ShareLinkRow & { push_status: ShareLink['pushStatus'] }>(
    `SELECT sl.*, ${PUSH_STATUS_SQL} FROM share_links sl WHERE sl.token = ?`,
    token,
  );
  return row ? toShareLink(row) : null;
}

export async function getShareLinks(
  resourceId?: string,
  resourceType?: ResourceType,
): Promise<ShareLink[]> {
  const db = await getSession();
  let sql = `SELECT sl.*, ${PUSH_STATUS_SQL} FROM share_links sl`;
  const params: string[] = [];
  if (resourceId) {
    sql += ' WHERE sl.resource_id = ?';
    params.push(resourceId);
    if (resourceType) {
      sql += ' AND sl.resource_type = ?';
      params.push(resourceType);
    }
  }
  sql += ' ORDER BY sl.created_at ASC';
  const rows = await db.getAllAsync<ShareLinkRow & { push_status: ShareLink['pushStatus'] }>(sql, ...params);
  return rows.map(toShareLink);
}

export async function incrementLinkDownloads(id: number): Promise<void> {
  const db = await getSession();
  await db.runAsync(
    `UPDATE share_links SET downloads_count = downloads_count + 1, updated_at = ? WHERE id = ?`,
    Date.now(),
    id,
  );
}

export async function revokeShareLink(id: number): Promise<void> {
  const db = await getSession();
  await db.runAsync(
    `UPDATE share_links SET is_revoked = 1, updated_at = ? WHERE id = ?`,
    Date.now(),
    id,
  );
}

export async function removeShareLinksForResource(
  resourceId: string,
  resourceType: ResourceType,
): Promise<void> {
  const db = await getSession();
  await db.runAsync('DELETE FROM share_links WHERE resource_id = ? AND resource_type = ?', resourceId, resourceType);
}

function toShareLink(row: ShareLinkRow & { push_status: ShareLink['pushStatus'] }): ShareLink {
  return {
    id: row.id,
    token: row.token,
    resourceId: row.resource_id,
    resourceType: row.resource_type,
    hasPassword: row.has_password === 1,
    allowDownload: row.allow_download === 1,
    expiresAt: row.expires_at,
    maxDownloads: row.max_downloads,
    downloadsCount: row.downloads_count,
    isRevoked: row.is_revoked === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pushStatus: row.push_status,
  };
}