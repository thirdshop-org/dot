import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { ONBOARDING_STEPS, CURRENT_ONBOARDING_VERSION, type OnboardingStep } from '../config/onboarding';
import { onboardingStorage } from '../services/onboardingStorage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ICON_MAP: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  'waving-hand': 'waving-hand',
  'folder-off': 'folder-off',
  'create-new-folder': 'create-new-folder',
};

export function OnboardingScreen() {
  const navigation = useNavigation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const pendingSteps = onboardingStorage.getPendingSteps();

  const step = pendingSteps[currentIndex];

  const complete = useCallback(() => {
    onboardingStorage.setCompletedVersion(CURRENT_ONBOARDING_VERSION);
    navigation.navigate('Home' as never);
  }, [navigation]);

  const handlePickDirectory = useCallback(async () => {
    const { safDirectory } = await import('../services/safDirectory');
    const FileSystem = await import('expo-file-system/legacy');

    try {
      const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!result.granted) return;
      const dirUri = result.directoryUri;
      const parts = dirUri.split('/');
      const dirName = decodeURIComponent(parts[parts.length - 1] ?? 'Dossier');
      safDirectory.addFolder(dirUri, dirName);
    } catch (err) {
      console.error('[Onboarding] pickDirectory error:', err);
    }
  }, []);

  const handleNext = useCallback(async () => {
    if (!step) return;
    onboardingStorage.markStepSeen(step.id);

    if (currentIndex < pendingSteps.length - 1) {
      setCurrentIndex(currentIndex + 1);
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

  return (
    <View style={styles.container}>
      <View style={styles.skipContainer}>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>Passer</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialIcons
            name={ICON_MAP[step.icon] ?? 'info'}
            size={64}
            color="#1976D2"
          />
        </View>

        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>

        {step.action?.type === 'pick_directory' && (
          <TouchableOpacity style={styles.actionBtn} onPress={handlePickDirectory}>
            <MaterialIcons name="folder-open" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>{step.action.label}</Text>
          </TouchableOpacity>
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
