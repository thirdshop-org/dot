import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text, Dimensions, KeyboardAvoidingView, Platform, Keyboard, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useAddTags, useMoveResources, useFolders, useFiles, useFreeLocalSpace, useCreateFolder } from '../hooks/useFiles';
import { SelectionPanel } from '../components/SelectionPanel';
import { UnifiedFileItem, isFolder } from '../types';
import { SearchBar, SearchFilters, MediaFilter } from '../components/SearchBar';
import { FileThumbnail } from '../components/FileThumbnail';
import { SettingsModal } from '../components/SettingsModal';
import { ConfirmModal, type ConfirmOption } from '../components/ConfirmModal';
import { UploadModal } from '../components/UploadModal';
import { SyncStatusIcon } from '../components/SyncStatusIcon';
import { NetworkStatusBar } from '../components/NetworkStatusBar';
import { useSyncQueue } from '../hooks/useSyncQueue';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { useAutoSync } from '../hooks/useAutoSync';
import { safDirectory, SyncMode, SyncGlobalMode } from '../services/safDirectory';
import { fileStore } from '../services/fileStore';
import { downloadRegistry } from '../services/downloadRegistry';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { useLocalFiles } from '../hooks/useLocalFiles';
import { deleteAsync } from 'expo-file-system/legacy';
import { useDebounce } from '../hooks/useDebounce';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PADDING_H = 15;
const ITEM_GAP = 6;

type RootStackParamList = {
  Home: undefined;
  Upload: undefined;
  Scan: undefined;
  FileDetail: { fileIds: string[]; initialIndex: number; deviceFiles?: Record<string, { localUri: string; name: string; mimeType: string; createdAt: string }> };
  FileEdit: { fileIds: string[] };
  Folder: { folderId: string; folderName: string };
  SyncDetail: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function parseBackendDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return new Date(dateStr);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}

const FileGridItem = React.memo(function FileGridItem({ file, size, onPress, onLongPress, selected }: { file: UnifiedFileItem; size: number; onPress?: (f: UnifiedFileItem) => void; onLongPress?: (f: UnifiedFileItem) => void; selected?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.gridItem, { width: size }, selected && styles.gridItemSelected]}
      onPress={() => onPress?.(file)}
      onLongPress={() => onLongPress?.(file)}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <FileThumbnail
        uri={file.url ?? file.localUri}
        thumbnailUrl={file.thumbnailUrl}
        mimeType={file.mimeType}
        fileName={file.name}
        size={size}
        syncStatus={file.syncStatus}
        isFolder={file.isFolder}
        isUploading={file.isUploading}
        uploadProgress={file.uploadProgress}
      />
      {selected && (
        <View style={styles.selectedOverlay}>
          <View style={styles.checkCircle}>
            <MaterialIcons name="check" size={18} color="#fff" />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
});

function matchesQuery(file: UnifiedFileItem, query: string, filters: SearchFilters): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (filters.name && file.name.toLowerCase().includes(q)) return true;
  if (filters.ocrText && file.ocrText?.toLowerCase().includes(q)) return true;
  if (!filters.name && !filters.ocrText) {
    if (file.name.toLowerCase().includes(q)) return true;
    if (file.ocrText?.toLowerCase().includes(q)) return true;
  }
  return false;
}

