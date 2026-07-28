import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text, Dimensions, Alert } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useDeleteFile, useFiles, useFreeLocalSpace } from '../hooks/useFiles';
import { UnifiedFileItem } from '../types';
import { isFolder } from '../types';
import { FileThumbnail } from '../components/FileThumbnail';
import { fileStore } from '../services/fileStore';
import { downloadRegistry } from '../services/downloadRegistry';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { useQueryClient } from '@tanstack/react-query';
import { deleteAsync } from 'expo-file-system/legacy';

const NUM_COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = (SCREEN_WIDTH - 16 * 2 - (NUM_COLUMNS - 1) * 6) / NUM_COLUMNS;

type RootStackParamList = {
  Folder: { folderId: string; folderName: string };
  FileDetail: { fileIds: string[]; initialIndex: number };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type FolderRouteProp = RouteProp<RootStackParamList, 'Folder'>;

function FolderGridItem({ file, onPress, onLongPress, selected, onFolderPress }: {
  file: UnifiedFileItem;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  onFolderPress?: () => void;
}) {
  const folder = isFolder(file);

  return (
    <TouchableOpacity
      style={[styles.gridItem, selected && styles.gridItemSelected]}
      onPress={folder ? onFolderPress : onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <FileThumbnail
        uri={file.url ?? file.localUri}
        thumbnailUrl={file.thumbnailUrl}
        mimeType={file.mimeType}
        fileName={file.name}
        size={ITEM_SIZE}
        syncStatus={file.syncStatus}
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

export function FolderScreen() {
  const route = useRoute<FolderRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { folderId, folderName } = route.params;
  const { data, isLoading } = useFiles(folderId);
  const deleteFile = useDeleteFile();
  const freeLocalSpace = useFreeLocalSpace();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectionMode = selectedIds.size > 0;

  useEffect(() => {
    navigation.setOptions({ title: folderName });
  }, [navigation, folderName]);

  const files = useMemo(() => {
    return data?.data ?? [];
  }, [data]);

  const fileIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    files.forEach((f, i) => map.set(f.id, i));
    return map;
  }, [files]);

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
    const options: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: 'Annuler', style: 'cancel' },
    ];
    if (hasSynced) {
      options.push({
        text: 'Du device uniquement',
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
      text: 'Du device + serveur',
      style: 'destructive',
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
        await queryClient.invalidateQueries({ queryKey: ['files'] });
        setSelectedIds(new Set());
      },
    });
    Alert.alert('Supprimer', `Supprimer ${label} ?`, options);
  }, [selectedIds, files, deleteFile, freeLocalSpace, queryClient]);

  const handleItemPress = useCallback((file: UnifiedFileItem) => {
    if (selectionMode) {
      toggleSelection(file.id);
    } else if (isFolder(file)) {
      navigation.push('Folder', { folderId: file.id, folderName: file.name });
    } else {
      navigation.navigate('FileDetail', {
        fileIds: files.map((f) => f.id),
        initialIndex: fileIdToIndex.get(file.id) ?? 0,
      });
    }
  }, [selectionMode, toggleSelection, navigation, files, fileIdToIndex]);

  const handleItemLongPress = useCallback((file: UnifiedFileItem) => {
    if (!selectionMode) toggleSelection(file.id);
  }, [selectionMode, toggleSelection]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={files}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="folder-open" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Dossier vide</Text>
          </View>
        }
        renderItem={({ item: file }) => (
          <FolderGridItem
            file={file}
            selected={selectedIds.has(file.id)}
            onPress={() => handleItemPress(file)}
            onLongPress={() => handleItemLongPress(file)}
            onFolderPress={() => navigation.push('Folder', { folderId: file.id, folderName: file.name })}
          />
        )}
      />

      {selectionMode && (
        <View style={styles.selectionBar}>
          <View style={styles.selectionHeader}>
            <TouchableOpacity onPress={clearSelection} style={styles.cancelBtn}>
              <MaterialIcons name="close" size={22} color="#333" />
            </TouchableOpacity>
            <Text style={styles.selectionCount}>
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <MaterialIcons name="delete" size={20} color="#F44336" />
            <Text style={styles.deleteText}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
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
  selectionBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#F44336',
    gap: 6,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F44336',
  },
});
