import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useUpload, UploadFile } from '../hooks/useUpload';
import { UploadProgress } from '../components/UploadProgress';
import { UploadError } from '../types';

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

  const doUpload = async (files: UploadFile[]) => {
    setUploadStatus('uploading');
    setUploadedCount(0);
    setTotalCount(files.length);
    setError(undefined);

    try {
      const response = await upload.mutateAsync(files);
      setUploadedCount(response.uploaded.length);

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
