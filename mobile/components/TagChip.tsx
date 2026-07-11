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
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    color: '#1976D2',
  },
  removeButton: {
    marginLeft: 4,
  },
  removeText: {
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '600',
  },
});
