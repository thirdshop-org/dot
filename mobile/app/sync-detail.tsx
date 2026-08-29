import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fileStore, FileRecord } from '../services/fileStore';
import { useSyncQueue, useSyncProgress } from '../hooks/useSyncQueue';
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

function SpinningSyncIcon({ size, color }: { size: number; color: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <MaterialIcons name="sync" size={size} color={color} />
    </Animated.View>
  );
}

type PendingFile = { id: string; name: string };

const PendingSyncCard = React.memo(function PendingSyncCard({
  syncing,
  pendingCount,
  shortList,
  onSyncPress,
  onCancel,
}: {
  syncing: boolean;
  pendingCount: number;
  shortList: PendingFile[] | null;
  onSyncPress: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.pendingCard}>
      <TouchableOpacity
        style={styles.pendingCardTop}
        onPress={syncing ? undefined : onSyncPress}
        disabled={syncing}
        activeOpacity={0.8}
      >
        <View style={styles.pendingCardIcon}>
          {syncing ? (
            <SpinningSyncIcon size={28} color="#1976D2" />
          ) : (
            <MaterialIcons name="cloud-upload" size={28} color="#1976D2" />
          )}
        </View>
        <View style={styles.pendingCardInfo}>
          <Text style={styles.pendingCardTitle}>
            {syncing
              ? 'Synchronisation en cours...'
              : pendingCount > 1
                ? `Vous avez ${pendingCount} fichiers locaux pouvant être synchronisés`
                : 'Vous avez 1 fichier local pouvant être synchronisé'}
          </Text>
          <Text style={styles.pendingCardSubtitle}>
            {syncing
              ? shortList && shortList[0]
                ? `En cours : ${shortList[0].name}`
                : 'Synchronisation en cours...'
              : 'Appuyer maintenant pour les synchroniser'}
          </Text>
        </View>
        {!syncing && <MaterialIcons name="chevron-right" size={24} color="#999" />}
      </TouchableOpacity>

      {syncing && shortList && shortList.length > 0 && (
        <View style={styles.pendingList}>
          {shortList.map((f, i) => (
            <View key={f.id} style={styles.pendingRow}>
              {i === 0 ? (
                <SpinningSyncIcon size={16} color="#1976D2" />
              ) : (
                <MaterialIcons name="schedule" size={16} color="#FFA000" />
              )}
              <Text
                style={[styles.pendingRowText, i === 0 && styles.pendingRowActive]}
                numberOfLines={1}
              >
                {f.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {syncing && (
        <TouchableOpacity style={styles.stopBtn} onPress={onCancel} activeOpacity={0.8}>
          <MaterialIcons name="stop-circle" size={18} color="#fff" />
          <Text style={styles.stopBtnText}>Arrêter la synchronisation</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export function SyncDetailScreen() {
  const { pendingCount, isSyncing, refresh } = useSyncQueue();
  const { syncProgress } = useSyncProgress();
  const { syncManually, cancelSync } = useAutoSync();
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

  const syncing = !!syncProgress;
  const hasUploads = uploadTasks.length > 0;
  const hasPending = pendingCount > 0 || syncing;
  const hasErrors = errorFiles.length > 0;
  const hasContent = hasUploads || hasPending || hasErrors;

  const shortList = useMemo(() => {
    if (!syncProgress) return null;
    const { files, currentIndex } = syncProgress;
    const start = Math.max(0, currentIndex);
    return files.slice(start, start + 5);
  }, [syncProgress]);

  return (
    <View style={styles.container}>
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
          extraData={[isSyncing, syncProgress]}
          renderItem={({ item }) => {
            if (item.type === 'section') {
              return <Text style={styles.headerText}>{item.label}</Text>;
            }
            if (item.type === 'pendingCard') {
              return (
                <PendingSyncCard
                  syncing={syncing}
                  pendingCount={pendingCount}
                  shortList={shortList}
                  onSyncPress={handleSyncButtonPress}
                  onCancel={cancelSync}
                />
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
  pendingCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
  pendingList: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
    gap: 8,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pendingRowText: {
    flex: 1,
    fontSize: 13,
    color: '#999',
  },
  pendingRowActive: {
    color: '#1976D2',
    fontWeight: '500',
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E53935',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 4,
  },
  stopBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
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
