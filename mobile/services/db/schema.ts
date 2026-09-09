export const DATABASE_NAME = 'dot.db';

export const DATABASE_VERSION = 4;

export const PREFERENCES_KEY = 'user_preferences';

export const DEVICE_USER_ID_KEY = 'device_user_id';

export const FOLDER_COLUMNS = [
  'resource_id',
  'uri',
  'name',
  '"exists"',
  'sync_status',
  'added_at',
  'updated_at',
  'parent_resource_id',
  'owner_id',
] as const;

export const FOLDER_COLUMNS_SQL = FOLDER_COLUMNS.join(', ');

export const FILE_COLUMNS = [
  'resource_id',
  'uri',
  'name',
  'folder_resource_id',
  'extension',
  'size',
  '"type"',
  '"exists"',
  'last_modified',
  'sync_status',
  'added_at',
  'updated_at',
  'owner_id',
] as const;

export const FILE_COLUMNS_SQL = FILE_COLUMNS.join(', ');

export const PERMISSION_TTL_MS = 24 * 60 * 60 * 1000;