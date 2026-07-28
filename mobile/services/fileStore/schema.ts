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
    parentResourceId: text('parent_resource_id'),
    isFolder: integer('is_folder').notNull().default(0),
    ocrText: text('ocr_text'),
    thumbnailUrl: text('thumbnail_url'),
    ownerId: text('owner_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastSyncedAt: text('last_synced_at'),
  },
  (t) => [
    index('idx_files_backend_id').on(t.backendId),
    index('idx_files_parent_resource_id').on(t.parentResourceId),
    index('idx_files_source').on(t.source),
    index('idx_files_is_folder').on(t.isFolder),
    index('idx_files_sync_status').on(t.syncStatus),
    index('idx_files_owner_id').on(t.ownerId),
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
  },
  (t) => [index('idx_file_tags_file_id').on(t.fileId)],
);

export const deletedFiles = sqliteTable('deleted_files', {
  id: text('id').primaryKey(),
  deletedAt: text('deleted_at').notNull(),
});

export const deviceInfo = sqliteTable('device_info', {
  id: text('id').primaryKey(),
  serverId: text('server_id'),
  deviceName: text('device_name').notNull().default(''),
  platform: text('platform').notNull().default(''),
  registeredAt: text('registered_at'),
});
