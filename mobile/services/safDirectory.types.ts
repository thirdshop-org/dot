export type Folder = {
  uri: string;
  name: string;
  isDirectory: true;
  /** `undefined` when neither caller nor Directory fallback provided a value. */
  exists?: boolean;
};

export type FileEntry = {
  uri: string;
  name: string;
  isDirectory: false;
  extension: string;
  exists: boolean;
  size: number;
  type: string;
  lastModified: number | null;
};

export type DirectoryEntry = Folder | FileEntry;

export type FolderInfo = {
  uri: string;
  name: string;
  exists: boolean;
};

export type PickDirectoryOptions = {
  recursive?: boolean;
  includeRoot?: boolean;
};