import type { FileEntry, Folder } from "./safDirectory.types";

export type SyncStatus = 'local' | 'cloud' | 'local-cloud';

export type FolderContext = {
  syncStatus: SyncStatus;
  addedAt: number;
  folder: Folder;
};

export type StoredFile = FileEntry & {
  folderUri: string;
  syncStatus: SyncStatus;
  addedAt: number;
};

export type UserPreferences = {
  syncMode: 'full' | 'manual' | 'none';
};

export type FolderRow = {
  uri: string;
  name: string;
  exists: number | null;
  sync_status: SyncStatus;
  added_at: number;
  parent_uri: string | null;
};

export type FileRow = {
  uri: string;
  name: string;
  folder_uri: string;
  extension: string | null;
  size: number;
  type: string | null;
  exists: number;
  last_modified: number | null;
  sync_status: SyncStatus;
  added_at: number;
};