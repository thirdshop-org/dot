import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { ONBOARDING_STEPS, CURRENT_ONBOARDING_VERSION } from '../config/onboarding';
import { onboardingStorage } from '../services/onboardingStorage';
import { safDirectory, StoredFolder } from '../services/safDirectory';
import * as FileSystem from 'expo-file-system/legacy';

function SelectFoldersStep({
  selectedFolders,
  onAddFolder,
  onRemoveFolder,
}: {
  selectedFolders: StoredFolder[];
  onAddFolder: () => void;
  onRemoveFolder: (folder: StoredFolder) => void;
}) {
  return (
    <View style={styles.folderStepContent}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="create-new-folder" size={64} color="#1976D2" />
      </View>
      <Text style={styles.title}>Ajoutez vos dossiers</Text>
      <Text style={styles.description}>
        Sélectionnez les dossiers que vous souhaitez synchroniser avec Dot.
      </Text>

      {selectedFolders.length > 0 && (
        <View style={styles.folderList}>
          {selectedFolders.map((f) => (
            <View key={f.id} style={styles.selectedFolderRow}>
              <MaterialIcons name="folder" size={20} color="#F57C00" />
              <Text style={styles.selectedFolderName} numberOfLines={1}>
                {f.name}
              </Text>
              <TouchableOpacity
                onPress={() => onRemoveFolder(f)}
                style={styles.removeBtn}
              >
                <MaterialIcons name="close" size={18} color="#E53935" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.actionBtn} onPress={onAddFolder}>
        <MaterialIcons name="add" size={20} color="#fff" />
        <Text style={styles.actionBtnText}>Ajouter un dossier</Text>
      </TouchableOpacity>
    </View>
  );
}

export function OnboardingScreen() {
  const navigation = useNavigation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedFolders, setSelectedFolders] = useState<StoredFolder[]>([]);
  const pendingSteps = onboardingStorage.getPendingSteps();

  const step = pendingSteps[currentIndex];

  const complete = useCallback(() => {
    onboardingStorage.setCompletedVersion(CURRENT_ONBOARDING_VERSION);
    navigation.reset({ index: 0, routes: [{ name: 'Home' as never }] });
  }, [navigation]);

  const handlePickDirectory = useCallback(async () => {
    try {
      const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!result.granted) return;
      const dirUri = result.directoryUri;
      const parts = dirUri.split('/');
      const dirName = decodeURIComponent(parts[parts.length - 1] ?? 'Dossier');

      const folder = safDirectory.addFolder(dirUri, dirName);
      setSelectedFolders((prev) => [...prev, folder]);
    } catch (err) {
      console.error('[Onboarding] pickDirectory error:', err);
    }
  }, []);

  const handleRemoveFolder = useCallback((folder: StoredFolder) => {
    safDirectory.removeFolder(folder.id);
    setSelectedFolders((prev) => prev.filter((f) => f.id !== folder.id));
  }, []);

  const handleNext = useCallback(async () => {
    if (!step) return;
    onboardingStorage.markStepSeen(step.id);

    if (currentIndex < pendingSteps.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedFolders([]);
    } else {
      complete();
    }
  }, [step, currentIndex, pendingSteps.length, complete]);

  const handleSkip = useCallback(() => {
    complete();
  }, [complete]);

  if (!step) {
    complete();
    return null;
  }

  const isFolderStep = step.action?.type === 'pick_directory';

  return (
    <View style={styles.container}>
      <View style={styles.skipContainer}>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>Passer</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
        {isFolderStep ? (
          <SelectFoldersStep
            selectedFolders={selectedFolders}
            onAddFolder={handlePickDirectory}
            onRemoveFolder={handleRemoveFolder}
          />
        ) : (
          <View style={styles.welcomeContent}>
            <View style={styles.iconContainer}>
              <MaterialIcons name="waving-hand" size={64} color="#1976D2" />
            </View>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.description}>{step.description}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {pendingSteps.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
          <Text style={styles.nextBtnText}>
            {currentIndex < pendingSteps.length - 1 ? 'Suivant' : 'Commencer'}
          </Text>
          <MaterialIcons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  skipContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  skipText: {
    fontSize: 16,
    color: '#999',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    flexGrow: 1,
  },
  welcomeContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  folderStepContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  folderList: {
    width: '100%',
    marginBottom: 16,
  },
  selectedFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
  },
  selectedFolderName: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  removeBtn: {
    padding: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F57C00',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 10,
    width: '100%',
  },
  actionBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 40,
    paddingBottom: 60,
    alignItems: 'center',
    gap: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ddd',
  },
  dotActive: {
    backgroundColor: '#1976D2',
    width: 24,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976D2',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
    gap: 8,
  },
  nextBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
