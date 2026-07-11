import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'react-native-image-picker';

export function ScanScreen() {
  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCamera({
        mediaType: 'photo',
        quality: 1,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Erreur', result.errorMessage || "Impossible d'accéder à la caméra");
        return;
      }

      if (result.assets && result.assets[0]) {
        console.log('Photo taken:', result.assets[0]);
        // TODO: Send to backend for OCR
      }
    } catch (err) {
      Alert.alert('Erreur', "Impossible d'accéder à la caméra");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scanner un document</Text>
      <Text style={styles.description}>
        Prenez une photo de votre document pour extraire le texte via OCR
      </Text>

      <TouchableOpacity style={styles.scanButton} onPress={takePhoto}>
        <Text style={styles.scanText}>Prendre une photo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  scanButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  scanText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
