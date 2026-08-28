import React, { useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export interface SearchFilters {
  name: boolean;
  ocrText: boolean;
}

export type SortKey = 'date' | 'name' | 'size';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onClear: () => void;
  filters: SearchFilters;
  onFiltersChange: (f: SearchFilters) => void;
  sort: SortState;
  onSortChange: (s: SortState) => void;
  bottomPadding?: number;
}

const FILTER_OPTIONS: { key: keyof SearchFilters; label: string; icon: IconName }[] = [
  { key: 'name', label: 'Nom', icon: 'drive-file-rename-outline' },
  { key: 'ocrText', label: 'Texte OCR', icon: 'document-scanner' },
];

const SORT_OPTIONS: { key: SortKey; label: string; icon: IconName }[] = [
  { key: 'date', label: 'Date', icon: 'schedule' },
  { key: 'name', label: 'Nom', icon: 'sort-by-alpha' },
  { key: 'size', label: 'Taille', icon: 'data-usage' },
];

const SORT_LABELS: Record<SortKey, string> = {
  date: 'Date',
  name: 'Nom',
  size: 'Taille',
};

export function SearchBar({ query, onQueryChange, onClear, filters, onFiltersChange, sort, onSortChange, bottomPadding = 0 }: SearchBarProps) {
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const [panelOpen, setPanelOpen] = React.useState(false);

  useEffect(() => {
    Animated.spring(animatedHeight, {
      toValue: panelOpen ? 1 : 0,
      useNativeDriver: false,
      tension: 60,
      friction: 8,
    }).start();
  }, [panelOpen]);

  const panelMaxHeight = animatedHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 260],
  });

  const toggleFilter = (key: keyof SearchFilters) => {
    onFiltersChange({ ...filters, [key]: !filters[key] });
  };

  const selectSort = (key: SortKey) => {
    if (sort.key === key) {
      onSortChange({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      onSortChange({ key, direction: 'desc' });
    }
  };

  const hasActiveFilter = filters.name || filters.ocrText || sort.key !== 'date';

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPadding }]}>
      <View style={styles.inputRow}>
        <View style={styles.inputContainer}>
          <MaterialIcons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.input}
            placeholder="Rechercher..."
            placeholderTextColor="#999"
            value={query}
            onChangeText={onQueryChange}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={onClear} style={styles.clearBtn}>
              <MaterialIcons name="close" size={18} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.iconBtn, hasActiveFilter && styles.iconBtnActive]}
          onPress={() => setPanelOpen(!panelOpen)}
        >
          <MaterialIcons
            name="tune"
            size={22}
            color={hasActiveFilter ? '#fff' : '#1976D2'}
          />
        </TouchableOpacity>
      </View>

      <Animated.View style={[styles.filterPanel, { maxHeight: panelMaxHeight, opacity: animatedHeight }]}>
        <Text style={styles.sectionLabel}>Rechercher dans</Text>
        {FILTER_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterChip, filters[opt.key] && styles.filterChipActive]}
            onPress={() => toggleFilter(opt.key)}
          >
            <MaterialIcons
              name={opt.icon}
              size={16}
              color={filters[opt.key] ? '#fff' : '#1976D2'}
            />
            <Text style={[styles.filterChipText, filters[opt.key] && styles.filterChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionLabel}>Trier par</Text>
        {SORT_OPTIONS.map((opt) => {
          const active = sort.key === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => selectSort(opt.key)}
            >
              <MaterialIcons
                name={active && sort.direction === 'desc' ? 'arrow-downward' : active && sort.direction === 'asc' ? 'arrow-upward' : opt.icon}
                size={16}
                color={active ? '#fff' : '#1976D2'}
              />
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {sort.key !== 'date' && (
          <Text style={styles.sortHint}>
            Tri : {SORT_LABELS[sort.key]} ({sort.direction === 'asc' ? 'A → Z' : 'Z → A'})
          </Text>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333',
  },
  clearBtn: {
    padding: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  iconBtnActive: {
    backgroundColor: '#1976D2',
  },
  filterPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    overflow: 'hidden',
  },
  sectionLabel: {
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1976D2',
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: '#1976D2',
  },
  filterChipText: {
    fontSize: 12,
    color: '#1976D2',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  sortHint: {
    width: '100%',
    fontSize: 12,
    color: '#999',
  },
});
