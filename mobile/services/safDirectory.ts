import { Directory, File, Paths } from 'expo-file-system';
import type {
  DirectoryEntry,
  FileEntry,
  Folder,
  FolderInfo,
} from './safDirectory.types';
import { __setSafWalkImpl, yieldToMainThread } from './safWalk';
export { listFoldersChunked, yieldToMainThread, DEFAULT_WALK_BUDGET_MS } from './safWalk';

// Bootstrap: wire the real SAF implementation for the Expo runtime.
__setSafWalkImpl({
  list: listDirectoryEntries,
  info: getFolderInfo,
  yield: yieldToMainThread,
});

export async function pickDirectory(initialUri?: string): Promise<Folder | null> {
  try {
    const directory = await Directory.pickDirectoryAsync(initialUri);
    if (!directory || !directory.uri) return null;
    return toFolder({ uri: directory.uri, name: directory.name, exists: directory.exists });
  } catch (error) {
    console.warn('[safDirectory] pickDirectory failed:', error);
    return null;
  }
}

export function listDirectoryEntries(directoryUri: string): DirectoryEntry[] {
  const directory = new Directory(directoryUri);
  if (!directory.exists) return [];
  try {
    return directory.list().map(toEntry);
  } catch (error) {
    console.warn('[safDirectory] listDirectoryEntries failed:', error);
    return [];
  }
}

export function getFolderInfo(directoryUri: string): FolderInfo {
  const directory = new Directory(directoryUri);
  return {
    uri: directory.uri,
    name: directory.name,
    exists: directory.exists,
  };
}

/** Creates a directory. Intentionally lets exceptions propagate (permissions, quota, etc). */
export function createDirectory(directoryUri: string, name: string): Folder {
  const directory = new Directory(Paths.join(directoryUri, name));
  directory.create({ idempotent: true, intermediates: true });
  return toFolder({ uri: directory.uri, name: directory.name, exists: directory.exists });
}

export function fileFromUri(uri: string): FileEntry {
  return toFileEntry(new File(uri));
}

function toFileEntry(file: File): FileEntry {
  return {
    uri: file.uri,
    name: file.name,
    isDirectory: false,
    extension: file.extension,
    exists: file.exists,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}

function toEntry(item: Directory | File): DirectoryEntry {
  return item instanceof Directory
    ? toFolder({ uri: item.uri, name: item.name, exists: item.exists })
    : toFileEntry(item);
}

// Perf: avoids constructing a Directory when all fields are already provided by the caller.
function toFolder({ uri, name, exists }: { uri: string; name?: string; exists?: boolean }): Folder {
  const directory = exists === undefined ? new Directory(uri) : null;
  return {
    uri,
    name: name ?? directory?.name ?? Paths.basename(uri),
    isDirectory: true,
    exists: exists ?? directory?.exists,
  };
}
