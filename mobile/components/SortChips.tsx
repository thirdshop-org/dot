import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { SortState } from './SearchBar';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface SortChipsProps {
  sort: SortState;
  onSortChange: (s: SortState) => void;
}

const OPTIONS: { key: SortState['key']; label: string; icon: IconName }[] = [
  { key: 'name', label: 'A-Z', icon: 'sort-by-alpha' },
  { key: 'date', label: 'Date', icon: 'schedule' },
];

export function SortChips({ sort, onSortChange }: SortChipsProps) {
  const select = (key: SortState['key']) => {
    if (sort.key === key) {
      onSortChange({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      onSortChange({ key, direction: key === 'name' ? 'asc' : 'desc' });
    }
  };

  return (
    <View style={styles.container}>
      {OPTIONS.map((opt) => {
        const active = sort.key === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => select(opt.key)}
          >
            <MaterialIcons
              name={active && sort.direction === 'desc' ? 'arrow-downward' : active && sort.direction === 'asc' ? 'arrow-upward' : opt.icon}
              size={16}
              color={active ? '#fff' : '#1976D2'}
            />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1976D2',
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: '#1976D2',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
  },
  chipTextActive: {
    color: '#fff',
  },
});
