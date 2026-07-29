import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useUpload, UploadFile } from '../hooks/useUpload';
import { usePollOcr, SseOcrListener } from '../hooks/usePollOcr';
import { UploadProgress } from './UploadProgress';
import { UploadError } from '../types';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';

interface UploadModalProps {
  visible: boolean;
  onClose: () => void;
  onUploadComplete?: () => void;
}

function getUploadErrorMessage(err: UploadError): string {
  switch (err.status) {
    case 400:
      return `${err.fileName} : format invalide (${err.message})`;
    case 404:
      return `${err.fileName} : endpoint introuvable`;
    case 413:
      return `${err.fileName} : fichier trop volumineux`;
    case 500:
      return `${err.fileName} : erreur serveur (${err.message})`;
    case 0:
      return `${err.fileName} : impossible de contacter le serveur`;
    default:
      return `${err.fileName} : erreur ${err.status} (${err.message})`;
  }
}

export function UploadModal({ visible, onClose, onUploadComplete }: UploadModalProps) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const upload = useUpload();
  const { pollOcr } = usePollOcr();

  const canClose = status === 'idle' || status === 'success' || status === 'error';

  const checkDupBeforeUpload = useCallback(async (files: UploadFile[]): Promise<UploadFile[]> => {
    const toUpload: UploadFile[] = [];
    for (const file of files) {
      try {
        const result = await apiClient.post<{ data: { duplicates: Array<{ id: string; name: string }>; count: number } }>(
          ENDPOINTS.DEDUP_CHECK,
          { name: file.name, size: 0 },
        );
        const duplicates = result.data?.duplicates ?? [];
        if (duplicates.length > 0) {
          const names = duplicates.map((d: { name: string }) => d.name).join(', ');
          let proceed = false;
          await new Promise<void>((resolve) => {
            Alert.alert(
              'Fichier existant',
              `"${file.name}" existe déjà sur le serveur (${names}).\nUploader quand même ?`,
              [
                { text: 'Ignorer', style: 'cancel', onPress: () => resolve() },
                { text: 'Uploader', onPress: () => { proceed = true; resolve(); } },
              ],
            );
          });
          if (proceed) toUpload.push(file);
        } else {
          toUpload.push(file);
        }
      } catch {
        toUpload.push(file);
      }
    }
    return toUpload;
  }, []);

  const doUpload = async (files: UploadFile[]) => {
    setStatus('uploading');
    setUploadedCount(0);
    setTotalCount(files.length);
    setError(undefined);

    try {
      const deduped = await checkDupBeforeUpload(files);
      if (deduped.length === 0) {
        setStatus('success');
        setUploadedCount(files.length);
        return;
      }

      setTotalCount(deduped.length);
      const response = await upload.mutateAsync(deduped);
      setUploadedCount(response.uploaded.length);

      if (response.uploaded.length > 0) {
        setStatus('processing');
        const results = await Promise.allSettled(
          response.uploaded.map((f) => pollOcr(f.id)),
        );
        const completed = results.filter(
          (r) => r.status === 'fulfilled' && r.value.status === 'completed',
        ).length;
        if (completed > 0) {
          setStatus('success');
        }
      }

      if (response.errors.length > 0) {
        setStatus('error');
        const messages = response.errors.map((e) => getUploadErrorMessage(e));
        setError(
          `${response.uploaded.length}/${totalCount} uploadés.\n${messages.join('\n')}`
        );
      } else {
        setStatus('success');
      }
    } catch (err) {
      setStatus('error');
      if (err instanceof UploadError) {
        setError(getUploadErrorMessage(err));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Erreur inconnue lors de l'upload");
      }
    }
  };

  const pickImages = async () => {
    try {
      const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm !== 'granted') {
        Alert.alert('Permission requise', "L'accès à la galerie est nécessaire pour sélectionner des photos.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsMultipleSelection: true,
      });

      if (result.canceled || result.assets.length === 0) return;

      const files = result.assets.map((asset) => ({
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: asset.fileName || 'photo.jpg',
      }));

      await doUpload(files);
    } catch (err) {
      Alert.alert('Erreur', "Impossible d'accéder à la galerie");
    }
  };

  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.assets.length === 0) return;

      const files = result.assets.map((asset) => ({
        uri: asset.uri,
        type: asset.mimeType || 'application/octet-stream',
        name: asset.name,
      }));

      await doUpload(files);
    } catch (err) {
      Alert.alert('Erreur', "Impossible de sélectionner des documents");
    }
  };

  const handleClose = useCallback(() => {
    if (!canClose) return;
    setStatus('idle');
    setError(undefined);
    setUploadedCount(0);
    setTotalCount(0);
    if (status === 'success') {
      onUploadComplete?.();
    }
    onClose();
  }, [canClose, status, onClose, onUploadComplete]);

  useEffect(() => {
    if (status === 'success') {
      const timer = setTimeout(() => {
        setStatus('idle');
        setError(undefined);
        setUploadedCount(0);
        setTotalCount(0);
        onUploadComplete?.();
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, onClose, onUploadComplete]);

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
        onPress={canClose ? handleClose : undefined}
      >
        <TouchableOpacity activeOpacity={1} style={styles.container} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Ajouter des fichiers</Text>
            {canClose && (
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <MaterialIcons name="close" size={22} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          <UploadProgress
            status={status}
            error={error}
            uploadedCount={uploadedCount}
            totalCount={totalCount}
          />

          <TouchableOpacity
            style={styles.photoButton}
            onPress={pickImages}
            disabled={status === 'uploading' || status === 'processing'}
          >
            <MaterialIcons name="photo-library" size={20} color="#fff" />
            <Text style={styles.buttonText}>Sélectionner des photos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.docButton}
            onPress={pickDocuments}
            disabled={status === 'uploading' || status === 'processing'}
          >
            <MaterialIcons name="description" size={20} color="#fff" />
            <Text style={styles.buttonText}>Sélectionner des documents</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  closeBtn: {
    padding: 4,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976D2',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  docButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
