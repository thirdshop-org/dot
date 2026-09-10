export const DATABASE_NAME = 'dot.db';

export const DATABASE_VERSION = 5;

export const PREFERENCES_KEY = 'user_preferences';

export const DEVICE_USER_ID_KEY = 'device_user_id';

export const AUTH_TOKEN_KEY = 'auth_token';

// Miroir non-sensible du compte connecté (voir services/secureStore.ts) : le
// token lui-même reste en SecureStore ; seul l'id du compte actif est répété en
// SQLite pour permettre aux repositories de scoper leurs lectures/écritures
// sans avoir à importer expo-secure-store (tests Node inclus).
export const ACTIVE_USER_ID_KEY = 'active_user_id';

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