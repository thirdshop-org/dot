import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useDevice } from '../contexts/DeviceContext';

export function DeviceSetupScreen() {
  const navigation = useNavigation();
  const { register, deviceName } = useDevice();
  const [name, setName] = useState(deviceName || `${Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)} de ${Platform.OS === 'ios' ? 'l\'utilisateur' : 'utilisateur'}`);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!name.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await register(name.trim());
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Home' }] }));
    } catch (err: any) {
      setError(err?.message || "Échec de l'enregistrement");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>📱</Text>
        <Text style={styles.title}>Enregistrement du device</Text>
        <Text style={styles.subtitle}>
          Ce device doit être enregistré comme espace de stockage pour utiliser VaultDrop.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Nom du device"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, !name.trim() && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isLoading || !name.trim()}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Enregistrer</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  error: {
    color: '#E53935',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
