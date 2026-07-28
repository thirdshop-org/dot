import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface TagChipProps {
  name: string;
  onRemove?: () => void;
}

export function TagChip({ name, onRemove }: TagChipProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{name}</Text>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
          <Text style={styles.removeText}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  text: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '500',
  },
  removeButton: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#BBDEFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '700',
  },
});
