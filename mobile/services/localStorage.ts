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
} from './db';

export type { FolderContext, StoredFile, SyncStatus, UserPreferences } from './db';