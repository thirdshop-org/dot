import { useEffect, useState, useCallback } from 'react';
import { downloadAsync, documentDirectory, makeDirectoryAsync, getInfoAsync, deleteAsync } from 'expo-file-system/legacy';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { FileItem, PaginatedResponse } from '../types';

const CACHE_DIR = `${documentDirectory}file-images/`;

function getCacheKey(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot) : '.jpg';
}

export function useFileImage(url: string | undefined, fileName: string | undefined) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const refreshUrl = useCallback(async (): Promise<string | null> => {
    if (!fileName) return null;
    try {
      const res = await apiClient.getFileUrl(fileName);
      const freshUrl = res.data.url;

      queryClient.setQueriesData<PaginatedResponse<FileItem>>(
        { queryKey: ['files'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((f) =>
              f.name === fileName ? { ...f, url: freshUrl } : f
            ),
          };
        }
      );

      return freshUrl;
    } catch {
      return null;
    }
  }, [fileName, queryClient]);

  const download = useCallback(async (downloadUrl: string, fileUri: string) => {
    await makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    const result = await downloadAsync(downloadUrl, fileUri);
    return result.uri;
  }, []);

  useEffect(() => {
    if (!url || !fileName) return;

    const resolvedUrl = url;
    let cancelled = false;
    const cacheKey = getCacheKey(fileName);
    const ext = getExtension(fileName);
    const fileUri = `${CACHE_DIR}${cacheKey}${ext}`;

    async function load() {
      const info = await getInfoAsync(fileUri);
      if (info.exists) {
        if (!cancelled) setLocalUri(info.uri);
        return;
      }

      setLoading(true);
      try {
        const uri = await download(resolvedUrl, fileUri);
        if (!cancelled) setLocalUri(uri);
      } catch {
        const freshUrl = await refreshUrl();
        if (freshUrl && !cancelled) {
          try {
            await deleteAsync(fileUri, { idempotent: true });
            const uri = await download(freshUrl, fileUri);
            if (!cancelled) setLocalUri(uri);
          } catch {
            if (!cancelled) setLocalUri(null);
          }
        } else if (!cancelled) {
          setLocalUri(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [url, fileName, download, refreshUrl]);

  return { localUri, loading };
}
