import React from 'react';
import { View, Text, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

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
  return { icon: 'insert-drive-file', color: '#757575', bg: '#F5F5F5' };
}

function getExtension(fileName: string): string {
  const ext = fileName.split('.').pop();
  return ext ? ext.toUpperCase() : '';
}

interface FileThumbnailProps {
  uri?: string;
  thumbnailUrl?: string;
  mimeType: string;
  fileName: string;
  size: number;
  isLoading?: boolean;
}

export function FileThumbnail({ uri, thumbnailUrl, mimeType, fileName, size, isLoading }: FileThumbnailProps) {
  const info = getFileInfo(mimeType, fileName);
  const ext = getExtension(fileName);

  if (isLoading) {
    return (
      <View style={[styles.container, { width: size, height: size, backgroundColor: info.bg }]}>
        <ActivityIndicator size="small" color={info.color} />
      </View>
    );
  }

  const imageUri = thumbnailUrl || (uri && mimeType.startsWith('image/') ? uri : undefined);

  if (imageUri) {
    return <Image source={{ uri: imageUri }} style={[styles.image, { width: size, height: size }]} />;
  }

  return (
    <View style={[styles.container, { width: size, height: size, backgroundColor: info.bg }]}>
      <MaterialIcons name={info.icon} size={size * 0.35} color={info.color} />
      {ext.length <= 4 && (
        <Text style={[styles.ext, { color: info.color }]}>{ext}</Text>
      )}
    </View>
  );
}

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
});
