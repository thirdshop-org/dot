import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { eq, like, or, and, desc, asc, sql, isNull } from 'drizzle-orm';
import { files, fileTags, deletedFiles } from './schema';
import type { Tag } from '../../types';

const DB_NAME = 'vaultdrop.db';

let _db: ReturnType<typeof drizzle> | null = null;
let _sqliteDb: SQLite.SQLiteDatabase | null = null;

export function initDB() {
  if (_db) return _db;
  _sqliteDb = SQLite.openDatabaseSync(DB_NAME);
  _sqliteDb.execSync('PRAGMA journal_mode = WAL;');
  _sqliteDb.execSync('PRAGMA foreign_keys = ON;');
  _db = drizzle(_sqliteDb);

  _sqliteDb.execSync(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      backend_id TEXT,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'cloud',
      local_uri TEXT,
      sync_status TEXT NOT NULL DEFAULT 'cloud',
      parent_file_id TEXT,
      is_folder INTEGER NOT NULL DEFAULT 0,
      ocr_text TEXT,
      thumbnail_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_synced_at TEXT
    );
    CREATE TABLE IF NOT EXISTS file_tags (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      tag_name TEXT NOT NULL,
      tag_type TEXT NOT NULL DEFAULT 'none'
    );
    CREATE INDEX IF NOT EXISTS idx_files_backend_id ON files(backend_id);
    CREATE INDEX IF NOT EXISTS idx_files_parent_id ON files(parent_file_id);
    CREATE INDEX IF NOT EXISTS idx_files_source ON files(source);
    CREATE INDEX IF NOT EXISTS idx_files_is_folder ON files(is_folder);
    CREATE INDEX IF NOT EXISTS idx_files_sync_status ON files(sync_status);
    CREATE INDEX IF NOT EXISTS idx_file_tags_file_id ON file_tags(file_id);
    CREATE TABLE IF NOT EXISTS deleted_files (
      id TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL
    );
  `);

  return _db;
}

function getDb() {
  if (!_db) initDB();
  return _db!;
}

export type FileRecord = {
  id: string;
  backendId: string | null;
  name: string;
  mimeType: string;
  size: number;
  source: string;
  localUri: string | null;
  syncStatus: string;
  parentFileId: string | null;
  isFolder: number;
  ocrText: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  tags?: Tag[];
};

type FileRow = typeof files.$inferSelect;
type TagRow = typeof fileTags.$inferSelect;

function rowToRecord(row: FileRow, tags?: Tag[]): FileRecord {
  return {
    id: row.id,
    backendId: row.backendId,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    source: row.source,
    localUri: row.localUri,
    syncStatus: row.syncStatus,
    parentFileId: row.parentFileId,
    isFolder: row.isFolder,
    ocrText: row.ocrText,
    thumbnailUrl: row.thumbnailUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastSyncedAt: row.lastSyncedAt,
    tags,
  };
}

function getTagsForFile(fileId: string): Tag[] {
  const d = getDb();
  const rows = d.select().from(fileTags).where(eq(fileTags.fileId, fileId)).all();
  return rows.map((r) => ({ id: r.tagName, tag_name: r.tagName, tag_type: r.tagType }));
}

function setTagsForFile(fileId: string, tags: Tag[]) {
  const d = getDb();
  d.delete(fileTags).where(eq(fileTags.fileId, fileId)).run();
  if (tags.length === 0) return;
  d.insert(fileTags).values(
    tags.map((t) => ({
      id: `${fileId}_${t.id || t.tag_name}`,
      fileId,
      tagName: t.tag_name,
      tagType: t.tag_type,
    })),
  ).run();
}

function upsertRow(file: FileRecord) {
  const d = getDb();
  d.insert(files).values({
    id: file.id,
    backendId: file.backendId,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    source: file.source,
    localUri: file.localUri,
    syncStatus: file.syncStatus,
    parentFileId: file.parentFileId,
    isFolder: file.isFolder,
    ocrText: file.ocrText,
    thumbnailUrl: file.thumbnailUrl,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    lastSyncedAt: file.lastSyncedAt,
  }).onConflictDoUpdate({
    target: files.id,
    set: {
      backendId: file.backendId,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      source: file.source,
      localUri: file.localUri,
      syncStatus: file.syncStatus,
      parentFileId: file.parentFileId,
      isFolder: file.isFolder,
      ocrText: file.ocrText,
      thumbnailUrl: file.thumbnailUrl,
      updatedAt: file.updatedAt,
      lastSyncedAt: file.lastSyncedAt,
    },
  }).run();
}

export const fileStore = {
  initDB,

  upsert(file: FileRecord) {
    upsertRow(file);
    if (file.tags) setTagsForFile(file.id, file.tags);
  },

  upsertBatch(fileList: FileRecord[]) {
    const d = getDb();
    for (const file of fileList) {
      upsertRow(file);
      if (file.tags) setTagsForFile(file.id, file.tags);
    }
  },

  getById(id: string): FileRecord | null {
    const d = getDb();
    const row = d.select().from(files).where(eq(files.id, id)).get();
    if (!row) return null;
    return rowToRecord(row, getTagsForFile(id));
  },

  getByBackendId(backendId: string): FileRecord | null {
    const d = getDb();
    const row = d.select().from(files).where(eq(files.backendId, backendId)).get();
    if (!row) return null;
    return rowToRecord(row, getTagsForFile(row.id));
  },

  getRootFolders(): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(and(eq(files.isFolder, 1), isNull(files.parentFileId)))
      .orderBy(asc(files.name))
      .all();
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  getChildrenByParent(parentId: string): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(eq(files.parentFileId, parentId))
      .orderBy(desc(files.isFolder), desc(files.createdAt))
      .all();
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  getPaginated(page: number, limit: number): { files: FileRecord[]; total: number } {
    const d = getDb();
    const offset = (page - 1) * limit;

    const countRow = d.select({ count: sql<number>`count(*)` })
      .from(files)
      .where(and(isNull(files.parentFileId), eq(files.isFolder, 0)))
      .get();
    const total = countRow?.count ?? 0;

    const rows = d.select().from(files)
      .where(and(isNull(files.parentFileId), eq(files.isFolder, 0)))
      .orderBy(desc(files.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return {
      files: rows.map((r) => rowToRecord(r, getTagsForFile(r.id))),
      total,
    };
  },

  getAllFolders(): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(eq(files.isFolder, 1))
      .orderBy(asc(files.name))
      .all();
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  search(query: string): FileRecord[] {
    const d = getDb();
    const pattern = `%${query}%`;
    const rows = d.select().from(files)
      .where(or(like(files.name, pattern), like(files.ocrText, pattern)))
      .orderBy(desc(files.createdAt))
      .limit(100)
      .all();
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  mergeFromBackend(backendFiles: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    createdAt: string;
    updatedAt?: string;
    ocrText?: string;
    tags?: Tag[];
    isFolder: boolean;
    parentFileId?: string;
    thumbnailUrl?: string;
  }>) {
    const d = getDb();
    const now = new Date().toISOString();

    d.transaction(() => {
      for (const bf of backendFiles) {
        const existing = d.select().from(files).where(eq(files.backendId, bf.id)).get();

        const source = existing && existing.localUri ? 'synced' : 'cloud';
        const syncStatus = existing && existing.localUri
          ? (existing.syncStatus === 'cloud' ? 'synced' : existing.syncStatus)
          : 'cloud';

        upsertRow({
          id: bf.id,
          backendId: bf.id,
          name: bf.name,
          mimeType: bf.mimeType,
          size: bf.size,
          source,
          localUri: existing?.localUri ?? null,
          syncStatus,
          parentFileId: bf.parentFileId ?? null,
          isFolder: bf.isFolder ? 1 : 0,
          ocrText: bf.ocrText ?? null,
          thumbnailUrl: bf.thumbnailUrl ?? null,
          createdAt: bf.createdAt,
          updatedAt: bf.updatedAt ?? now,
          lastSyncedAt: now,
        });

        if (bf.tags) setTagsForFile(bf.id, bf.tags);
      }
    });
  },

  mergeFromDevice(deviceFiles: Array<{
    id: string;
    uri: string;
    name: string;
    mimeType: string;
    size: number;
    createdAt: string;
    folderId?: string;
  }>) {
    const d = getDb();
    const now = new Date().toISOString();

    d.transaction(() => {
      for (const df of deviceFiles) {
        if (this.isDeleted(df.id)) continue;
        const existing = d.select().from(files).where(eq(files.id, df.id)).get();
        if (existing) continue;

        upsertRow({
          id: df.id,
          backendId: null,
          name: df.name,
          mimeType: df.mimeType,
          size: df.size,
          source: 'local',
          localUri: df.uri,
          syncStatus: 'local',
          parentFileId: df.folderId ?? null,
          isFolder: 0,
          ocrText: null,
          thumbnailUrl: null,
          createdAt: df.createdAt,
          updatedAt: now,
          lastSyncedAt: null,
        });
      }
    });
  },

  updatePartial(id: string, updates: Partial<FileRecord>) {
    const d = getDb();
    const setFields: Record<string, unknown> = {};
    if (updates.backendId !== undefined) setFields.backendId = updates.backendId;
    if (updates.syncStatus !== undefined) setFields.syncStatus = updates.syncStatus;
    if (updates.localUri !== undefined) setFields.localUri = updates.localUri;
    if (updates.source !== undefined) setFields.source = updates.source;
    if (updates.thumbnailUrl !== undefined) setFields.thumbnailUrl = updates.thumbnailUrl;
    if (updates.ocrText !== undefined) setFields.ocrText = updates.ocrText;
    if (updates.parentFileId !== undefined) setFields.parentFileId = updates.parentFileId;
    if (updates.name !== undefined) setFields.name = updates.name;
    setFields.updatedAt = new Date().toISOString();

    d.update(files).set(setFields).where(eq(files.id, id)).run();
  },

  updateSyncStatus(id: string, syncStatus: string) {
    this.updatePartial(id, { syncStatus });
  },

  markAsCloudOnly(id: string) {
    this.updatePartial(id, { syncStatus: 'cloud', localUri: null, source: 'cloud' });
  },

  setThumbnailUrl(backendId: string, thumbnailUrl: string) {
    const d = getDb();
    d.update(files).set({ thumbnailUrl, updatedAt: new Date().toISOString() })
      .where(eq(files.backendId, backendId)).run();
  },

  markDeleted(id: string) {
    const d = getDb();
    d.insert(deletedFiles).values({ id, deletedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: deletedFiles.id, set: { deletedAt: new Date().toISOString() } })
      .run();
  },

  isDeleted(id: string): boolean {
    const d = getDb();
    const row = d.select().from(deletedFiles).where(eq(deletedFiles.id, id)).get();
    return !!row;
  },

  deleteById(id: string) {
    const d = getDb();
    this.markDeleted(id);
    d.delete(files).where(eq(files.id, id)).run();
  },

  deleteByBackendId(backendId: string) {
    const d = getDb();
    const row = d.select().from(files).where(eq(files.backendId, backendId)).get();
    if (row) this.markDeleted(row.id);
    d.delete(files).where(eq(files.backendId, backendId)).run();
  },

  clear() {
    const d = getDb();
    d.delete(fileTags).run();
    d.delete(files).run();
  },

  count(): number {
    const d = getDb();
    const row = d.select({ count: sql<number>`count(*)` }).from(files).get();
    return row?.count ?? 0;
  },

  getAllLocal(): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(or(eq(files.source, 'local'), eq(files.source, 'synced')))
      .all();
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  getAllSynced(): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(eq(files.source, 'synced'))
      .all();
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  getPendingSync(): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(and(eq(files.syncStatus, 'local'), sql`${files.backendId} IS NULL`))
      .all();
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },
};
