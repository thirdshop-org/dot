import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { ONBOARDING_STEPS, CURRENT_ONBOARDING_VERSION, type OnboardingStep } from '../config/onboarding';
import { onboardingStorage } from '../services/onboardingStorage';
import { scanSubdirectories } from '../hooks/useDeviceFiles';
import { safDirectory } from '../services/safDirectory';
import * as FileSystem from 'expo-file-system/legacy';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ScanState = 'idle' | 'scanning' | 'done';

function stepIcon(step: OnboardingStep): keyof typeof MaterialIcons.glyphMap {
  if (step.icon === 'waving-hand') return 'waving-hand';
  if (step.icon === 'create-new-folder') return 'create-new-folder';
  if (step.icon === 'check-circle') return 'check-circle';
  if (step.icon === 'folder-off') return 'folder-off';
  return 'info';
}

function ScanProgressView() {
  return (
    <>
      <View style={styles.iconContainer}>
        <ActivityIndicator size={48} color="#1976D2" />
      </View>
      <Text style={styles.title}>Scan en cours...</Text>
      <Text style={styles.description}>
        Dot. explore les sous-dossiers de votre stockage. Cela peut prendre quelques secondes.
      </Text>
    </>
  );
}

function ScanDoneView({ folderCount }: { folderCount: number }) {
  return (
    <>
      <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
        <MaterialIcons name="check-circle" size={64} color="#43A047" />
      </View>
      <Text style={styles.title}>Scan terminé !</Text>
      <Text style={styles.description}>
        {folderCount > 1
          ? `${folderCount} dossiers découverts et ajoutés à votre espace Dot.`
          : '1 dossier ajouté à votre espace Dot.'}
      </Text>
    </>
  );
}

export function OnboardingScreen() {
  const navigation = useNavigation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [folderCount, setFolderCount] = useState(0);
  const pendingSteps = onboardingStorage.getPendingSteps();

  const step = pendingSteps[currentIndex];

  const complete = useCallback(() => {
    onboardingStorage.setCompletedVersion(CURRENT_ONBOARDING_VERSION);
    navigation.reset({ index: 0, routes: [{ name: 'Home' as never }] });
  }, [navigation]);

  const handleRecursiveScan = useCallback(async () => {
    try {
      const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!result.granted) return;

      const dirUri = result.directoryUri;
      const parts = dirUri.split('/');
      const dirName = decodeURIComponent(parts[parts.length - 1] ?? 'Stockage');

      setScanState('scanning');

      safDirectory.addFolder(dirUri, dirName);

      const subdirs = await scanSubdirectories(dirUri);
      if (subdirs.length > 0) {
        safDirectory.addBatchFolders(
          subdirs.map((d) => ({ uri: d.uri, name: d.name, source: 'recursive', parentUri: d.parentUri }))
        );
      }

      setFolderCount(1 + subdirs.length);
      setScanState('done');

      safDirectory.setDiscovered();
    } catch (err) {
      console.error('[Onboarding] recursive scan error:', err);
      setScanState('idle');
    }
  }, []);

  const handleNext = useCallback(async () => {
    if (!step) return;
    onboardingStorage.markStepSeen(step.id);

    if (currentIndex < pendingSteps.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setScanState('idle');
      setFolderCount(0);
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

  const isScanStep = step.action?.type === 'recursive_scan';

  return (
    <View style={styles.container}>
      <View style={styles.skipContainer}>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>Passer</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {scanState === 'scanning' && isScanStep ? (
          <ScanProgressView />
        ) : scanState === 'done' && isScanStep ? (
          <ScanDoneView folderCount={folderCount} />
        ) : (
          <>
            <View style={styles.iconContainer}>
              <MaterialIcons name={stepIcon(step)} size={64} color="#1976D2" />
            </View>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.description}>{step.description}</Text>

            {isScanStep && scanState === 'idle' && (
              <TouchableOpacity style={styles.actionBtn} onPress={handleRecursiveScan}>
                <MaterialIcons name="folder-open" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>{step.action?.label ?? 'Choisir un dossier'}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {pendingSteps.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex && styles.dotActive]}
            />
          ))}
        </View>

        {(!isScanStep || scanState === 'done') && (
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>
              {currentIndex < pendingSteps.length - 1 ? 'Suivant' : 'Commencer'}
            </Text>
            <MaterialIcons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        {isScanStep && scanState === 'idle' && (
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>Passer cette étape</Text>
            <MaterialIcons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
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
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F57C00',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 10,
    marginTop: 32,
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
