import { getDatabase } from '../client';
import { FOLDER_COLUMNS_SQL } from '../schema';
import type { Folder, FolderContext, FolderRow, SyncStatus } from '../types';

type SaveFolderOptions = {
  parentUri?: string;
  syncStatus?: SyncStatus;
};

export async function saveFolder(
  folder: Folder,
  options?: SaveFolderOptions,
): Promise<void> {
  const db = await getDatabase();
  const exists = folder.exists === undefined ? null : folder.exists ? 1 : 0;

  await db.runAsync(
    `INSERT INTO folders (uri, name, "exists", sync_status, added_at, parent_uri)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(uri) DO UPDATE SET
       name = excluded.name, "exists" = excluded."exists", sync_status = excluded.sync_status`,
    folder.uri,
    folder.name,
    exists,
    options?.syncStatus ?? 'local',
    Date.now(),
    options?.parentUri ?? null,
  );
}

export async function saveDirectory(folder: Folder): Promise<boolean> {
  await saveFolder(folder);
  return true;
}

export async function getFolders(): Promise<FolderContext[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FolderRow>(
    `SELECT ${FOLDER_COLUMNS_SQL} FROM folders ORDER BY added_at ASC, name ASC`,
  );
  return rows.map(toFolderContext);
}

export async function getFolderFolders(parentUri: string): Promise<FolderContext[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FolderRow>(
    `SELECT ${FOLDER_COLUMNS_SQL} FROM folders WHERE parent_uri = ? ORDER BY name ASC`,
    parentUri,
  );
  return rows.map(toFolderContext);
}

export async function removeFolder(uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM folders WHERE uri = ?', uri);
}

function toFolderContext(row: FolderRow): FolderContext {
  return {
    syncStatus: row.sync_status,
    addedAt: row.added_at,
    folder: {
      uri: row.uri,
      name: row.name,
      isDirectory: true,
      exists: row.exists === null ? undefined : row.exists === 1,
    },
  };
}