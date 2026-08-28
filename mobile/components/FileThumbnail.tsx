import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { SyncStatusBadge } from './SyncStatusBadge';
import type { SyncStatus } from '../types';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface FileTypeInfo {
  icon: IconName;
  color: string;
  bg: string;
}

function getFileInfo(mimeType: string, fileName: string): FileTypeInfo {
  if (mimeType.startsWith('image/')) return { icon: 'image', color: '#4CAF50', bg: '#E8F5E9' };
  if (mimeType === 'application/pdf') return { icon: 'picture-as-pdf', color: '#E53935', bg: '#FFEBEE' };
  if (mimeType.includes('word') || mimeType.includes('document')) return { icon: 'description', color: '#1565C0', bg: '#E3F2FD' };
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return { icon: 'table-chart', color: '#2E7D32', bg: '#E8F5E9' };
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return { icon: 'slideshow', color: '#E65100', bg: '#FFF3E0' };
  if (mimeType.startsWith('text/')) return { icon: 'article', color: '#546E7A', bg: '#ECEFF1' };
  if (mimeType.startsWith('video/')) return { icon: 'movie', color: '#6A1B9A', bg: '#F3E5F5' };
  if (mimeType.startsWith('audio/')) return { icon: 'audiotrack', color: '#AD1457', bg: '#FCE4EC' };
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('rar') || mimeType.includes('tar')) return { icon: 'folder-zip', color: '#6D4C41', bg: '#EFEBE9' };
  if (mimeType.includes('json') || mimeType.includes('xml')) return { icon: 'code', color: '#37474F', bg: '#ECEFF1' };
  return { icon: 'insert-drive-file', color: '#757575', bg: '#F5F5F5' };
}

function getExtension(fileName: string): string {
  const ext = fileName.split('.').pop();
  return ext ? ext.toUpperCase() : '';
}

interface FileThumbnailProps {
  uri?: string;
  thumbnailUrl?: string;
  thumbnailLocal?: string;
  mimeType: string;
  fileName: string;
  size: number;
  isLoading?: boolean;
  syncStatus?: SyncStatus;
  isFolder?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
}

export const FileThumbnail = React.memo(function FileThumbnail({ uri, thumbnailUrl, thumbnailLocal, mimeType, fileName, size, isLoading, syncStatus, isFolder, isUploading, uploadProgress }: FileThumbnailProps) {
  const info = getFileInfo(mimeType, fileName);
  const ext = getExtension(fileName);

  if (isFolder) {
    return (
      <View style={[styles.container, { width: size, height: size, backgroundColor: '#FFF3E0' }]}>
        <MaterialIcons name="folder" size={size * 0.45} color="#F57C00" />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { width: size, height: size, backgroundColor: info.bg }]}>
        <ActivityIndicator size="small" color={info.color} />
      </View>
    );
  }

  const imageUri = thumbnailUrl || thumbnailLocal || (uri && mimeType.startsWith('image/') ? uri : undefined);

  if (imageUri) {
    return (
      <View style={{ width: size, height: size }}>
        <Image
          source={imageUri}
          style={[styles.image, { width: size, height: size }]}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
        {syncStatus && <SyncStatusBadge status={syncStatus} />}
        {isUploading && (
          <View style={styles.uploadOverlay}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.uploadProgressText}>{uploadProgress ?? 0}%</Text>
            <View style={[styles.uploadProgressBar, { width: `${uploadProgress ?? 0}%` }]} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size, backgroundColor: isUploading ? '#E3F2FD' : info.bg }]}>
      {isUploading ? (
        <View style={styles.uploadGhost}>
          <MaterialIcons name="cloud-upload" size={size * 0.3} color="#1976D2" />
          <ActivityIndicator size="small" color="#1976D2" />
          <Text style={styles.uploadPercent}>{uploadProgress ?? 0}%</Text>
        </View>
      ) : (
        <>
          <MaterialIcons name={info.icon} size={size * 0.35} color={info.color} />
          {ext.length <= 4 && (
            <Text style={[styles.ext, { color: info.color }]}>{ext}</Text>
          )}
        </>
      )}
      {syncStatus && <SyncStatusBadge status={syncStatus} />}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  image: {
    borderRadius: 6,
  },
  ext: {
    fontSize: 11,
    fontWeight: '700',
  },
  uploadGhost: {
    alignItems: 'center',
    gap: 4,
  },
  uploadPercent: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1976D2',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  uploadProgressText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  uploadProgressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: '#1976D2',
    borderBottomLeftRadius: 6,
  },
});
