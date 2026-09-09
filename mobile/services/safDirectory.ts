import { Directory, File, Paths } from 'expo-file-system';
import type {
  DirectoryEntry,
  FileEntry,
  Folder,
  FolderInfo,
  PickDirectoryOptions,
} from './safDirectory.types';

export async function pickDirectory(initialUri?: string): Promise<Folder | null> {
  try {
    const directory = await Directory.pickDirectoryAsync(initialUri);
    if (!directory || !directory.uri) return null;
    return toFolder({ uri: directory.uri, name: directory.name, exists: directory.exists });
  } catch {
    return null;
  }
}

export function listDirectory(directoryUri: string): DirectoryEntry[] {
  const directory = new Directory(directoryUri);
  if (!directory.exists) return [];
  try {
    return directory.list().map(toEntry);
  } catch {
    return [];
  }
}

export function listFolders(directoryUri: string, options: PickDirectoryOptions = {}): Folder[] {
  const { recursive = false, includeRoot = false } = options;
  if (!recursive) {
    return listDirectory(directoryUri).filter((entry): entry is Folder => entry.isDirectory);
  }

  const result: Folder[] = [];
  if (includeRoot) {
    result.push({ ...getFolderInfo(directoryUri), isDirectory: true });
  }
  const visit = (uri: string) => {
    for (const entry of listDirectory(uri)) {
      if (entry.isDirectory) {
        result.push(entry);
        visit(entry.uri);
      }
    }
  };
  visit(directoryUri);
  return result;
}

export function getFolderInfo(directoryUri: string): FolderInfo {
  const directory = new Directory(directoryUri);
  return {
    uri: directory.uri,
    name: directory.name,
    exists: directory.exists,
  };
}

export function createDirectory(directoryUri: string, name: string): Folder {
  const directory = new Directory(Paths.join(directoryUri, name));
  directory.create({ idempotent: true, intermediates: true });
  return toFolder({ uri: directory.uri, name: directory.name, exists: directory.exists });
}

export function fileFromUri(uri: string): FileEntry {
  const file = new File(uri);
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
  if (item instanceof Directory) {
    return toFolder({ uri: item.uri, name: item.name, exists: item.exists });
  }
  return {
    uri: item.uri,
    name: item.name,
    isDirectory: false,
    extension: item.extension,
    exists: item.exists,
    size: item.size,
    type: item.type,
    lastModified: item.lastModified,
  };
}

function toFolder({ uri, name, exists }: { uri: string; name?: string; exists?: boolean }): Folder {
  const directory = exists === undefined ? new Directory(uri) : null;
  return {
    uri,
    name: name ?? directory?.name ?? Paths.basename(uri),
    isDirectory: true,
    exists: exists ?? directory?.exists,
  };
}