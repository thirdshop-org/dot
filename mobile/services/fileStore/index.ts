import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { eq, like, or, and, desc, asc, sql, isNull } from 'drizzle-orm';
import { files, fileTags, deletedFiles } from './schema';
import type { Tag } from '../../types';

const DB_NAME = 'vaultdrop-v3.db';
const SCHEMA_VERSION_KEY = 'schema_version';
const SCHEMA_VERSION = 3;

let _db: ReturnType<typeof drizzle> | null = null;
let _sqliteDb: SQLite.SQLiteDatabase | null = null;

export function initDB() {
  if (_db) return _db;
  _sqliteDb = SQLite.openDatabaseSync(DB_NAME);
  _sqliteDb.execSync('PRAGMA journal_mode = WAL;');
  _sqliteDb.execSync('PRAGMA foreign_keys = ON;');

  const existingVersion = _sqliteDb.getFirstSync<{ version: number }>(
    `SELECT name as version FROM sqlite_master WHERE type='table' AND name='schema_version'`
  );

  if (!existingVersion) {
    _sqliteDb.execSync(`CREATE TABLE schema_version (version INTEGER PRIMARY KEY);`);
  }

  const versionRow = _sqliteDb.getFirstSync<{ version: number }>(
    `SELECT version FROM schema_version ORDER BY version DESC LIMIT 1`
  );
  const currentVersion = versionRow?.version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    dropAllTables(_sqliteDb);
    createSchema(_sqliteDb);
    _sqliteDb.execSync(`INSERT INTO schema_version (version) VALUES (${SCHEMA_VERSION});`);
  }

  _db = drizzle(_sqliteDb);
  return _db;
}

function dropAllTables(db: SQLite.SQLiteDatabase) {
  db.execSync(`DROP TABLE IF EXISTS file_tags;`);
  db.execSync(`DROP TABLE IF EXISTS files;`);
  db.execSync(`DROP TABLE IF EXISTS deleted_files;`);
  db.execSync(`DROP TABLE IF EXISTS device_info;`);
  db.execSync(`DROP TABLE IF EXISTS resources_fts;`);
  db.execSync(`DROP TABLE IF EXISTS schema_version;`);
}

