import { createMMKV } from 'react-native-mmkv';
import { fileStore, FileRecord } from './index';
import type { Tag, SyncStatus } from '../../types';

const metadataStorage = createMMKV({ id: 'vaultdrop-metadata' });
const localFilesStorage = createMMKV({ id: 'vaultdrop-local-files' });

interface LegacyCachedFiles {
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    createdAt: string;
    updatedAt: string;
    ocrText?: string;
    tags?: Tag[];
    isFolder: boolean;
    parentFileId?: string;
    url?: string;
    thumbnailUrl?: string;
  }>;
  page: number;
  total: number;
}

interface LegacyRegistryBlob {
  entries: Record<string, {
    id: string;
    backendFileId?: string;
    localUri: string;
    name: string;
    mimeType: string;
    size: number;
    syncStatus: SyncStatus;
    createdAt: string;
    tags?: Tag[];
    folderId?: string;
  }>;
}

export function migrateFromLegacy() {
  const count = fileStore.count();
  if (count > 0) return;

  try {
    const rawMetadata = metadataStorage.getString('backend_files_cache');
    if (rawMetadata) {
      const cached: LegacyCachedFiles = JSON.parse(rawMetadata);
      for (const f of cached.files) {
        fileStore.upsert({
          id: f.id,
          backendId: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          source: 'cloud',
          localUri: null,
          syncStatus: 'cloud',
          parentFileId: f.parentFileId ?? null,
          isFolder: f.isFolder ? 1 : 0,
          ocrText: f.ocrText ?? null,
          thumbnailUrl: f.thumbnailUrl ?? null,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
          lastSyncedAt: new Date().toISOString(),
          tags: f.tags,
        });
      }
    }
  } catch {}

  try {
    const rawRegistry = localFilesStorage.getString('local_files_v2');
    if (rawRegistry) {
      const blob: LegacyRegistryBlob = JSON.parse(rawRegistry);
      for (const entry of Object.values(blob.entries)) {
        const existing = fileStore.getByBackendId(entry.backendFileId ?? '');
        const source = entry.backendFileId
          ? (entry.syncStatus === 'synced' ? 'synced' : 'cloud')
          : 'local';

        fileStore.upsert({
          id: entry.id,
          backendId: entry.backendFileId ?? null,
          name: entry.name,
          mimeType: entry.mimeType,
          size: entry.size,
          source,
          localUri: entry.localUri,
          syncStatus: entry.syncStatus,
          parentFileId: entry.folderId ?? null,
          isFolder: 0,
          ocrText: null,
          thumbnailUrl: null,
          createdAt: entry.createdAt,
          updatedAt: entry.createdAt,
          lastSyncedAt: entry.backendFileId ? new Date().toISOString() : null,
          tags: entry.tags,
        });

        if (existing && entry.localUri) {
          fileStore.updatePartial(entry.id, {
            localUri: entry.localUri,
            source: 'synced',
            syncStatus: 'synced',
          });
        }
      }
    }
  } catch {}
}
