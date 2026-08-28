import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { FileItem } from '../types';
import { TagChip } from './TagChip';
import { SyncStatusBadge } from './SyncStatusBadge';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface FileCardProps {
  file: FileItem;
  onPress?: (file: FileItem) => void;
  onLongPress?: (file: FileItem) => void;
  selected?: boolean;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileInfo(mimeType: string, fileName: string): { icon: IconName; color: string; bg: string } {
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

export const FileCard = React.memo(function FileCard({ file, onPress, onLongPress, selected }: FileCardProps) {
  const info = getFileInfo(file.mimeType, file.name);
  const ext = getExtension(file.name);

  const imageUri = file.thumbnailUrl || file.thumbnailLocal || (file.url && file.mimeType?.startsWith('image/') ? file.url : undefined) || (file.localUri && file.mimeType?.startsWith('image/') ? file.localUri : undefined);
  const isFolder = file.isFolder;
  const isUploading = file.isUploading;

  return (
    <TouchableOpacity
      style={[styles.container, selected && styles.containerSelected]}
      onPress={() => onPress?.(file)}
      onLongPress={() => onLongPress?.(file)}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <View style={styles.thumbnailWrap}>
        {isFolder ? (
          <View style={[styles.thumbnail, styles.placeholder, { backgroundColor: '#FFF3E0' }]}>
            <MaterialIcons name="folder" size={30} color="#F57C00" />
          </View>
        ) : imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.thumbnail}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <View style={[styles.thumbnail, styles.placeholder, { backgroundColor: info.bg }]}>
            {isUploading ? (
              <ActivityIndicator size="small" color="#1976D2" />
            ) : (
              <>
                <MaterialIcons name={info.icon} size={26} color={info.color} />
                {ext.length <= 4 && <Text style={[styles.ext, { color: info.color }]}>{ext}</Text>}
              </>
            )}
          </View>
        )}

        {selected && (
          <View style={styles.selectedOverlay}>
            <View style={styles.checkCircle}>
              <MaterialIcons name="check" size={16} color="#fff" />
            </View>
          </View>
        )}

        {file.syncStatus && !isUploading && (
          <View style={styles.badge}>
            <SyncStatusBadge status={file.syncStatus} size={16} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {file.name}
          </Text>
          {!isFolder && file.size > 0 && (
            <Text style={styles.size}>{formatSize(file.size)}</Text>
          )}
        </View>

        {file.syncStatus && !isUploading && (
          <View style={styles.statusRow}>
            <SyncStatusBadge status={file.syncStatus} showLabel />
          </View>
        )}

        {isUploading ? (
          <View style={styles.uploadRow}>
            <MaterialIcons name="cloud-upload" size={14} color="#1976D2" />
            <Text style={styles.uploadText}>
              Upload {(file.uploadProgress ?? 0)}%
            </Text>
          </View>
        ) : file.ocrText ? (
          <Text style={styles.preview} numberOfLines={2}>
            {file.ocrText}
          </Text>
        ) : null}

        {file.tags && file.tags.length > 0 && (
          <View style={styles.tags}>
            {file.tags.slice(0, 3).map((tag) => (
              <TagChip key={tag.id} name={tag.tag_name} />
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  containerSelected: {
    opacity: 0.85,
    borderWidth: 1.5,
    borderColor: '#1976D2',
  },
  thumbnailWrap: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 1,
  },
  ext: {
    fontSize: 9,
    fontWeight: '700',
  },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    padding: 4,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  size: {
    fontSize: 12,
    color: '#999',
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  preview: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    lineHeight: 18,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  uploadText: {
    fontSize: 13,
    color: '#1976D2',
    fontWeight: '500',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
});