function createSchema(db: SQLite.SQLiteDatabase) {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      backend_id TEXT,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'cloud',
      local_uri TEXT,
      sync_status TEXT NOT NULL DEFAULT 'cloud',
      parent_resource_id TEXT,
      is_folder INTEGER NOT NULL DEFAULT 0,
      ocr_text TEXT,
      thumbnail_url TEXT,
      owner_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_synced_at TEXT
    );
  `);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_files_backend_id ON files(backend_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_files_parent_resource_id ON files(parent_resource_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_files_source ON files(source);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_files_is_folder ON files(is_folder);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_files_sync_status ON files(sync_status);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_files_owner_id ON files(owner_id);`);
  db.execSync(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);`);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS file_tags (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      tag_name TEXT NOT NULL
    );
  `);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_file_tags_file_id ON file_tags(file_id);`);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS deleted_files (
      id TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS device_info (
      id TEXT PRIMARY KEY,
      server_id TEXT,
      device_name TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      registered_at TEXT
    );
  `);

  db.execSync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(
      name,
      ocr_text,
      content='files',
      content_rowid='rowid'
    );
  `);

  db.execSync(`
    CREATE TRIGGER IF NOT EXISTS resources_fts_insert AFTER INSERT ON files BEGIN
      INSERT INTO resources_fts(rowid, name, ocr_text) VALUES (new.rowid, new.name, new.ocr_text);
    END;
  `);
  db.execSync(`
    CREATE TRIGGER IF NOT EXISTS resources_fts_delete AFTER DELETE ON files BEGIN
      INSERT INTO resources_fts(resources_fts, rowid, name, ocr_text) VALUES('delete', old.rowid, old.name, old.ocr_text);
    END;
  `);
  db.execSync(`
    CREATE TRIGGER IF NOT EXISTS resources_fts_update AFTER UPDATE ON files BEGIN
      INSERT INTO resources_fts(resources_fts, rowid, name, ocr_text) VALUES('delete', old.rowid, old.name, old.ocr_text);
      INSERT INTO resources_fts(rowid, name, ocr_text) VALUES (new.rowid, new.name, new.ocr_text);
    END;
  `);
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
  parentResourceId: string | null;
  isFolder: number;
  ocrText: string | null;
  thumbnailUrl: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  tags?: Tag[];
};

type FileRow = {
  id: string;
  backendId: string | null;
  name: string;
  mimeType: string;
  size: number;
  source: string;
  localUri: string | null;
  syncStatus: string;
  parentResourceId: string | null;
  isFolder: number;
  ocrText: string | null;
  thumbnailUrl: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
};

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
    parentResourceId: row.parentResourceId,
    isFolder: row.isFolder,
    ocrText: row.ocrText,
    thumbnailUrl: row.thumbnailUrl,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastSyncedAt: row.lastSyncedAt,
    tags,
  };
}

function getTagsForFile(fileId: string): Tag[] {
  const d = getDb();
  const rows = d.select().from(fileTags).where(eq(fileTags.fileId, fileId)).all();
  return rows.map((r) => ({ id: r.tagName, tag_name: r.tagName }));
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
    parentResourceId: file.parentResourceId,
    isFolder: file.isFolder,
    ocrText: file.ocrText,
    thumbnailUrl: file.thumbnailUrl,
    ownerId: file.ownerId,
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
      parentResourceId: file.parentResourceId,
      isFolder: file.isFolder,
      ocrText: file.ocrText,
      thumbnailUrl: file.thumbnailUrl,
      ownerId: file.ownerId,
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
    const row = d.select().from(files).where(eq(files.id, id)).get() as FileRow | undefined;
    if (!row) return null;
    return rowToRecord(row, getTagsForFile(id));
  },

  getByBackendId(backendId: string): FileRecord | null {
    const d = getDb();
    const row = d.select().from(files).where(eq(files.backendId, backendId)).get() as FileRow | undefined;
    if (!row) return null;
    return rowToRecord(row, getTagsForFile(row.id));
  },

  getRootFolders(): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(and(eq(files.isFolder, 1), isNull(files.parentResourceId)))
      .orderBy(asc(files.name))
      .all() as FileRow[];
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  getChildrenByParent(parentId: string): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(eq(files.parentResourceId, parentId))
      .orderBy(desc(files.isFolder), desc(files.createdAt))
      .all() as FileRow[];
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  getRootFiles(): { files: FileRecord[]; total: number } {
    const d = getDb();
    const countRow = d.select({ count: sql<number>`count(*)` })
      .from(files)
      .where(isNull(files.parentResourceId))
      .get();
    const total = countRow?.count ?? 0;
    const rows = d.select().from(files)
      .where(isNull(files.parentResourceId))
      .orderBy(desc(files.isFolder), desc(files.createdAt))
      .all() as FileRow[];
    return {
      files: rows.map((r) => rowToRecord(r, getTagsForFile(r.id))),
      total,
    };
  },

  getPaginated(page: number, limit: number): { files: FileRecord[]; total: number } {
    const d = getDb();
    const offset = (page - 1) * limit;

    const countRow = d.select({ count: sql<number>`count(*)` })
      .from(files)
      .where(isNull(files.parentResourceId))
      .get();
    const total = countRow?.count ?? 0;

    const rows = d.select().from(files)
      .where(isNull(files.parentResourceId))
      .orderBy(desc(files.isFolder), desc(files.createdAt))
      .limit(limit)
      .offset(offset)
      .all() as FileRow[];

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
      .all() as FileRow[];
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  searchFts(query: string): FileRecord[] {
    const d = getDb();
    const sanitized = query.replace(/['"]/g, '').trim();
    if (!sanitized) return [];
    const ftsPattern = sanitized.split(/\s+/).map(w => `"${w}"`).join(' OR ');
    const sqlQuery = `
      SELECT f.* FROM files f
      JOIN resources_fts r ON r.rowid = f.rowid
      WHERE resources_fts MATCH ?
      ORDER BY rank
      LIMIT 100
    `;
    const sqliteDb = _sqliteDb!;
    const stmt = sqliteDb.prepareSync(sqlQuery);
    const result = stmt.executeSync<FileRow>(ftsPattern);
    const rows: FileRow[] = [];
    for (const r of result) {
      rows.push(r as unknown as FileRow);
    }
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  search(query: string): FileRecord[] {
    const d = getDb();
    const pattern = `%${query}%`;
    const rows = d.select().from(files)
      .where(or(like(files.name, pattern), like(files.ocrText, pattern)))
      .orderBy(desc(files.createdAt))
      .limit(100)
      .all() as FileRow[];
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
    parentResourceId?: string;
    thumbnailUrl?: string;
    ownerId?: string;
  }>) {
    const d = getDb();
    const now = new Date().toISOString();

    d.transaction(() => {
      for (const bf of backendFiles) {
        const existing = d.select().from(files).where(eq(files.backendId, bf.id)).get() as FileRow | undefined;

        const recordId = existing?.id ?? bf.id;

        const source = existing && existing.localUri ? 'synced' : 'cloud';
        const syncStatus = existing && existing.localUri
          ? (existing.syncStatus === 'cloud' ? 'synced' : existing.syncStatus)
          : 'cloud';

        upsertRow({
          id: recordId,
          backendId: bf.id,
          name: bf.name,
          mimeType: bf.mimeType,
          size: bf.size,
          source,
          localUri: existing?.localUri ?? null,
          syncStatus,
          parentResourceId: bf.parentResourceId ?? null,
          isFolder: bf.isFolder ? 1 : 0,
          ocrText: bf.ocrText ?? null,
          thumbnailUrl: bf.thumbnailUrl ?? null,
          ownerId: bf.ownerId ?? null,
          createdAt: bf.createdAt,
          updatedAt: bf.updatedAt ?? now,
          lastSyncedAt: now,
        });

        if (bf.tags && bf.tags.length > 0) setTagsForFile(recordId, bf.tags);
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
          parentResourceId: df.folderId ?? null,
          isFolder: 0,
          ocrText: null,
          thumbnailUrl: null,
          ownerId: null,
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
    if (updates.parentResourceId !== undefined) setFields.parentResourceId = updates.parentResourceId;
    if (updates.name !== undefined) setFields.name = updates.name;
    if (updates.ownerId !== undefined) setFields.ownerId = updates.ownerId;
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
    const row = d.select().from(files).where(eq(files.backendId, backendId)).get() as FileRow | undefined;
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
      .all() as FileRow[];
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  getAllSynced(): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(eq(files.source, 'synced'))
      .all() as FileRow[];
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  getPendingSync(): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(and(eq(files.syncStatus, 'local'), sql`${files.backendId} IS NULL`))
      .all() as FileRow[];
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  getErrorFiles(): FileRecord[] {
    const d = getDb();
    const rows = d.select().from(files)
      .where(eq(files.syncStatus, 'error'))
      .all() as FileRow[];
    return rows.map((r) => rowToRecord(r, getTagsForFile(r.id)));
  },

  resetSyncError(id: string) {
    this.updatePartial(id, { syncStatus: 'local' });
  },
};
