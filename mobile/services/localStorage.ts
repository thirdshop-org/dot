export {
  getUserPreferences,
  getFolders,
  getFolderFolders,
  getFiles,
  removeFolder,
  removeFile,
  saveFile,
  saveFolder,
  saveDirectory,
  saveUserPreferences,
} from './sqliteStorage';

export type { FolderContext, StoredFile, SyncStatus, UserPreferences } from './sqliteStorage.types';