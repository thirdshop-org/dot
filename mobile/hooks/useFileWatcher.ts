import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { ExpoDownloadDetectModule, FileDetectedEvent } from '../modules/expo-download-detect';

export function useFileWatcher() {
  const [newFiles, setNewFiles] = useState<FileDetectedEvent[]>([]);
  const [isSupported] = useState(() => Platform.OS === 'android');

  const clearNewFiles = useCallback(() => {
    setNewFiles([]);
  }, []);

  useEffect(() => {
    if (!isSupported) return;

    ExpoDownloadDetectModule.startWatching();

    const subscription = ExpoDownloadDetectModule.addListener('onNewFile', (event: FileDetectedEvent) => {
      setNewFiles((prev) => {
        if (prev.some((f) => f.id === event.id)) return prev;
        return [...prev, event];
      });
    });

    return () => {
      subscription.remove();
      ExpoDownloadDetectModule.stopWatching();
    };
  }, [isSupported]);

  return { newFiles, clearNewFiles, isSupported };
}
