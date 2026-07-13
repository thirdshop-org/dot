import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text, Dimensions, KeyboardAvoidingView, Platform, Keyboard, Alert, Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useFiles, useFileImage, useDeleteFile, useAddTags, useMoveFiles, useFolders } from '../hooks/useFiles';
import { FileItem, isFolder } from '../types';
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
  FileEdit: { fileIds: string[] };
  Folder: { folderId: string; folderName: string };
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

function groupByTag(files: FileItem[]): GroupedFiles {
  const groups: GroupedFiles = {};
  for (const file of files) {
    const tags = file.tags ?? [];
    if (tags.length === 0) {
      if (!groups['Sans tag']) groups['Sans tag'] = [];
      groups['Sans tag'].push(file);
    } else {
      for (const tag of tags) {
        const name = typeof tag === 'string' ? tag : tag.tag_name;
        if (!name) continue;
        if (!groups[name]) groups[name] = [];
        groups[name].push(file);
      }
    }
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

function FileGridItem({ file, onPress, onLongPress, selected }: { file: FileItem; onPress?: () => void; onLongPress?: () => void; selected?: boolean }) {
  const { data, isLoading } = useFileImage(file.id);

  return (
    <TouchableOpacity
      style={[styles.gridItem, selected && styles.gridItemSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <FileThumbnail
        uri={data?.data?.url}
        mimeType={file.mimeType}
        fileName={file.name}
        size={ITEM_SIZE}
        isLoading={isLoading}
      />
      {selected && (
        <View style={styles.selectedOverlay}>
          <View style={styles.checkCircle}>
            <MaterialIcons name="check" size={18} color="#fff" />
          </View>
        </View>
      )}
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
    const tagName = typeof t === 'string' ? t : t.tag_name;
    return tagName?.toLowerCase().includes(q);
  })) return true;
  if (!filters.name && !filters.ocrText && !filters.tags) {
    if (file.name.toLowerCase().includes(q)) return true;
    if (file.ocrText?.toLowerCase().includes(q)) return true;
    if (file.tags?.some((t) => {
      const tagName = typeof t === 'string' ? t : t.tag_name;
      return tagName?.toLowerCase().includes(q);
    })) return true;
  }
  return false;
}

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useFiles();
  const deleteFile = useDeleteFile();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ name: true, ocrText: true, tags: true });
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupByTags, setGroupByTags] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [tagModalMode, setTagModalMode] = useState<'tag' | 'folder'>('tag');
  const [tagInput, setTagInput] = useState('');
  const addTags = useAddTags();
  const moveFiles = useMoveFiles();
  const { data: foldersData } = useFolders();
  const [moveModalVisible, setMoveModalVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const selectionMode = selectedIds.size > 0;

  const files = data?.data ?? [];

  const filteredFiles = useMemo(
    () => searchQuery.trim() ? files.filter((f) => matchesQuery(f, searchQuery, filters)) : files,
    [files, searchQuery, filters]
  );

  console.log(filteredFiles.map(f => f.tags))

  const groups = groupByTags ? groupByTag(filteredFiles) : groupByDate(filteredFiles);
  const groupKeys = Object.keys(groups);

  const fileIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    filteredFiles.forEach((f, i) => map.set(f.id, i));
    return map;
  }, [filteredFiles]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleDelete = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    const label = count === 1 ? 'ce fichier' : `ces ${count} fichiers`;
    Alert.alert(
      'Supprimer',
      `Supprimer ${label} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const ids = Array.from(selectedIds);
            for (const id of ids) {
              await deleteFile.mutateAsync(id);
            }
            setSelectedIds(new Set());
          },
        },
      ]
    );
  }, [selectedIds, deleteFile]);

  const handleEdit = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    navigation.navigate('FileEdit', { fileIds: ids });
    setSelectedIds(new Set());
  }, [selectedIds, navigation]);

  const openTagModal = useCallback((mode: 'tag' | 'folder') => {
    setTagModalMode(mode);
    setTagInput('');
    setTagModalVisible(true);
  }, []);

  const handleAddTag = useCallback(async () => {
    const name = tagInput.trim();
    if (!name) return;
    const ids = Array.from(selectedIds);
    const tagType = tagModalMode === 'folder' ? 'folder' : 'none';
    for (const id of ids) {
      await addTags.mutateAsync({ fileId: id, tags: [name], tagType });
    }
    setTagModalVisible(false);
    setSelectedIds(new Set());
  }, [tagInput, selectedIds, tagModalMode, addTags]);

  const handleMove = useCallback(async (folderId: string | null) => {
    const ids = Array.from(selectedIds);
    await moveFiles.mutateAsync({ fileIds: ids, parentFileId: folderId });
    setMoveModalVisible(false);
    setSelectedIds(new Set());
  }, [selectedIds, moveFiles]);

  const handleItemPress = useCallback((file: FileItem) => {
    if (selectionMode) {
      toggleSelection(file.id);
    } else if (isFolder(file)) {
      navigation.navigate('Folder', { folderId: file.id, folderName: file.name });
    } else {
      navigation.navigate('FileDetail', {
        fileIds: filteredFiles.map((f) => f.id),
        initialIndex: fileIdToIndex.get(file.id) ?? 0,
      });
    }
  }, [selectionMode, toggleSelection, navigation, filteredFiles, fileIdToIndex]);

  const handleItemLongPress = useCallback((file: FileItem) => {
    if (!selectionMode) {
      toggleSelection(file.id);
    }
  }, [selectionMode, toggleSelection]);

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
        renderItem={({ item: groupKey }) => {
          const groupFiles = groups[groupKey];
          const label = groupByTags ? groupKey : formatDateLabel(groupKey);
          return (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                {groupByTags && <MaterialIcons name="label" size={16} color="#1976D2" style={styles.sectionIcon} />}
                <Text style={styles.sectionTitle}>{label}</Text>
                <Text style={styles.sectionCount}>{groupFiles.length}</Text>
              </View>
              <View style={styles.grid}>
                {groupFiles.map((file) => (
                  <FileGridItem
                    key={file.id}
                    file={file}
                    selected={selectedIds.has(file.id)}
                    onPress={() => handleItemPress(file)}
                    onLongPress={() => handleItemLongPress(file)}
                  />
                ))}
              </View>
            </View>
          );
        }}
      />

      {!selectionMode && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
          filters={filters}
          onFiltersChange={setFilters}
          groupByTags={groupByTags}
          onGroupToggle={() => setGroupByTags(!groupByTags)}
          bottomPadding={keyboardOpen ? insets.bottom+8 : 0}
        />
      )}

      {selectionMode ? (
        <View style={[styles.selectionBar, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.selectionHeader}>
            <TouchableOpacity onPress={clearSelection} style={styles.cancelBtn}>
              <MaterialIcons name="close" size={22} color="#333" />
            </TouchableOpacity>
            <Text style={styles.selectionCount}>
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </Text>
            <TouchableOpacity onPress={clearSelection} style={styles.selectAllBtn}>
              <Text style={styles.selectAllText}>Tout</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={[styles.selectionActionBtn, styles.deleteActionBtn]}
              onPress={handleDelete}
            >
              <MaterialIcons name="delete" size={20} color="#F44336" />
              <Text style={[styles.selectionActionText, { color: '#F44336' }]}>Supprimer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionActionBtn, styles.editActionBtn]}
              onPress={handleEdit}
            >
              <MaterialIcons name="edit" size={20} color="#1976D2" />
              <Text style={[styles.selectionActionText, { color: '#1976D2' }]}>Éditer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionActionBtn, styles.tagActionBtn]}
              onPress={() => openTagModal('tag')}
            >
              <MaterialIcons name="label" size={20} color="#7B1FA2" />
              <Text style={[styles.selectionActionText, { color: '#7B1FA2' }]}>Tags</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionActionBtn, styles.folderActionBtn]}
              onPress={() => openTagModal('folder')}
            >
              <MaterialIcons name="create-new-folder" size={20} color="#F57C00" />
              <Text style={[styles.selectionActionText, { color: '#F57C00' }]}>Folder</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionActionBtn, styles.moveActionBtn]}
              onPress={() => setMoveModalVisible(true)}
            >
              <MaterialIcons name="drive-file-move" size={20} color="#00897B" />
              <Text style={[styles.selectionActionText, { color: '#00897B' }]}>Déplacer</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
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
      )}

      <Modal visible={tagModalVisible} transparent animationType="fade" onRequestClose={() => setTagModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setTagModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {tagModalMode === 'folder' ? 'Créer un dossier' : 'Ajouter un tag'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={tagModalMode === 'folder' ? 'Nom du dossier...' : 'Nom du tag...'}
              placeholderTextColor="#999"
              value={tagInput}
              onChangeText={setTagInput}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddTag}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setTagModalVisible(false)}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, !tagInput.trim() && styles.modalConfirmDisabled]}
                onPress={handleAddTag}
                disabled={!tagInput.trim()}
              >
                <Text style={styles.modalConfirmText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={moveModalVisible} transparent animationType="fade" onRequestClose={() => setMoveModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMoveModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>Déplacer vers...</Text>
            <TouchableOpacity
              style={styles.folderOption}
              onPress={() => handleMove(null)}
            >
              <MaterialIcons name="home" size={20} color="#666" />
              <Text style={styles.folderOptionText}>Racine</Text>
            </TouchableOpacity>
            {(foldersData?.data ?? []).map((folder) => (
              <TouchableOpacity
                key={folder.id}
                style={styles.folderOption}
                onPress={() => handleMove(folder.id)}
              >
                <MaterialIcons name="folder" size={20} color="#F57C00" />
                <Text style={styles.folderOptionText}>{folder.name}</Text>
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    padding: 15,
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
    color: '#333',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  sectionIcon: {
    marginTop: 2,
  },
  sectionCount: {
    fontSize: 14,
    color: '#999',
    fontWeight: '400',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridItem: {
    width: ITEM_SIZE,
  },
  gridItemSelected: {
    opacity: 0.85,
  },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 18,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    padding: 4,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
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
  selectionBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cancelBtn: {
    padding: 4,
  },
  selectionCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  selectAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectAllText: {
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '600',
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  selectionActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1.5,
  },
  deleteActionBtn: {
    borderColor: '#F44336',
    backgroundColor: 'transparent',
  },
  editActionBtn: {
    borderColor: '#1976D2',
    backgroundColor: 'transparent',
  },
  selectionActionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  tagActionBtn: {
    borderColor: '#7B1FA2',
    backgroundColor: 'transparent',
  },
  folderActionBtn: {
    borderColor: '#F57C00',
    backgroundColor: 'transparent',
  },
  moveActionBtn: {
    borderColor: '#00897B',
    backgroundColor: 'transparent',
  },
  folderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  folderOptionText: {
    fontSize: 16,
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalCancelText: {
    fontSize: 15,
    color: '#666',
  },
  modalConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  modalConfirmDisabled: {
    backgroundColor: '#ccc',
  },
  modalConfirmText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});
