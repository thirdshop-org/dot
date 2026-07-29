import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { FileItem } from '../types';
import { TagChip } from './TagChip';

interface FileCardProps {
  file: FileItem;
  onPress?: (file: FileItem) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileCard({ file, onPress }: FileCardProps) {
  const imageUri = file.thumbnailUrl || (file.url && file.mimeType?.startsWith('image/') ? file.url : undefined);

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress?.(file)}>
      {imageUri && (
        <View style={styles.imageContainer}>
          <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" transition={200} />
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={styles.size}>{formatSize(file.size)}</Text>
      </View>

      {file.ocrText && (
        <Text style={styles.preview} numberOfLines={2}>
          {file.ocrText}
        </Text>
      )}

      <View style={styles.tags}>
        {file.tags.map((tag) => (
          <TagChip key={tag.id} name={tag.tag_name} />
        ))}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  imageContainer: {
    marginBottom: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 120,
    borderRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  size: {
    fontSize: 13,
    color: '#999',
  },
  preview: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
    lineHeight: 18,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
});
