import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    backendId: text('backend_id'),
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    source: text('source').notNull().default('cloud'),
    localUri: text('local_uri'),
    syncStatus: text('sync_status').notNull().default('cloud'),
    parentFileId: text('parent_file_id'),
    isFolder: integer('is_folder').notNull().default(0),
    ocrText: text('ocr_text'),
    thumbnailUrl: text('thumbnail_url'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastSyncedAt: text('last_synced_at'),
  },
  (t) => [
    index('idx_files_backend_id').on(t.backendId),
    index('idx_files_parent_id').on(t.parentFileId),
    index('idx_files_source').on(t.source),
    index('idx_files_is_folder').on(t.isFolder),
    index('idx_files_sync_status').on(t.syncStatus),
  ],
);

export const fileTags = sqliteTable(
  'file_tags',
  {
    id: text('id').primaryKey(),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    tagName: text('tag_name').notNull(),
    tagType: text('tag_type').notNull().default('none'),
  },
  (t) => [index('idx_file_tags_file_id').on(t.fileId)],
);

export const deletedFiles = sqliteTable('deleted_files', {
  id: text('id').primaryKey(),
  deletedAt: text('deleted_at').notNull(),
});
