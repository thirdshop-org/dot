import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FileItem } from '../types';
import { TagChip } from './TagChip';

interface FileCardProps {
  file: FileItem;
  onPress?: (file: FileItem) => void;
}

export function FileCard({ file, onPress }: FileCardProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  console.log(file)

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress?.(file)}>
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
          <TagChip key={tag.id} name={tag.name} />
        ))}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  size: {
    fontSize: 14,
    color: '#666',
  },
  preview: {
    fontSize: 14,
    color: '#444',
    marginBottom: 8,
    lineHeight: 20,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
