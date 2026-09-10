import type { DbSession } from '../session';
import { getSession } from '../session';
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
  resource_type: ResourceType;
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
  const db = await getSession();
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
  const db = await getSession();
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
  const db = await getSession();

  if (resourceType === 'file') {
    const file = await db.getFirstAsync<{
      folder_resource_id: string;
      owner_id: string;
    }>(
      'SELECT folder_resource_id, owner_id FROM files WHERE resource_id = ?',
      resourceId,
    );
    if (!file) return [];
    return [
      {
        resource_id: resourceId,
        resource_type: 'file',
        parent_resource_id: file.folder_resource_id,
        owner_id: file.owner_id,
      },
      ...(await folderLineage(db, file.folder_resource_id)),
    ];
  }
  return folderLineage(db, resourceId);
}

async function folderLineage(
  db: DbSession,
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
     SELECT resource_id, 'folder' AS resource_type, parent_resource_id, owner_id FROM lineage`,
    startResourceId,
  );
  return rows;
}

function isStale(cachedAt: number, now: number): boolean {
  return now - cachedAt > PERMISSION_TTL_MS;
}

function readOnlyAccess(permission: ResourcePermission, now: number): AccessLevel {
  return isStale(permission.cachedAt, now) ? 'viewer' : permission.effectiveAccess;
}

export async function canAccess(
  resourceId: string,
  resourceType: ResourceType,
  required: AccessLevel,
): Promise<AccessCheck> {
  const now = Date.now();
  const deviceUserId = await getDeviceUserId();

  const exactCache = await getResourcePermission(resourceId, resourceType);
  if (exactCache) {
    if (exactCache.expiresAt != null && exactCache.expiresAt < now) {
      return {
        allowed: false,
        access: exactCache.effectiveAccess,
        source: 'cache',
        stale: false,
        expiresAt: exactCache.expiresAt,
      };
    }
    const stale = isStale(exactCache.cachedAt, now);
    const applyAccess = readOnlyAccess(exactCache, now);
    return {
      allowed: rank(applyAccess) >= rank(required),
      access: applyAccess,
      source: 'cache',
      stale,
      expiresAt: exactCache.expiresAt,
    };
  }

  const lineage = await resourceLineage(resourceId, resourceType);
  let best: {
    access: AccessLevel;
    source: AccessSource;
    stale: boolean;
    expiresAt: number | null;
  } | null = null;

  for (const [index, node] of lineage.entries()) {
    if (node.owner_id === deviceUserId) {
      return { allowed: true, access: 'owner', source: 'owner', stale: false, expiresAt: null };
    }

    const nodePermission = await getResourcePermission(node.resource_id, node.resource_type);
    if (!nodePermission) continue;
    if (nodePermission.expiresAt != null && nodePermission.expiresAt < now) continue;
    if (index > 0 && nodePermission.inherit === false) continue;

    const stale = isStale(nodePermission.cachedAt, now);
    const candidate = {
      access: readOnlyAccess(nodePermission, now),
      source: (index === 0 ? 'cache' : 'inherited') as AccessSource,
      stale,
      expiresAt: nodePermission.expiresAt,
    };
    if (
      !best ||
      rank(candidate.access) > rank(best.access) ||
      (rank(candidate.access) === rank(best.access) && !candidate.stale && best.stale)
    ) {
      best = candidate;
    }
  }

  if (!best) {
    return { allowed: false, access: null, source: 'none', stale: false, expiresAt: null };
  }
  return {
    allowed: rank(best.access) >= rank(required),
    access: best.access,
    source: best.source,
    stale: best.stale,
    expiresAt: best.expiresAt,
  };
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