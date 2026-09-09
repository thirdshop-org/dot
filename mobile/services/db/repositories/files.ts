import { getDatabase } from '../client';
import { newResourceId } from '../id';
import { FILE_COLUMNS_SQL } from '../schema';
import { getDeviceUserId } from './preferences';
import type { FileEntry, FileRow, StoredFile, SyncStatus } from '../types';

export type SaveFileOptions = {
  syncStatus?: SyncStatus;
};

export async function saveFile(
  file: FileEntry,
  folderResourceId: string,
  options: SaveFileOptions = {},
): Promise<StoredFile> {
  const db = await getDatabase();
  const now = Date.now();
  const exists = file.exists ? 1 : 0;
  const ownerId = await getDeviceUserId();

  const existing = await db.getFirstAsync<FileRow>(
    `SELECT ${FILE_COLUMNS_SQL} FROM files WHERE uri = ?`,
    file.uri,
  );

  const resourceId = existing?.resource_id ?? (await newResourceId());
  const baseSync = existing?.sync_status ?? options.syncStatus ?? 'local';

  await db.runAsync(
    `INSERT INTO files
       (resource_id, uri, name, folder_resource_id, extension, size, "type", "exists", last_modified, owner_id, sync_status, added_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(resource_id) DO UPDATE SET
       uri = excluded.uri,
       name = excluded.name,
       folder_resource_id = excluded.folder_resource_id,
       extension = excluded.extension,
       size = excluded.size,
       "type" = excluded."type",
       "exists" = excluded."exists",
       last_modified = excluded.last_modified,
       sync_status = excluded.sync_status,
       updated_at = excluded.updated_at`,
    resourceId,
    file.uri,
    file.name,
    folderResourceId,
    file.extension ?? null,
    file.size,
    file.type ?? null,
    exists,
    file.lastModified ?? null,
    ownerId,
    baseSync,
    existing?.added_at ?? now,
    now,
  );

  const row = await db.getFirstAsync<FileRow>(
    `SELECT ${FILE_COLUMNS_SQL} FROM files WHERE resource_id = ?`,
    resourceId,
  );
  return toStoredFile(row!);
}

export async function getFiles(folderResourceId?: string): Promise<StoredFile[]> {
  const db = await getDatabase();
  const rows =
    folderResourceId === undefined
      ? await db.getAllAsync<FileRow>(`SELECT ${FILE_COLUMNS_SQL} FROM files ORDER BY name ASC`)
      : await db.getAllAsync<FileRow>(
          `SELECT ${FILE_COLUMNS_SQL} FROM files WHERE folder_resource_id = ? ORDER BY name ASC`,
          folderResourceId,
        );
  return rows.map(toStoredFile);
}

export async function getFile(resourceId: string): Promise<StoredFile | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<FileRow>(
    `SELECT ${FILE_COLUMNS_SQL} FROM files WHERE resource_id = ?`,
    resourceId,
  );
  return row ? toStoredFile(row) : null;
}

export async function removeFile(resourceId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM files WHERE resource_id = ?', resourceId);
}

function toStoredFile(row: FileRow): StoredFile {
  return {
    resource_id: row.resource_id,
    uri: row.uri,
    name: row.name,
    folder_resource_id: row.folder_resource_id,
    extension: row.extension ?? '',
    exists: row.exists === 1,
    size: row.size,
    type: row.type ?? '',
    lastModified: row.last_modified,
    owner_id: row.owner_id,
    syncStatus: row.sync_status,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}