import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { fileStore, FileRecord } from '../services/fileStore';
import { safDirectory } from '../services/safDirectory';
import { useSyncQueue } from '../hooks/useSyncQueue';

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function SyncDetailScreen() {
  const insets = useSafeAreaInsets();
  const { pendingCount, isSyncing, refresh } = useSyncQueue();

  const pendingFiles = useMemo(() => {
    return fileStore.getPendingSync();
  }, []);

  const handleSyncAll = useCallback(() => {
    // TODO: lancer l'upload batch de tous les fichiers pending
    console.log(`[SyncDetail] sync demandé pour ${pendingFiles.length} fichiers`);
  }, [pendingFiles.length]);

  const renderItem = useCallback(({ item }: { item: FileRecord }) => (
    <View style={styles.fileRow}>
      <MaterialIcons name="insert-drive-file" size={20} color="#999" />
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.fileMeta}>
          {formatSize(item.size)}
          {item.mimeType ? ` · ${item.mimeType.split('/').pop()}` : ''}
        </Text>
      </View>
      <View style={styles.localBadge}>
        <MaterialIcons name="phone-android" size={14} color="#757575" />
      </View>
    </View>
  ), []);

  return (
    <View style={styles.container}>
      {pendingCount > 0 && (
        <TouchableOpacity
          style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
          onPress={handleSyncAll}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name="cloud-upload" size={20} color="#fff" />
          )}
          <Text style={styles.syncBtnText}>
            {isSyncing ? 'Synchronisation...' : `Synchroniser (${pendingCount})`}
          </Text>
        </TouchableOpacity>
      )}

      {pendingFiles.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="cloud-done" size={48} color="#4CAF50" />
          <Text style={styles.emptyTitle}>Tout est synchronisé</Text>
          <Text style={styles.emptySubtitle}>
            Aucun fichier en attente d'upload
          </Text>
        </View>
      ) : (
        <FlatList
          data={pendingFiles}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.headerText}>
              {pendingFiles.length} fichier{pendingFiles.length > 1 ? 's' : ''} en attente
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976D2',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 10,
    paddingVertical: 14,
    gap: 10,
  },
  syncBtnDisabled: {
    backgroundColor: '#90CAF9',
  },
  syncBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  headerText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  fileMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  localBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
  },
});
