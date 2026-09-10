import type {
  DirectoryEntry,
  Folder,
  FolderInfo,
  PickDirectoryOptions,
} from './safDirectory.types';

export async function yieldToMainThread(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export const DEFAULT_WALK_BUDGET_MS = 16;

export type SafWalkImpl = {
  list: (uri: string) => DirectoryEntry[];
  info: (uri: string) => FolderInfo;
  yield: () => Promise<void>;
};

let walkImpl: SafWalkImpl | null = null;

export function __setSafWalkImpl(impl: SafWalkImpl): void {
  walkImpl = impl;
}

export function __setSafWalkForTests(impl: Partial<SafWalkImpl>): () => void {
  const previous = walkImpl;
  walkImpl = { ...previous, ...impl } as SafWalkImpl;
  return () => {
    walkImpl = previous;
  };
}

export async function listFoldersChunked(
  directoryUri: string,
  options: PickDirectoryOptions = {},
  budgetMs = DEFAULT_WALK_BUDGET_MS,
): Promise<Folder[]> {
  const impl = walkImpl;
  if (!impl) throw new Error('SafWalkImpl not configured');

  const { recursive = false, includeRoot = false } = options;
  const result: Folder[] = [];
  if (includeRoot) {
    result.push({ ...impl.info(directoryUri), isDirectory: true });
  }
  if (!recursive) {
    for (const entry of impl.list(directoryUri)) {
      if (entry.isDirectory) result.push(entry);
    }
    return result;
  }

  let lastYield = Date.now();
  const visit = async (uri: string) => {
    if (Date.now() - lastYield >= budgetMs) {
      lastYield = Date.now();
      await impl.yield();
    }
    for (const entry of impl.list(uri)) {
      if (entry.isDirectory) {
        result.push(entry);
        await visit(entry.uri);
      }
    }
  };
  await visit(directoryUri);
  return result;
}