const PAGE_SIZE = 100;

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(1);
  const { data, isLoading, error, isFetching, refetch } = useFiles(null, page, PAGE_SIZE);
  const { hasPermission, requestPermission, pickAndScanRecursive, folders, refreshFolders, discovered } = useLocalFiles();
  const freeLocalSpace = useFreeLocalSpace();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [filters, setFilters] = useState<SearchFilters>({ name: true, ocrText: true });
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('documents');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [numColumns, setNumColumns] = useState(3);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [tagModalMode, setTagModalMode] = useState<'tag' | 'folder'>('tag');
  const [tagInput, setTagInput] = useState('');
  const addTags = useAddTags();
  const moveFiles = useMoveResources();
  const createFolder = useCreateFolder();
  const { data: foldersData } = useFolders();
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [globalSyncMode, setGlobalSyncMode] = useState<SyncGlobalMode>(() => safDirectory.getGlobalSyncMode());
  const [globalSyncCellular, setGlobalSyncCellular] = useState(() => safDirectory.getGlobalSyncCellular());
  const [confirmDeleteState, setConfirmDeleteState] = useState<{ message: string; options: ConfirmOption[] } | null>(null);
  const [removeFolderConfirmId, setRemoveFolderConfirmId] = useState<string | null>(null);
  const { pendingCount, isSyncing } = useSyncQueue();
  const { tasks: uploadTasks } = useUploadQueue();
  useAutoSync();

  const pinchScale = useSharedValue(1);

  const gridAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pinchScale.value }],
  }));

  const itemSize = (SCREEN_WIDTH - PADDING_H * 2 - (numColumns - 1) * ITEM_GAP) / numColumns;

  const loadMore = useCallback(() => {
    if (isFetching) return;
    const total = data?.meta?.total ?? 0;
    const loaded = data?.data?.length ?? 0;
    if (loaded < total) {
      setPage((p) => p + 1);
    }
  }, [isFetching, data?.meta?.total, data?.data?.length]);

  const totalFiles = data?.meta?.total ?? 0;
  const loadedFiles = data?.data?.length ?? 0;
  const hasMore = loadedFiles > 0 && loadedFiles < totalFiles;
  const isFiltering = mediaFilter !== 'all' || !!debouncedSearch.trim();

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <NetworkStatusBar />
          <SyncStatusIcon
            isSyncing={isSyncing}
            pendingCount={pendingCount}
            isUploading={uploadTasks.some(t => t.status === 'uploading')}
            uploadPendingCount={uploadTasks.filter(t => t.status === 'pending' || t.status === 'uploading').length}
            onPress={() => navigation.navigate('SyncDetail')}
          />
          <TouchableOpacity onPress={() => setUploadModalVisible(true)} style={{ padding: 8 }}>
            <MaterialIcons name="add-circle-outline" size={22} color="#1976D2" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSettingsModalVisible(true)} style={{ marginRight: 4, padding: 8 }}>
            <MaterialIcons name="settings" size={22} color="#666" />
          </TouchableOpacity>
        </View>
      ),
    });
    }, [navigation, pendingCount, isSyncing, uploadTasks]);


  const selectionMode = selectedIds.size > 0;

  const files = data?.data ?? [];

  const filteredFiles = useMemo(
    () => debouncedSearch.trim() ? files.filter((f) => matchesQuery(f, debouncedSearch, filters)) : files,
    [files, debouncedSearch, filters]
  );

  const mediaFilteredFiles = useMemo(() => {
    if (mediaFilter === 'all') return filteredFiles;
    return filteredFiles.filter((f) => {
      const mt = (f.mimeType ?? '').toLowerCase();
      if (mediaFilter === 'documents') return mt.startsWith('application/') || mt.startsWith('text/');
      if (mediaFilter === 'photos-videos') return mt.startsWith('image/') || mt.startsWith('video/');
      return true;
    });
  }, [filteredFiles, mediaFilter]);

  const uploadGhostItems = useMemo(() => {
    return uploadTasks
      .filter((t) => t.status === 'pending' || t.status === 'uploading')
      .map((t) => ({
        id: t.id,
        name: t.file.name,
        mimeType: t.file.type,
        size: 0,
        createdAt: new Date(t.createdAt).toISOString(),
        source: 'local' as const,
        syncStatus: 'local' as const,
        localUri: t.file.uri,
        tags: [],
        isFolder: false,
        isDeviceFile: false,
        isUploading: true,
        uploadProgress: t.progress,
        uploadStatus: t.status,
      }));
  }, [uploadTasks]);

  const sortedFiles = useMemo(() => {
    const uploadedExistingIds = new Set(
      mediaFilteredFiles.map((f) => f.localUri).filter(Boolean)
    );
    const ghosts = uploadGhostItems.filter(
      (g) => g.localUri && !uploadedExistingIds.has(g.localUri)
    );
    return [...ghosts, ...mediaFilteredFiles].sort((a, b) => {
      const da = parseBackendDate(a.createdAt);
      const db = parseBackendDate(b.createdAt);
      return (db?.getTime() ?? 0) - (da?.getTime() ?? 0);
    });
  }, [mediaFilteredFiles, uploadGhostItems]);

  const displayedCount = sortedFiles.length;

  const fileIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    sortedFiles.forEach((f, i) => map.set(f.id, i));
    return map;
  }, [sortedFiles]);

  const handlePinchEnd = useCallback((scale: number) => {
    if (scale > 1.2) {
      setNumColumns(prev => Math.max(2, prev - 1));
    } else if (scale < 0.8) {
      setNumColumns(prev => Math.min(6, prev + 1));
    }
  }, []);

  const pinchGesture = useMemo(() =>
    Gesture.Pinch()
      .onBegin(() => {
        pinchScale.value = 1;
      })
      .onChange((event) => {
        pinchScale.value = event.scale;
      })
      .onEnd((event) => {
        pinchScale.value = withSpring(1);
        runOnJS(handlePinchEnd)(event.scale);
      }),
    []
  );

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
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const hasSynced = ids.some((id) => {
      const f = files.find((fi) => fi.id === id);
      return f?.syncStatus === 'synced';
    });
    const label = ids.length === 1 ? 'ce fichier' : `ces ${ids.length} fichiers`;
    const options: ConfirmOption[] = [];
    if (hasSynced) {
      options.push({
        label: 'Du device uniquement',
        onPress: async () => {
          const syncedIds = ids.filter((id) => {
            const f = files.find((fi) => fi.id === id);
            return f?.syncStatus === 'synced';
          });
          if (syncedIds.length > 0) {
            await freeLocalSpace.mutateAsync(syncedIds);
          }
          setSelectedIds(new Set());
        },
      });
    }
    options.push({
      label: 'Du device + serveur',
      destructive: true,
      onPress: async () => {
        for (const id of ids) {
          const f = files.find((fi) => fi.id === id);
          if (f?.backendResourceId) {
            await apiClient.delete(`${ENDPOINTS.RESOURCES}/${f.backendResourceId}`);
            fileStore.deleteByBackendId(f.backendResourceId);
          } else {
            fileStore.deleteById(id);
          }
          if (f?.localUri) {
            try { await deleteAsync(f.localUri, { idempotent: true }); } catch {}
          }
          downloadRegistry.remove(id);
        }
        await queryClient.invalidateQueries({ queryKey: ['resources'] });
        setSelectedIds(new Set());
      },
    });
    options.push({ label: 'Annuler' });
    setConfirmDeleteState({ message: `Supprimer ${label} ?`, options });
  }, [selectedIds, files, freeLocalSpace, queryClient]);

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
    for (const id of ids) {
      await addTags.mutateAsync({ fileId: id, tags: [name] });
    }
    setTagModalVisible(false);
    setSelectedIds(new Set());
  }, [tagInput, selectedIds, addTags]);

  const handleCreateFolderFromModal = useCallback(async () => {
    const name = tagInput.trim();
    if (!name) return;
    const ids = Array.from(selectedIds);
    try {
      const newFolder = await createFolder.mutateAsync({ name });
      await moveFiles.mutateAsync({ resourceIds: ids, parentResourceId: newFolder.id });
      setTagModalVisible(false);
      setSelectedIds(new Set());
      navigation.navigate('Folder', { folderId: newFolder.id, folderName: newFolder.name });
    } catch {}
  }, [tagInput, selectedIds, createFolder, moveFiles, navigation]);

  const handleMove = useCallback(async (folderId: string | null) => {
    const ids = Array.from(selectedIds);
    await moveFiles.mutateAsync({ resourceIds: ids, parentResourceId: folderId });
    setMoveModalVisible(false);
    setSelectedIds(new Set());
  }, [selectedIds, moveFiles]);

  const handleToggleFolderVisibility = useCallback((folderId: string) => {
    safDirectory.toggleVisibility(folderId);
    refreshFolders();
  }, [refreshFolders]);

  const handleRemoveFolder = useCallback((folderId: string) => {
    setRemoveFolderConfirmId(folderId);
  }, []);

  const handleRemoveFolderConfirm = useCallback(() => {
    if (removeFolderConfirmId) {
      safDirectory.removeFolder(removeFolderConfirmId);
      refreshFolders();
    }
    setRemoveFolderConfirmId(null);
  }, [removeFolderConfirmId, refreshFolders]);

  const handleAddFolderRecursive = useCallback(async () => {
    setSettingsModalVisible(false);
    await pickAndScanRecursive();
  }, [pickAndScanRecursive]);

  const handleUpdateSyncMode = useCallback((folderId: string, mode: SyncMode) => {
    safDirectory.updateSyncMode(folderId, mode);
    refreshFolders();
  }, [refreshFolders]);

  const handleUpdateSyncCellular = useCallback((folderId: string, enabled: boolean) => {
    safDirectory.updateSyncCellular(folderId, enabled);
    refreshFolders();
  }, [refreshFolders]);

  const handleSetGlobalSyncMode = useCallback((mode: SyncGlobalMode) => {
    safDirectory.setGlobalSyncMode(mode);
    setGlobalSyncMode(mode);
  }, []);

  const handleSetGlobalSyncCellular = useCallback((enabled: boolean) => {
    safDirectory.setGlobalSyncCellular(enabled);
    setGlobalSyncCellular(enabled);
  }, []);

  const handleItemPress = useCallback((file: UnifiedFileItem) => {
    if (selectionMode) {
      toggleSelection(file.id);
    } else if (isFolder(file)) {
      navigation.navigate('Folder', { folderId: file.id, folderName: file.name });
    } else {
      const deviceFilesMap: Record<string, { localUri: string; name: string; mimeType: string; createdAt: string }> = {};
      for (const f of sortedFiles) {
        if (f.isDeviceFile && f.localUri) {
          deviceFilesMap[f.id] = { localUri: f.localUri, name: f.name, mimeType: f.mimeType, createdAt: f.createdAt };
        }
      }
      navigation.navigate('FileDetail', {
        fileIds: sortedFiles.map((f) => f.id),
        initialIndex: fileIdToIndex.get(file.id) ?? 0,
        deviceFiles: Object.keys(deviceFilesMap).length > 0 ? deviceFilesMap : undefined,
      });
    }
  }, [selectionMode, toggleSelection, navigation, sortedFiles, fileIdToIndex]);

  const handleItemLongPress = useCallback((file: UnifiedFileItem) => {
    if (!selectionMode) {
      toggleSelection(file.id);
    }
  }, [selectionMode, toggleSelection]);

  const renderItem = useCallback(({ item }: { item: UnifiedFileItem }) => (
    <FileGridItem
      file={item}
      size={itemSize}
      selected={selectedIds.has(item.id)}
      onPress={handleItemPress}
      onLongPress={handleItemLongPress}
    />
  ), [itemSize, selectedIds, handleItemPress, handleItemLongPress]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        {!hasPermission ? (
          <View style={styles.permissionBanner}>
            <MaterialIcons name="photo-library" size={28} color="#1976D2" />
            <Text style={styles.permissionText}>
              Autorisez l'accès à vos photos pour les afficher ici
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Autoriser</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.infoText}>Chargement...</Text>
        )}
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
      {!hasPermission && (
        <View style={styles.permissionBanner}>
          <MaterialIcons name="photo-library" size={28} color="#1976D2" />
          <Text style={styles.permissionText}>
            Autorisez l'accès à vos photos pour les afficher ici
          </Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Autoriser</Text>
          </TouchableOpacity>
        </View>
      )}
      {files.length === 0 && !searchQuery && (
        <View style={styles.folderScanBanner}>
          {folders.length > 0 ? (
            <>
              <MaterialIcons name="folder" size={24} color="#F57C00" />
              <Text style={styles.folderScanText}>
                {folders.length} dossier{folders.length > 1 ? 's' : ''} scanné{folders.length > 1 ? 's' : ''}
              </Text>
              <TouchableOpacity style={styles.permissionBtn} onPress={pickAndScanRecursive}>
                <Text style={styles.permissionBtnText}>Tout scanner</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <MaterialIcons name="folder-open" size={24} color="#F57C00" />
              <Text style={styles.folderScanText}>
                Scanner un dossier de votre appareil
              </Text>
              <TouchableOpacity style={styles.permissionBtn} onPress={pickAndScanRecursive}>
                <Text style={styles.permissionBtnText}>Choisir</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      <GestureDetector gesture={pinchGesture}>
        <Animated.View style={[styles.listWrapper, gridAnimatedStyle]}>
          <FlatList
            key={numColumns}
            data={sortedFiles}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            columnWrapperStyle={{ gap: ITEM_GAP }}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              hasMore ? (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore} disabled={isFetching}>
                  {isFetching ? (
                    <ActivityIndicator size="small" color="#1976D2" />
                  ) : (
                    <Text style={styles.loadMoreText}>
                      Charger plus ({displayedCount}{!isFiltering && `/${totalFiles}`})
                    </Text>
                  )}
                </TouchableOpacity>
              ) : displayedCount > 0 ? (
                <Text style={styles.loadedAllText}>{displayedCount} fichier{displayedCount > 1 ? 's' : ''}</Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {debouncedSearch ? 'Aucun résultat' : 'Aucun fichier'}
                </Text>
              </View>
            }
            renderItem={renderItem}
          />
        </Animated.View>
      </GestureDetector>

      {!selectionMode && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
          filters={filters}
          onFiltersChange={setFilters}
          mediaFilter={mediaFilter}
          onMediaFilterChange={setMediaFilter}
          bottomPadding={keyboardOpen ? insets.bottom+8 : 0}
        />
      )}

      {selectionMode ? (
        <SelectionPanel
          selectedCount={selectedIds.size}
          onClose={clearSelection}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onTags={() => openTagModal('tag')}
          onFolder={() => openTagModal('folder')}
          onMove={() => setMoveModalVisible(true)}
          insetsBottom={insets.bottom}
        />
      ) : (
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navButton} onPress={() => {}}>
            <MaterialIcons name="home" size={24} color="#1976D2" />
            <Text style={styles.navText}>Accueil</Text>
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
                onPress={tagModalMode === 'folder' ? handleCreateFolderFromModal : handleAddTag}
                disabled={!tagInput.trim()}
              >
                <Text style={styles.modalConfirmText}>{tagModalMode === 'folder' ? 'Créer' : 'Ajouter'}</Text>
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
            {(foldersData ?? []).map((folder) => (
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

      <UploadModal
        visible={uploadModalVisible}
        onClose={() => setUploadModalVisible(false)}
      />

      <SettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        folders={folders}
        onToggleVisibility={handleToggleFolderVisibility}
        onRemoveFolder={handleRemoveFolder}
        onAddFolderRecursive={handleAddFolderRecursive}
        onUpdateSyncMode={handleUpdateSyncMode}
        onUpdateSyncCellular={handleUpdateSyncCellular}
        globalSyncMode={globalSyncMode}
        onSetGlobalSyncMode={handleSetGlobalSyncMode}
        globalSyncCellular={globalSyncCellular}
        onSetGlobalSyncCellular={handleSetGlobalSyncCellular}
      />

      <ConfirmModal
        visible={confirmDeleteState !== null}
        title="Supprimer"
        message={confirmDeleteState?.message}
        options={confirmDeleteState?.options ?? []}
        onClose={() => setConfirmDeleteState(null)}
      />

      <ConfirmModal
        visible={removeFolderConfirmId !== null}
        title="Supprimer le dossier"
        message="Le dossier sera retiré de la liste. Les fichiers resteront sur votre appareil."
        options={[
          { label: 'Annuler' },
          { label: 'Supprimer', destructive: true, onPress: handleRemoveFolderConfirm },
        ]}
        onClose={() => setRemoveFolderConfirmId(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadMoreText: {
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '600',
  },
  loadedAllText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#999',
    paddingVertical: 12,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  permissionText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  permissionBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  permissionBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  folderScanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  folderScanText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
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
  listWrapper: {
    flex: 1,
  },
  list: {
    padding: PADDING_H,
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
  gridItem: {
    marginBottom: ITEM_GAP,
  },
  gridItemSelected: {
    opacity: 0.85,
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
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
    gap: 8,
    paddingVertical: 4,
  },
  selectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  deleteChip: { backgroundColor: '#FFEBEE' },
  editChip: { backgroundColor: '#E3F2FD' },
  tagChip: { backgroundColor: '#F3E5F5' },
  folderChip: { backgroundColor: '#FFF3E0' },
  moveChip: { backgroundColor: '#E0F2F1' },
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
