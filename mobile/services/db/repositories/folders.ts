import { getDatabase } from '../client';
import { newResourceId } from '../id';
import { FOLDER_COLUMNS_SQL } from '../schema';
import { getDeviceUserId } from './preferences';
import type { FolderRow, StoredFolder, SyncStatus } from '../types';

export type SaveFolderInput = {
  uri: string | null;
  name: string;
  exists?: boolean;
  resource_id?: string;
};

export type SaveFolderOptions = {
  parentResourceId?: string | null;
  syncStatus?: SyncStatus;
};

export async function saveFolder(
  input: SaveFolderInput,
  options: SaveFolderOptions = {},
): Promise<StoredFolder> {
  const db = await getDatabase();
  const now = Date.now();
  const exists =
    input.exists === undefined || input.exists === null ? null : input.exists ? 1 : 0;
  const ownerId = await getDeviceUserId();

  const existing = input.uri
    ? await db.getFirstAsync<FolderRow>(
        `SELECT ${FOLDER_COLUMNS_SQL} FROM folders WHERE uri = ?`,
        input.uri,
      )
    : input.resource_id
      ? await db.getFirstAsync<FolderRow>(
          `SELECT ${FOLDER_COLUMNS_SQL} FROM folders WHERE resource_id = ?`,
          input.resource_id,
        )
      : null;

  const resourceId = existing?.resource_id ?? input.resource_id ?? (await newResourceId());
  const baseSync = existing?.sync_status ?? options.syncStatus ?? 'local';

  await db.runAsync(
    `INSERT INTO folders
       (resource_id, uri, name, "exists", parent_resource_id, owner_id, sync_status, added_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(resource_id) DO UPDATE SET
       uri = excluded.uri,
       name = excluded.name,
       "exists" = excluded."exists",
       parent_resource_id = CASE
         WHEN excluded.parent_resource_id IS NULL THEN folders.parent_resource_id
         ELSE excluded.parent_resource_id
       END,
       sync_status = excluded.sync_status,
       updated_at = excluded.updated_at`,
    resourceId,
    input.uri,
    input.name,
    exists,
    options.parentResourceId ?? null,
    ownerId,
    baseSync,
    existing?.added_at ?? now,
    now,
  );

  const row = await db.getFirstAsync<FolderRow>(
    `SELECT ${FOLDER_COLUMNS_SQL} FROM folders WHERE resource_id = ?`,
    resourceId,
  );
  return toStoredFolder(row!);
}

export async function saveDirectory(folder: {
  uri: string;
  name: string;
  exists?: boolean;
}): Promise<StoredFolder> {
  return saveFolder({ uri: folder.uri, name: folder.name, exists: folder.exists });
}

export async function getFolders(): Promise<StoredFolder[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FolderRow>(
    `SELECT ${FOLDER_COLUMNS_SQL} FROM folders ORDER BY name ASC`,
  );
  return rows.map(toStoredFolder);
}

export async function getFolderFolders(
  parentResourceId: string | null,
): Promise<StoredFolder[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FolderRow>(
    `SELECT ${FOLDER_COLUMNS_SQL} FROM folders WHERE parent_resource_id IS ? ORDER BY name ASC`,
    parentResourceId,
  );
  return rows.map(toStoredFolder);
}

export async function getFolder(resourceId: string): Promise<StoredFolder | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<FolderRow>(
    `SELECT ${FOLDER_COLUMNS_SQL} FROM folders WHERE resource_id = ?`,
    resourceId,
  );
  return row ? toStoredFolder(row) : null;
}

export async function removeFolder(resourceId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM folders WHERE resource_id = ?', resourceId);
}

function toStoredFolder(row: FolderRow): StoredFolder {
  return {
    resource_id: row.resource_id,
    uri: row.uri,
    name: row.name,
    exists: row.exists === 1,
    parent_resource_id: row.parent_resource_id,
    owner_id: row.owner_id,
    syncStatus: row.sync_status,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}