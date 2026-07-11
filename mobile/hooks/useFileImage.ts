import { useEffect, useState } from 'react';
import { downloadAsync, documentDirectory, makeDirectoryAsync, getInfoAsync } from 'expo-file-system/legacy';

const CACHE_DIR = `${documentDirectory}file-images/`;

function getCacheKey(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getExtension(url: string): string {
  const pathname = new URL(url).pathname;
  const dot = pathname.lastIndexOf('.');
  return dot >= 0 ? pathname.slice(dot) : '.jpg';
}

export function useFileImage(url: string | undefined) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;

    const resolvedUrl = url;
    let cancelled = false;

    async function load() {
      const fileName = `${getCacheKey(resolvedUrl)}${getExtension(resolvedUrl)}`;
      const fileUri = `${CACHE_DIR}${fileName}`;

      const info = await getInfoAsync(fileUri);
      if (info.exists) {
        if (!cancelled) setLocalUri(info.uri);
        return;
      }

      setLoading(true);
      try {
        await makeDirectoryAsync(CACHE_DIR, { intermediates: true });
        const result = await downloadAsync(resolvedUrl, fileUri);
        if (!cancelled) {
          setLocalUri(result.uri);
        }
      } catch {
        if (!cancelled) {
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
  }, [url]);

  return { localUri, loading };
}
