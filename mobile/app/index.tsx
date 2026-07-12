import React, { useState, useMemo, useEffect } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text, Dimensions, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useFiles, useFileImage } from '../hooks/useFiles';
import { FileItem } from '../types';
import { SearchBar, SearchFilters } from '../components/SearchBar';
import { FileThumbnail } from '../components/FileThumbnail';

const NUM_COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = (SCREEN_WIDTH - 16 * 2 - (NUM_COLUMNS - 1) * 6) / NUM_COLUMNS;

type RootStackParamList = {
  Home: undefined;
  Upload: undefined;
  Scan: undefined;
  FileDetail: { fileIds: string[]; initialIndex: number };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type GroupedFiles = Record<string, FileItem[]>;

function parseBackendDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return new Date(dateStr);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}

function groupByDate(files: FileItem[]): GroupedFiles {
  const groups: GroupedFiles = {};
  for (const file of files) {
    const d = parseBackendDate(file.createdAt);
    if (!d) continue;
    const key = d.toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!groups[key]) groups[key] = [];
    groups[key].push(file);
  }
  return groups;
}

function formatDateLabel(key: string): string {
  const d = new Date();
  const today = d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  d.setDate(d.getDate() - 1);
  const yesterday = d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  if (key === today) return "Aujourd'hui";
  if (key === yesterday) return 'Hier';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function FileGridItem({ file, onPress }: { file: FileItem; onPress?: () => void }) {
  const { data, isLoading } = useFileImage(file.id);

  return (
    <TouchableOpacity style={styles.gridItem} onPress={onPress} activeOpacity={0.7}>
      <FileThumbnail
        uri={data?.data?.url}
        mimeType={file.mimeType}
        fileName={file.name}
        size={ITEM_SIZE}
        isLoading={isLoading}
      />
      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
    </TouchableOpacity>
  );
}

function matchesQuery(file: FileItem, query: string, filters: SearchFilters): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (filters.name && file.name.toLowerCase().includes(q)) return true;
  if (filters.ocrText && file.ocrText?.toLowerCase().includes(q)) return true;
  if (filters.tags && file.tags?.some((t) => {
    const tagName = typeof t === 'string' ? t : t.name;
    return tagName?.toLowerCase().includes(q);
  })) return true;
  if (!filters.name && !filters.ocrText && !filters.tags) {
    if (file.name.toLowerCase().includes(q)) return true;
    if (file.ocrText?.toLowerCase().includes(q)) return true;
    if (file.tags?.some((t) => {
      const tagName = typeof t === 'string' ? t : t.name;
      return tagName?.toLowerCase().includes(q);
    })) return true;
  }
  return false;
}

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useFiles();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ name: true, ocrText: true, tags: true });
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const files = data?.data ?? [];

  const filteredFiles = useMemo(
    () => searchQuery.trim() ? files.filter((f) => matchesQuery(f, searchQuery, filters)) : files,
    [files, searchQuery, filters]
  );

  const groups = groupByDate(filteredFiles);
  const groupKeys = Object.keys(groups);

  const fileIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    filteredFiles.forEach((f, i) => map.set(f.id, i));
    return map;
  }, [filteredFiles]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>Chargement...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>Erreur de chargement</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
    >
      <FlatList
        data={groupKeys}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'Aucun résultat' : 'Aucun fichier'}
            </Text>
          </View>
        }
        renderItem={({ item: dateKey }) => {
          const groupFiles = groups[dateKey];
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{formatDateLabel(dateKey)}</Text>
              <View style={styles.grid}>
                {groupFiles.map((file) => (
                  <FileGridItem
                    key={file.id}
                    file={file}
                    onPress={() =>
                      navigation.navigate('FileDetail', {
                        fileIds: filteredFiles.map((f) => f.id),
                        initialIndex: fileIdToIndex.get(file.id) ?? 0,
                      })
                    }
                  />
                ))}
              </View>
            </View>
          );
        }}
      />

      <SearchBar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClear={() => setSearchQuery('')}
        filters={filters}
        onFiltersChange={setFilters}
        bottomPadding={keyboardOpen ? insets.bottom+8 : 0}
      />

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navButton} onPress={() => {}}>
          <MaterialIcons name="home" size={24} color="#1976D2" />
          <Text style={styles.navText}>Accueil</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Upload')}
        >
          <MaterialIcons name="cloud-upload" size={24} color="#1976D2" />
          <Text style={styles.navText}>Upload</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Scan')}
        >
          <MaterialIcons name="document-scanner" size={24} color="#1976D2" />
          <Text style={styles.navText}>Scan</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 16,
    color: '#666',
  },
  list: {
    padding: 16,
    paddingBottom: 80,
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#333',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridItem: {
    width: ITEM_SIZE,
  },
  fileName: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  navButton: {
    alignItems: 'center',
    padding: 8,
    gap: 4,
  },
  navText: {
    fontSize: 16,
    color: '#1976D2',
  },
});
