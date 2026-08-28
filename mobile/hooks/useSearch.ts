import { useMemo } from 'react';
import { fileStore } from '../services/fileStore';
import { UnifiedFileItem } from '../types';

function recordToUnifiedItem(record: ReturnType<typeof fileStore.getById>): UnifiedFileItem | null {
  if (!record) return null;
  return {
    id: record.id,
    backendResourceId: record.backendId ?? undefined,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: record.source as UnifiedFileItem['source'],
    syncStatus: record.syncStatus as UnifiedFileItem['syncStatus'],
    localUri: record.localUri ?? undefined,
    ocrText: record.ocrText ?? undefined,
    tags: record.tags ?? [],
    isFolder: record.isFolder === 1,
    parentResourceId: record.parentResourceId ?? undefined,
    ownerId: record.ownerId ?? undefined,
    thumbnailUrl: record.thumbnailUrl ?? undefined,
    thumbnailLocal: record.thumbnailLocal ?? undefined,
    isDeviceFile: record.source === 'local' && !record.backendId,
  };
}

export function useSearch(query: string) {
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const records = fileStore.searchFts(query);
    if (records.length === 0) {
      const fallback = fileStore.search(query);
      return fallback.map((r) => recordToUnifiedItem(r)!).filter(Boolean);
    }
    return records.map((r) => recordToUnifiedItem(r)!).filter(Boolean);
  }, [query]);

  return {
    data: results,
    isLoading: false,
  };
}
