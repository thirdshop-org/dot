import { useState, useEffect, useCallback } from 'react';
import * as MediaLibrary from 'expo-media-library/legacy';
import { LocalFileEntry } from '../types';

export interface DeviceFile {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export function useDeviceFiles() {
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  const requestPermission = useCallback(async () => {
    const req = await MediaLibrary.requestPermissionsAsync();
    console.log('[useDeviceFiles] requestPermission status:', req.status, 'granted:', req.granted, 'canAskAgain:', req.canAskAgain);
    if (req.granted) {
      setHasPermission(true);
      return true;
    }
    const check = await MediaLibrary.getPermissionsAsync();
    console.log('[useDeviceFiles] getPermissionsAsync status:', check.status, 'granted:', check.granted);
    const granted = check.granted;
    setHasPermission(granted);
    return granted;
  }, []);

  const loadAssets = useCallback(async () => {
    console.log('[useDeviceFiles] loadAssets called');
    setIsLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        first: 500,
        mediaType: ['photo', 'video'],
        sortBy: 'creationTime',
      });

      const deviceFiles: DeviceFile[] = result.assets.map((asset) => ({
        id: asset.id,
        uri: asset.uri,
        name: asset.filename,
        mimeType: asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
        size: 0,
        createdAt: asset.creationTime
          ? new Date(asset.creationTime).toISOString()
          : new Date().toISOString(),
      }));

      setFiles(deviceFiles);
      console.log('[useDeviceFiles] loaded', deviceFiles.length, 'files');
    } catch (err) {
      console.error('[useDeviceFiles] scan error:', err);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    requestPermission().then((granted) => {
      console.log('[useDeviceFiles] mount permission result:', granted);
      if (granted) {
        loadAssets();
      }
    });
  }, []);

  const rescan = useCallback(async () => {
    const granted = await requestPermission();
    if (granted) {
      await loadAssets();
    }
  }, [requestPermission, loadAssets]);

  return { files, isLoading, hasPermission, requestPermission, rescan };
}

export function deviceFileToLocalEntry(deviceFile: DeviceFile): LocalFileEntry {
  return {
    id: deviceFile.id,
    localUri: deviceFile.uri,
    name: deviceFile.name,
    mimeType: deviceFile.mimeType,
    size: deviceFile.size,
    syncStatus: 'local',
    createdAt: deviceFile.createdAt,
  };
}
