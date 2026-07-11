import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

interface UploadProgressProps {
  progress?: number;
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  error?: string;
}

export function UploadProgress({ progress, status, error }: UploadProgressProps) {
  if (status === 'idle') return null;

  return (
    <View style={styles.container}>
      {status === 'uploading' && (
        <>
          <ActivityIndicator size="small" color="#1976D2" />
          <Text style={styles.text}>
            Upload en cours... {progress !== undefined && `${progress}%`}
          </Text>
        </>
      )}

      {status === 'processing' && (
        <>
          <ActivityIndicator size="small" color="#1976D2" />
          <Text style={styles.text}>Traitement OCR en cours...</Text>
        </>
      )}

      {status === 'success' && (
        <Text style={[styles.text, styles.success]}>Upload terminé !</Text>
      )}

      {status === 'error' && (
        <Text style={[styles.text, styles.error]}>
          {error || "Erreur lors de l'upload"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 16,
  },
  text: {
    marginLeft: 8,
    fontSize: 14,
    color: '#333',
  },
  success: {
    color: '#4CAF50',
  },
  error: {
    color: '#F44336',
  },
});
