import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { fileStore, FileRecord } from '../services/fileStore';
import { safDirectory } from '../services/safDirectory';
import { useSyncQueue } from '../hooks/useSyncQueue';
import { useAutoSync } from '../hooks/useAutoSync';
import { useSyncPush } from '../hooks/useSyncPush';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { UploadTask } from '../services/uploadQueue';

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function uploadStatusIcon(task: UploadTask) {
  switch (task.status) {
    case 'pending':
      return <MaterialIcons name="schedule" size={20} color="#FFA000" />;
    case 'uploading':
      return <ActivityIndicator size="small" color="#1976D2" />;
    case 'done':
      return <MaterialIcons name="check-circle" size={20} color="#4CAF50" />;
    case 'error':
      return <MaterialIcons name="error" size={20} color="#E53935" />;
  }
}

export function SyncDetailScreen() {
  const insets = useSafeAreaInsets();
  const { pendingCount, isSyncing, refresh } = useSyncQueue();
  const { triggerSync } = useAutoSync();
  const { push } = useSyncPush();
  const { tasks: uploadTasks, retry, retryAll } = useUploadQueue();

  const pendingFiles = useMemo(() => {
    return fileStore.getPendingSync();
  }, []);

  const handleSyncAll = useCallback(async () => {
    await triggerSync();
    try {
      const { getStoredDeviceServerId } = await import('../hooks/useDeviceRegistration');
      const serverId = await getStoredDeviceServerId();
      if (serverId) {
        await push(serverId);
      }
    } catch { }
    refresh();
  }, [triggerSync, push, refresh]);

  const handleTaskPress = useCallback((task: UploadTask) => {
    if (task.status !== 'error') return;
    Alert.alert(
      'Erreur d\'upload',
      task.error || 'Erreur inconnue',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réessayer', onPress: () => retry(task.id) },
      ],
    );
  }, [retry]);

  const hasUploads = uploadTasks.length > 0;
  const hasPending = pendingFiles.length > 0;
  const hasContent = hasUploads || hasPending;

  const uploadErrors = uploadTasks.filter((t) => t.status === 'error');

  return (
    <View style={styles.container}>
      {(hasPending || uploadErrors.length > 0) && (
        <TouchableOpacity
          style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
          onPress={uploadErrors.length > 0 && hasPending ? retryAll : handleSyncAll}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons
              name={uploadErrors.length > 0 ? "refresh" : "cloud-upload"}
              size={20}
              color="#fff"
            />
          )}
          <Text style={styles.syncBtnText}>
            {isSyncing ? 'Synchronisation...'
              : uploadErrors.length > 0 && hasPending
                ? 'Tout réessayer'
                : hasPending
                  ? `Synchroniser (${pendingCount})`
                  : `Réessayer (${uploadErrors.length})`}
          </Text>
        </TouchableOpacity>
      )}

      {!hasContent ? (
        <View style={styles.empty}>
          <MaterialIcons name="cloud-done" size={48} color="#4CAF50" />
          <Text style={styles.emptyTitle}>Tout est synchronisé</Text>
          <Text style={styles.emptySubtitle}>
            Aucun fichier en attente
          </Text>
        </View>
      ) : (
        <FlatList
          data={[
            ...(hasUploads ? [{ type: 'section', label: 'Uploads en cours' } as const] : []),
            ...uploadTasks.map((t) => ({ type: 'upload' as const, data: t })),
            ...(hasPending ? [{ type: 'section', label: 'Fichiers locaux à synchroniser' } as const] : []),
            ...pendingFiles.map((f) => ({ type: 'file' as const, data: f })),
          ]}
          keyExtractor={(item) =>
            item.type === 'section' ? item.label
              : item.type === 'upload' ? item.data.id
                : item.data.id
          }
          renderItem={({ item }) => {
            if (item.type === 'section') {
              return <Text style={styles.headerText}>{item.label}</Text>;
            }
            if (item.type === 'upload') {
              const task = item.data;
              return (
                <TouchableOpacity
                  style={[styles.fileRow, task.status === 'error' && styles.fileRowError]}
                  onPress={() => handleTaskPress(task)}
                  activeOpacity={task.status === 'error' ? 0.6 : 1}
                >
                  {uploadStatusIcon(task)}
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>{task.file.name}</Text>
                    {task.status === 'uploading' && (
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${task.progress}%` }]} />
                      </View>
                    )}
                    {task.status === 'error' && task.error && (
                      <Text style={styles.errorText} numberOfLines={1}>{task.error}</Text>
                    )}
                    {task.status === 'done' && (
                      <Text style={styles.doneText}>Upload terminé</Text>
                    )}
                    {task.status === 'pending' && (
                      <Text style={styles.pendingText}>En attente</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }
            const file = item.data;
            return (
              <View style={styles.fileRow}>
                <MaterialIcons name="insert-drive-file" size={20} color="#999" />
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  <Text style={styles.fileMeta}>
                    {formatSize(file.size)}
                    {file.mimeType ? ` · ${file.mimeType.split('/').pop()}` : ''}
                  </Text>
                </View>
                <View style={styles.localBadge}>
                  <MaterialIcons name="phone-android" size={14} color="#757575" />
                </View>
              </View>
            );
          }}
          contentContainerStyle={styles.list}
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
  fileRowError: {
    backgroundColor: '#FFF0F0',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1976D2',
    borderRadius: 2,
  },
  errorText: {
    fontSize: 12,
    color: '#E53935',
    marginTop: 2,
  },
  doneText: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 2,
  },
  pendingText: {
    fontSize: 12,
    color: '#FFA000',
    marginTop: 2,
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
