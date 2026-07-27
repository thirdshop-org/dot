import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StoredFolder, SyncMode } from '../services/safDirectory';

type SettingsView = 'menu' | 'folders' | 'sync';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  folders: StoredFolder[];
  onToggleVisibility: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onAddFolder: () => void;
  onUpdateSyncMode: (folderId: string, mode: SyncMode) => void;
  onUpdateSyncCellular: (folderId: string, enabled: boolean) => void;
}

const SYNC_MODES: { value: SyncMode; label: string; icon: string; color: string }[] = [
  { value: 'none', label: 'Aucun', icon: 'sync-disabled', color: '#999' },
  { value: 'manual', label: 'Manuel', icon: 'sync', color: '#1976D2' },
  { value: 'auto', label: 'Auto', icon: 'sync-problem', color: '#43A047' },
];

export function SettingsModal({
  visible,
  onClose,
  folders,
  onToggleVisibility,
  onRemoveFolder,
  onAddFolder,
  onUpdateSyncMode,
  onUpdateSyncCellular,
}: SettingsModalProps) {
  const [view, setView] = useState<SettingsView>('menu');

  const handleClose = useCallback(() => {
    setView('menu');
    onClose();
  }, [onClose]);

  const handleRemoveFolder = useCallback(
    (folder: StoredFolder) => {
      Alert.alert(
        'Supprimer le dossier',
        'Le dossier sera retiré de la liste. Les fichiers resteront sur votre appareil.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () => onRemoveFolder(folder.id),
          },
        ]
      );
    },
    [onRemoveFolder]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity activeOpacity={1} style={styles.container} onPress={() => {}}>
          <View style={styles.handle} />

          {view === 'menu' && (
            <MenuView
              onSelect={(v) => setView(v)}
              onClose={handleClose}
            />
          )}

          {view === 'folders' && (
            <FoldersView
              folders={folders}
              onBack={() => setView('menu')}
              onToggleVisibility={onToggleVisibility}
              onRemoveFolder={handleRemoveFolder}
              onAddFolder={onAddFolder}
            />
          )}

          {view === 'sync' && (
            <SyncView
              folders={folders}
              onBack={() => setView('menu')}
              onUpdateSyncMode={onUpdateSyncMode}
              onUpdateSyncCellular={onUpdateSyncCellular}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function MenuView({ onSelect, onClose }: { onSelect: (v: SettingsView) => void; onClose: () => void }) {
  return (
    <View>
      <Text style={styles.title}>Paramètres</Text>

      <TouchableOpacity style={styles.menuItem} onPress={() => onSelect('folders')}>
        <View style={[styles.menuIcon, { backgroundColor: '#FFF3E0' }]}>
          <MaterialIcons name="folder" size={22} color="#F57C00" />
        </View>
        <View style={styles.menuTextContainer}>
          <Text style={styles.menuLabel}>Dossiers</Text>
          <Text style={styles.menuDescription}>Gérer les dossiers affichés</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color="#ccc" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.menuItem} onPress={() => onSelect('sync')}>
        <View style={[styles.menuIcon, { backgroundColor: '#E3F2FD' }]}>
          <MaterialIcons name="cloud-sync" size={22} color="#1976D2" />
        </View>
        <View style={styles.menuTextContainer}>
          <Text style={styles.menuLabel}>Synchronisation</Text>
          <Text style={styles.menuDescription}>Configurer l'upload automatique</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color="#ccc" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>Fermer</Text>
      </TouchableOpacity>
    </View>
  );
}

function FoldersView({
  folders,
  onBack,
  onToggleVisibility,
  onRemoveFolder,
  onAddFolder,
}: {
  folders: StoredFolder[];
  onBack: () => void;
  onToggleVisibility: (id: string) => void;
  onRemoveFolder: (folder: StoredFolder) => void;
  onAddFolder: () => void;
}) {
  return (
    <ScrollView style={styles.viewContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.viewHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Dossiers</Text>
      </View>

      {folders.length === 0 ? (
        <Text style={styles.emptyText}>Aucun dossier configuré</Text>
      ) : (
        folders.map((folder) => (
          <View key={folder.id} style={styles.folderRow}>
            <MaterialIcons name="folder" size={20} color="#F57C00" />
            <Text style={styles.folderName} numberOfLines={1}>
              {folder.name}
            </Text>
            <TouchableOpacity
              onPress={() => onToggleVisibility(folder.id)}
              style={styles.actionBtn}
            >
              <MaterialIcons
                name={folder.visible ? 'visibility' : 'visibility-off'}
                size={20}
                color={folder.visible ? '#1976D2' : '#999'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onRemoveFolder(folder)}
              style={styles.actionBtn}
            >
              <MaterialIcons name="delete-outline" size={20} color="#E53935" />
            </TouchableOpacity>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.addBtn} onPress={onAddFolder}>
        <MaterialIcons name="add" size={20} color="#fff" />
        <Text style={styles.addBtnText}>Ajouter un dossier</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SyncView({
  folders,
  onBack,
  onUpdateSyncMode,
  onUpdateSyncCellular,
}: {
  folders: StoredFolder[];
  onBack: () => void;
  onUpdateSyncMode: (id: string, mode: SyncMode) => void;
  onUpdateSyncCellular: (id: string, enabled: boolean) => void;
}) {
  return (
    <ScrollView style={styles.viewContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.viewHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Synchronisation</Text>
      </View>

      <Text style={styles.syncInfo}>
        Configurez comment les fichiers de chaque dossier sont envoyés au serveur.
      </Text>

      {folders.length === 0 ? (
        <Text style={styles.emptyText}>Aucun dossier configuré</Text>
      ) : (
        folders.map((folder) => (
          <View key={folder.id} style={styles.syncFolderCard}>
            <View style={styles.syncFolderHeader}>
              <MaterialIcons name="folder" size={18} color="#F57C00" />
              <Text style={styles.syncFolderName} numberOfLines={1}>
                {folder.name}
              </Text>
            </View>

            <View style={styles.radioGroup}>
              {SYNC_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode.value}
                  style={[
                    styles.radioBtn,
                    folder.syncMode === mode.value && styles.radioBtnActive,
                  ]}
                  onPress={() => onUpdateSyncMode(folder.id, mode.value)}
                >
                  <MaterialIcons
                    name={
                      folder.syncMode === mode.value
                        ? 'radio-button-checked'
                        : 'radio-button-unchecked'
                    }
                    size={18}
                    color={folder.syncMode === mode.value ? mode.color : '#999'}
                  />
                  <Text
                    style={[
                      styles.radioLabel,
                      folder.syncMode === mode.value && { color: mode.color },
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {folder.syncMode !== 'none' && (
              <View style={styles.cellularRow}>
                <MaterialIcons name="cell-tower" size={18} color="#666" />
                <Text style={styles.cellularLabel}>Réseau cellulaire</Text>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    folder.syncCellular && styles.toggleBtnActive,
                  ]}
                  onPress={() => onUpdateSyncCellular(folder.id, !folder.syncCellular)}
                >
                  <View
                    style={[
                      styles.toggleDot,
                      folder.syncCellular && styles.toggleDotActive,
                    ]}
                  />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    width: '85%',
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuTextContainer: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  menuDescription: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  closeBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeBtnText: {
    fontSize: 15,
    color: '#666',
  },
  viewContainer: {
    maxHeight: 500,
  },
  viewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  backBtn: {
    padding: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginVertical: 20,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  folderName: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  actionBtn: {
    padding: 6,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F57C00',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 16,
    gap: 8,
  },
  addBtnText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  syncInfo: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    lineHeight: 18,
  },
  syncFolderCard: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  syncFolderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  syncFolderName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  radioBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 4,
  },
  radioBtnActive: {
    borderWidth: 1.5,
  },
  radioLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
  },
  cellularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
  },
  cellularLabel: {
    flex: 1,
    fontSize: 13,
    color: '#666',
  },
  toggleBtn: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleBtnActive: {
    backgroundColor: '#1976D2',
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  toggleDotActive: {
    alignSelf: 'flex-end',
  },
});
