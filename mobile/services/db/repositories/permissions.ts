import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from '../client';
import { PERMISSION_TTL_MS } from '../schema';
import { getDeviceUserId } from './preferences';
import type {
  AccessLevel,
  NewResourcePermission,
  ResourcePermission,
  ResourcePermissionRow,
  ResourceType,
} from '../types';

const ACCESS_RANK: Record<AccessLevel, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
  owner: 4,
};

export type AccessSource = 'none' | 'cache' | 'owner' | 'inherited';

export type AccessCheck = {
  allowed: boolean;
  access: AccessLevel | null;
  source: AccessSource;
  stale: boolean;
  expiresAt: number | null;
};

type LineageNode = {
  resource_id: string;
  parent_resource_id: string | null;
  owner_id: string;
};

function rank(level: AccessLevel): number {
  return ACCESS_RANK[level];
}

export async function getResourcePermission(
  resourceId: string,
  resourceType: ResourceType,
): Promise<ResourcePermission | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ResourcePermissionRow>(
    `SELECT * FROM resource_permissions WHERE resource_id = ? AND resource_type = ?`,
    resourceId,
    resourceType,
  );
  return row ? toResourcePermission(row) : null;
}

export async function saveResourcePermission(
  permission: NewResourcePermission,
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO resource_permissions
       (resource_id, resource_type, effective_access, inherit, owner_id, shared_by_id, expires_at, cached_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(resource_id, resource_type) DO UPDATE SET
       effective_access = excluded.effective_access,
       inherit = excluded.inherit,
       owner_id = excluded.owner_id,
       shared_by_id = excluded.shared_by_id,
       expires_at = excluded.expires_at,
       cached_at = excluded.cached_at,
       updated_at = excluded.updated_at`,
    permission.resource_id,
    permission.resourceType,
    permission.effectiveAccess,
    permission.inherit === false ? 0 : 1,
    permission.ownerId ?? null,
    permission.sharedById ?? null,
    permission.expiresAt ?? null,
    now,
    now,
  );
}

async function resourceLineage(
  resourceId: string,
  resourceType: ResourceType,
): Promise<LineageNode[]> {
  const db = await getDatabase();

  const anchor = await db.getFirstAsync<{ folder_resource_id: string }>(
    'SELECT folder_resource_id FROM files WHERE resource_id = ?',
    resourceId,
  );
  if (resourceType === 'file') {
    if (!anchor) return [];
    return folderLineage(db, anchor.folder_resource_id);
  }
  return folderLineage(db, resourceId);
}

async function folderLineage(
  db: SQLiteDatabase,
  startResourceId: string,
): Promise<LineageNode[]> {
  const rows = await db.getAllAsync<LineageNode>(
    `WITH RECURSIVE lineage(resource_id, parent_resource_id, owner_id) AS (
       SELECT resource_id, parent_resource_id, owner_id FROM folders WHERE resource_id = ?
       UNION ALL
       SELECT f.resource_id, f.parent_resource_id, f.owner_id
       FROM folders f
       JOIN lineage l ON f.resource_id = l.parent_resource_id
     )
     SELECT resource_id, parent_resource_id, owner_id FROM lineage`,
    startResourceId,
  );
  return rows;
}

function decideFromPermission(
  permission: ResourcePermission,
  required: AccessLevel,
  now: number,
): AccessCheck {
  if (permission.expiresAt != null && permission.expiresAt < now) {
    return {
      allowed: false,
      access: permission.effectiveAccess,
      source: 'cache',
      stale: false,
      expiresAt: permission.expiresAt,
    };
  }
  const granted = rank(permission.effectiveAccess) >= rank(required);
  return {
    allowed: granted,
    access: permission.effectiveAccess,
    source: 'cache',
    stale: now - permission.cachedAt > PERMISSION_TTL_MS,
    expiresAt: permission.expiresAt,
  };
}

export async function canAccess(
  resourceId: string,
  resourceType: ResourceType,
  required: AccessLevel,
): Promise<AccessCheck> {
  const db = await getDatabase();
  const now = Date.now();
  const deviceUserId = await getDeviceUserId();

  const cached = await getResourcePermission(resourceId, resourceType);
  if (cached) return decideFromPermission(cached, required, now);

  const lineage = await resourceLineage(resourceId, resourceType);
  for (const node of lineage) {
    if (node.owner_id === deviceUserId) {
      return { allowed: true, access: 'owner', source: 'owner', stale: false, expiresAt: null };
    }
    const nodePermission = await getResourcePermission(node.resource_id, 'folder');
    if (nodePermission) {
      const decision = decideFromPermission(nodePermission, required, now);
      if (decision.source === 'cache') {
        return { ...decision, source: 'inherited' };
      }
    }
  }

  return { allowed: false, access: null, source: 'none', stale: false, expiresAt: null };
}

export async function canWrite(
  resourceId: string,
  resourceType: ResourceType,
): Promise<AccessCheck> {
  return canAccess(resourceId, resourceType, 'editor');
}

export async function isOwner(
  resourceId: string,
  resourceType: ResourceType,
): Promise<boolean> {
  const check = await canAccess(resourceId, resourceType, 'owner');
  return check.allowed;
}

function toResourcePermission(row: ResourcePermissionRow): ResourcePermission {
  return {
    resource_id: row.resource_id,
    resourceType: row.resource_type,
    effectiveAccess: row.effective_access,
    inherit: row.inherit === 1,
    ownerId: row.owner_id,
    sharedById: row.shared_by_id,
    expiresAt: row.expires_at,
    cachedAt: row.cached_at,
    updatedAt: row.updated_at,
  };
}