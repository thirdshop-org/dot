import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { syncRoot } from '../features/syncDevice';
import { pickDirectory } from '../services/safDirectory';
import { getFolders, saveDirectory } from '../services/localStorage';
import type { StoredFolder } from '../services/db/types';
import i18n from '../i18n';

export default function Index() {

  const router = useRouter();
  const [roots, setRoots] = useState<StoredFolder[]>([]);

  const load = useCallback(async () => {
    const saved = await getFolders();
    setRoots(saved.filter((folder) => folder.parent_resource_id === null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handlePickDirectory = async () => {
    const folder = await pickDirectory();
    if ( !folder ) return;
    const saved = await saveDirectory(folder);
    try {
      const result = await syncRoot(saved.resource_id);
      console.info('walk', JSON.stringify(result));
    } catch (error) {
      console.warn('walk failed', error);
    }
    await load();
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Pressable style={styles.button} onPress={handlePickDirectory}>
        <Text style={styles.buttonText}>{i18n.t('add_folder')}</Text>
      </Pressable>
      <FlatList
        data={roots}
        keyExtractor={(item) => item.resource_id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/folder/${item.resource_id}`)}
          >
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={styles.rowMeta}>{item.syncStatus}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {i18n.t('no_folders_yet')}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  button: {
    backgroundColor: '#1a73e8',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowMeta: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  empty: {
    color: '#888',
    textAlign: 'center',
    marginTop: 24,
  },
});