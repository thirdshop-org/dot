import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

interface UploadProgressProps {
  progress?: number;
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  error?: string;
  uploadedCount?: number;
  totalCount?: number;
}

export function UploadProgress({ progress, status, error, uploadedCount, totalCount }: UploadProgressProps) {
  if (status === 'idle') return null;

  const hasMulti = totalCount !== undefined && totalCount > 1;

  return (
    <View style={styles.container}>
      {status === 'uploading' && (
        <>
          <ActivityIndicator size="small" color="#1976D2" />
          <Text style={styles.text}>
            {hasMulti
              ? `Upload ${uploadedCount || 0}/${totalCount}...`
              : `Upload en cours...${progress !== undefined ? ` ${progress}%` : ''}`}
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
        <Text style={[styles.text, styles.success]}>
          {hasMulti ? `${uploadedCount} fichiers uploadés !` : 'Upload terminé !'}
        </Text>
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
