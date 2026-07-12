import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Camera } from 'react-native-vision-camera';
import { useCameraCapture } from '../hooks/useCameraCapture';
import { UploadProgress } from '../components/UploadProgress';
import { PhotoThumbnailStrip } from '../components/PhotoThumbnailStrip';
import { useBatchStore } from '../hooks/useBatchStore';

type RootStackParamList = {
  Home: undefined;
  Upload: undefined;
  Scan: undefined;
  Search: undefined;
  BatchReview: { batchId: string };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ScanScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    cameraRef,
    hasPermission,
    requestPermission,
    device,
    photoOutput,
    capturePhoto,
    captureStatus,
    captureError,
    isActive,
    torchMode,
    toggleTorch,
    onStarted,
    onStopped,
    capturedPhotos,
    removeCapturedPhoto,
    clearCapturedPhotos,
    capturedCount,
  } = useCameraCapture();

  const { saveBatch } = useBatchStore();

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const statusToUploadProgress: Record<string, 'idle' | 'uploading' | 'processing' | 'success' | 'error'> = {
    idle: 'idle',
    capturing: 'uploading',
    uploading: 'uploading',
    success: 'success',
    error: 'error',
  };

  const finishBatch = () => {
    if (capturedPhotos.length === 0) return;

    const batchId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = new Date();
    const name = `Lot du ${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    saveBatch({
      id: batchId,
      name,
      createdAt: now.toISOString(),
      photos: capturedPhotos,
      tags: [],
    });

    clearCapturedPhotos();
    navigation.navigate('BatchReview', { batchId });
  };

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Permission caméra requise</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Accorder l'accès</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>Caméra initialisation...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        isActive={isActive}
        device={device}
        outputs={[photoOutput]}
        onStarted={onStarted}
        onStopped={onStopped}
      />

      <View style={styles.viewfinderOverlay} pointerEvents="none">
        <View style={styles.viewfinderFrame} />
      </View>

      <View style={styles.topOverlay}>
        <UploadProgress
          status={statusToUploadProgress[captureStatus]}
          error={captureError}
          totalCount={1}
          uploadedCount={captureStatus === 'success' ? 1 : 0}
        />

        {capturedCount > 0 && (
          <View style={styles.batchInfo}>
            <Text style={styles.batchInfoText}>{capturedCount} photo{capturedCount > 1 ? 's' : ''} prise{capturedCount > 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      <PhotoThumbnailStrip photos={capturedPhotos} onRemove={removeCapturedPhoto} />

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.torchButton} onPress={toggleTorch}>
          <Text style={styles.torchIcon}>{torchMode === 'on' ? '🔦' : '💡'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureButton, (captureStatus === 'capturing' || captureStatus === 'uploading') && styles.captureButtonDisabled]}
          onPress={capturePhoto}
          disabled={captureStatus === 'capturing' || captureStatus === 'uploading'}
        >
          <View style={styles.captureInner} />
        </TouchableOpacity>

        {capturedCount > 0 ? (
          <TouchableOpacity style={styles.finishButton} onPress={finishBatch}>
            <Text style={styles.finishText}>✓</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.torchButton} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 24,
  },
  permissionText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 16,
    color: '#fff',
    marginTop: 16,
  },
  viewfinderOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderFrame: {
    width: '85%',
    maxWidth: 400,
    aspectRatio: 3 / 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 12,
  },
  topOverlay: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
  },
  batchInfo: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  batchInfoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  torchButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  torchIcon: {
    fontSize: 24,
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  finishButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  finishText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
});
