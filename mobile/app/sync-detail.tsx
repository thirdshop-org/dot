import React, { useMemo, useCallback, useState, useEffect } from 'react';
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
  const { syncManually } = useAutoSync();
  const { push } = useSyncPush();
  const { tasks: uploadTasks, retry, retryAll } = useUploadQueue();

  const [listVersion, setListVersion] = useState(0);
  const bumpList = useCallback(() => setListVersion((v) => v + 1), []);

  useEffect(() => {
    const interval = setInterval(bumpList, 5000);
    return () => clearInterval(interval);
  }, [bumpList]);

  const errorFiles = useMemo(() => {
    return fileStore.getErrorFiles();
  }, [listVersion]);

  const uploadErrors = uploadTasks.filter((t) => t.status === 'error');

  const handleSyncAll = useCallback(async () => {
    for (const f of fileStore.getErrorFiles()) {
      fileStore.resetSyncError(f.id);
    }
    await syncManually();
    try {
      const { getStoredDeviceServerId } = await import('../hooks/useDeviceRegistration');
      const serverId = await getStoredDeviceServerId();
      if (serverId) {
        await push(serverId);
      }
    } catch { }
    refresh();
    bumpList();
  }, [syncManually, push, refresh, bumpList]);

  const handleSyncButtonPress = useCallback(async () => {
    if (uploadErrors.length > 0) {
      retryAll();
    }
    await handleSyncAll();
  }, [uploadErrors.length, retryAll, handleSyncAll]);

  const handleErrorFilePress = useCallback((file: FileRecord) => {
    Alert.alert(
      'Fichier en erreur',
      'Réessayer la synchronisation de ce fichier ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réessayer',
          onPress: () => {
            fileStore.resetSyncError(file.id);
            syncManually().finally(() => {
              refresh();
              bumpList();
            });
          },
        },
      ],
    );
  }, [syncManually, refresh, bumpList]);

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
  const hasPending = pendingCount > 0;
  const hasErrors = errorFiles.length > 0;
  const hasContent = hasUploads || hasPending || hasErrors;

  return (
    <View style={styles.container}>
      {(hasPending || hasErrors || uploadErrors.length > 0) && (
        <TouchableOpacity
          style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
          onPress={handleSyncButtonPress}
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
              : uploadErrors.length > 0
                ? `Tout réessayer (${uploadErrors.length + (hasPending ? pendingCount : 0)})`
                : `Synchroniser (${pendingCount})`}
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
            ...(hasErrors ? [{ type: 'section', label: 'Fichiers en erreur' } as const] : []),
            ...errorFiles.map((f) => ({ type: 'error' as const, data: f })),
            ...(hasPending ? [{ type: 'pendingCard' } as const] : []),
          ]}
          keyExtractor={(item) =>
            item.type === 'section' || item.type === 'pendingCard'
              ? item.type === 'pendingCard'
                ? 'pending-card'
                : item.label
              : item.data.id
          }
          renderItem={({ item }) => {
            if (item.type === 'section') {
              return <Text style={styles.headerText}>{item.label}</Text>;
            }
            if (item.type === 'pendingCard') {
              return (
                <TouchableOpacity
                  style={styles.pendingCard}
                  onPress={handleSyncButtonPress}
                  disabled={isSyncing}
                  activeOpacity={0.8}
                >
                  <View style={styles.pendingCardIcon}>
                    <MaterialIcons name="cloud-upload" size={28} color="#1976D2" />
                  </View>
                  <View style={styles.pendingCardInfo}>
                    <Text style={styles.pendingCardTitle}>
                      {pendingCount > 1
                        ? `Vous avez ${pendingCount} fichiers locaux pouvant être synchronisés`
                        : 'Vous avez 1 fichier local pouvant être synchronisé'}
                    </Text>
                    <Text style={styles.pendingCardSubtitle}>
                      Appuyer maintenant pour les synchroniser
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color="#999" />
                </TouchableOpacity>
              );
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
            if (item.type === 'error') {
              const file = item.data;
              return (
                <TouchableOpacity
                  style={[styles.fileRow, styles.fileRowError]}
                  onPress={() => handleErrorFilePress(file)}
                  activeOpacity={0.6}
                >
                  <MaterialIcons name="error" size={20} color="#E53935" />
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                    <Text style={styles.errorText}>
                      Échec de synchronisation · toucher pour réessayer
                    </Text>
                  </View>
                  <MaterialIcons name="refresh" size={18} color="#E53935" />
                </TouchableOpacity>
              );
            }
            return null;
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
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pendingCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingCardInfo: {
    flex: 1,
  },
  pendingCardTitle: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
  },
  pendingCardSubtitle: {
    fontSize: 13,
    color: '#1976D2',
    marginTop: 4,
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
