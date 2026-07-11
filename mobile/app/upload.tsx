import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useUpload } from '../hooks/useUpload';
import { UploadProgress } from '../components/UploadProgress';

export function UploadScreen() {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const upload = useUpload();

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', "L'accès à la galerie est nécessaire pour sélectionner une photo.");
        return;
      }
      console.log('yes')
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      console.log(result)
      if (result.canceled) return;

      if (result.assets && result.assets[0]) {
        setUploadStatus('uploading');
        const asset = result.assets[0];
        const file = {
          uri: asset.uri,
          type: asset.mimeType || 'image/jpeg',
          name: asset.fileName || 'photo.jpg',
        };

        try {
          const response = await upload.mutateAsync(file);
          setUploadStatus('processing');
          console.log('Upload success:', response);
          setUploadStatus('success');
        } catch (err) {
          setUploadStatus('error');
          setError(err instanceof Error ? err.message : 'Upload failed');
        }
      }
    } catch (err) {
      Alert.alert('Erreur', "Impossible d'accéder à la galerie");
    }
  };

  return (
    <View style={styles.container}>
      <UploadProgress status={uploadStatus} error={error} />

      <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
        <Text style={styles.uploadText}>Sélectionner une photo</Text>
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
