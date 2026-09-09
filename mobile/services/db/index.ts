export { getDatabase, closeDatabase, withTransaction } from './client';
export { migrateDatabase, type Migration, type MigrationDb } from './migrations';
export * from './repositories';
export type { AccessCheck, AccessSource } from './repositories/permissions';
export {
  transitionSyncStatus,
  type SyncEvent,
  type SyncTransitionResult,
} from './transitions';
export type {
  AccessLevel,
  NewPendingOperation,
  NewResourcePermission,
  NewShare,
  NewShareLink,
  PendingOperation,
  PendingOperationRefType,
  PendingOperationRow,
  PendingOperationStatus,
  PendingOperationType,
  PushStatus,
  Recipient,
  RecipientRow,
  RecipientType,
  ResourcePermission,
  ResourceType,
  Share,
  ShareLink,
  ShareLinkRow,
  ShareRow,
  StoredFile,
  StoredFolder,
  SyncStatus,
  UserPreferences,
  FolderRow,
  FileRow,
} from './types';
export {
  DATABASE_NAME,
  DATABASE_VERSION,
  DEVICE_USER_ID_KEY,
  PREFERENCES_KEY,
  PERMISSION_TTL_MS,
} from './schema';