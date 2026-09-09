import { getDatabase } from '../client';
import { FILE_COLUMNS_SQL } from '../schema';
import type { FileEntry, FileRow, StoredFile } from '../types';

export async function saveFile(file: FileEntry, folderUri: string): Promise<void> {
  const db = await getDatabase();
  const exists = file.exists ? 1 : 0;

  await db.runAsync(
    `INSERT INTO files (uri, name, folder_uri, extension, size, "type", "exists", last_modified, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(uri) DO UPDATE SET
       name = excluded.name, folder_uri = excluded.folder_uri, extension = excluded.extension,
       size = excluded.size, "type" = excluded."type", "exists" = excluded."exists",
       last_modified = excluded.last_modified`,
    file.uri,
    file.name,
    folderUri,
    file.extension ?? null,
    file.size,
    file.type ?? null,
    exists,
    file.lastModified,
    Date.now(),
  );
}

export async function getFiles(folderUri?: string): Promise<StoredFile[]> {
  const db = await getDatabase();
  const rows = folderUri
    ? await db.getAllAsync<FileRow>(
        `SELECT ${FILE_COLUMNS_SQL} FROM files WHERE folder_uri = ? ORDER BY name ASC`,
        folderUri,
      )
    : await db.getAllAsync<FileRow>(
        `SELECT ${FILE_COLUMNS_SQL} FROM files ORDER BY name ASC`,
      );
  return rows.map(toStoredFile);
}

export async function removeFile(uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM files WHERE uri = ?', uri);
}

function toStoredFile(row: FileRow): StoredFile {
  return {
    uri: row.uri,
    name: row.name,
    isDirectory: false,
    extension: row.extension ?? '',
    exists: row.exists === 1,
    size: row.size,
    type: row.type ?? '',
    lastModified: row.last_modified,
    folderUri: row.folder_uri,
    syncStatus: row.sync_status,
    addedAt: row.added_at,
  };
}