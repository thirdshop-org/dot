import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { pickDirectory } from '../services/safDirectory';
import { saveDirectory, getFolders } from '../services/localStorage';
import { syncRoot } from '../features/syncDevice';

export default function Index() {

  const [folders, setFolders] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const saved = await getFolders();
      setFolders(saved.map((folder) => folder.name));
    })();
  }, []);

  const handlePickDirectory = async () => {
    const folder = await pickDirectory();
    if ( !folder ) return;
    const saved = await saveDirectory(folder);
    setFolders((prev) => [...prev, folder.name]);
    try {
      const result = await syncRoot(saved.resource_id);
      console.info('walk', JSON.stringify(result));
    } catch (error) {
      console.warn('walk failed', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dot.</Text>
      <Pressable style={styles.button} onPress={handlePickDirectory}>
        <Text style={styles.buttonLabel}>Ajouter un dossier</Text>
      </Pressable>
      {folders.map((name) => (
        <Text key={name} style={styles.folder}>{name}</Text>
      ))}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
  },
  button: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#0057ff',
    borderRadius: 8,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  folder: {
    marginTop: 8,
    fontSize: 14,
    color: '#333',
  },
});