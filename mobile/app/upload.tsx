import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useUpload } from '../hooks/useUpload';
import { UploadProgress } from '../components/UploadProgress';

export function UploadScreen() {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const upload = useUpload();

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

      if (result.canceled) return;

      const assets = result.assets;
      if (assets.length === 0) return;

      setUploadStatus('uploading');
      setUploadedCount(0);
      setTotalCount(assets.length);

      const files = assets.map((asset) => ({
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: asset.fileName || 'photo.jpg',
      }));

      try {
        const response = await upload.mutateAsync(files);
        setUploadedCount(response.uploaded.length);

        if (response.errors.length > 0) {
          setUploadStatus('error');
          setError(`${response.uploaded.length}/${totalCount} uploadés. Erreurs : ${response.errors.map((e) => e.name).join(', ')}`);
        } else {
          setUploadStatus('success');
        }
      } catch (err) {
        setUploadStatus('error');
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    } catch (err) {
      Alert.alert('Erreur', "Impossible d'accéder à la galerie");
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
  },
  uploadText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
