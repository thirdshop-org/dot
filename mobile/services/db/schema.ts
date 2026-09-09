export const DATABASE_NAME = 'dot.db';

export const DATABASE_VERSION = 2;

export const PREFERENCES_KEY = 'user_preferences';

export const FOLDER_COLUMNS = [
  'uri',
  'name',
  '"exists"',
  'sync_status',
  'added_at',
  'parent_uri',
] as const;

export const FOLDER_COLUMNS_SQL = FOLDER_COLUMNS.join(', ');

export const FILE_COLUMNS = [
  'uri',
  'name',
  'folder_uri',
  'extension',
  'size',
  '"type"',
  '"exists"',
  'last_modified',
  'sync_status',
  'added_at',
] as const;

export const FILE_COLUMNS_SQL = FILE_COLUMNS.join(', ');