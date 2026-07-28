import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useUpload, UploadFile } from '../hooks/useUpload';
import { usePollOcr } from '../hooks/usePollOcr';
import { UploadProgress } from '../components/UploadProgress';
import { UploadError, HttpError } from '../types';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';

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

export function UploadScreen() {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const upload = useUpload();
  const { pollOcr } = usePollOcr();

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
    setUploadStatus('uploading');
    setUploadedCount(0);
    setTotalCount(files.length);
    setError(undefined);

    try {
      const deduped = await checkDupBeforeUpload(files);
      if (deduped.length === 0) {
        setUploadStatus('success');
        setUploadedCount(files.length);
        return;
      }

      setTotalCount(deduped.length);
      const response = await upload.mutateAsync(deduped);
      setUploadedCount(response.uploaded.length);

      if (response.uploaded.length > 0) {
        setUploadStatus('processing');
        const results = await Promise.allSettled(
          response.uploaded.map((f) => pollOcr(f.id)),
        );
        const completed = results.filter(
          (r) => r.status === 'fulfilled' && r.value.status === 'completed',
        ).length;
        if (completed > 0) {
          setUploadStatus('success');
        }
      }

      if (response.errors.length > 0) {
        setUploadStatus('error');
        const messages = response.errors.map((e) => getUploadErrorMessage(e));
        setError(
          `${response.uploaded.length}/${totalCount} uploadés.\n${messages.join('\n')}`
        );
      } else {
        setUploadStatus('success');
      }
    } catch (err) {
      setUploadStatus('error');
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
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
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

  return (
    <View style={styles.container}>
      <UploadProgress
        status={uploadStatus}
        error={error}
        uploadedCount={uploadedCount}
        totalCount={totalCount}
      />

      <TouchableOpacity style={styles.uploadButton} onPress={pickImages}>
        <Text style={styles.uploadText}>Sélectionner des photos</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.docButton} onPress={pickDocuments}>
        <Text style={styles.uploadText}>Sélectionner des documents</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  uploadButton: {
    backgroundColor: '#1976D2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  docButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  uploadText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
