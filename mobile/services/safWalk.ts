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
  if (Date.now() - lastYield >= budgetMs) {
    lastYield = Date.now();
    await impl.yield();
  }
  // Stack of Folders identified by uri; push in reverse so the first-listed
  // descendant is popped first, preserving the DFS pre-order of the recursive
  // traversal (a folder's subtree is fully explored before its later siblings).
  const stack: Folder[] = impl
    .list(directoryUri)
    .filter((entry): entry is Folder => entry.isDirectory)
    .reverse();
  while (stack.length > 0) {
    if (Date.now() - lastYield >= budgetMs) {
      lastYield = Date.now();
      await impl.yield();
    }
    const folder = stack.pop()!;
    result.push(folder);
    const children = impl
      .list(folder.uri)
      .filter((entry): entry is Folder => entry.isDirectory);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }
  return result;
}

export function listEntries(directoryUri: string): DirectoryEntry[] {
  const impl = walkImpl;
  if (!impl) throw new Error('SafWalkImpl not configured');
  return impl.list(directoryUri);
}