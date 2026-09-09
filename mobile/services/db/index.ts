export { getDatabase, closeDatabase, withTransaction } from './client';
export * from './repositories';
export type { FolderContext, StoredFile, SyncStatus, UserPreferences } from './types';
export { DATABASE_NAME, DATABASE_VERSION } from './schema';