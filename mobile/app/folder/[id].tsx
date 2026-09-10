import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { getFolder, getFolderFolders, getFiles } from '../../services/localStorage';
import type { StoredFile, StoredFolder } from '../../services/db/types';
import i18n from '../../i18n';

type Row = {
  key: string;
  kind: 'folder' | 'file';
  label: string;
  meta: string;
  resourceId: string;
};

function formatSize(bytes: number): string {
  if ( bytes < 1024 ) return `${bytes} ${i18n.t('bytes')}`;
  if ( bytes < 1024 * 1024 ) return `${(bytes / 1024).toFixed(1)} ${i18n.t('kilobytes')}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${i18n.t('megabytes')}`;
}

export default function FolderScreen() {

  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [folder, setFolder] = useState<StoredFolder | null>(null);
  const [subfolders, setSubfolders] = useState<StoredFolder[]>([]);
  const [files, setFiles] = useState<StoredFile[]>([]);

  const load = useCallback(async () => {
    const current = await getFolder(id);
    if ( !current ) {
      router.back();
      return;
    }
    setFolder(current);
    setSubfolders(await getFolderFolders(id));
    setFiles(await getFiles(id));
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const rows: Row[] = [
    ...subfolders.map((f) => ({
      key: f.resource_id,
      kind: 'folder' as const,
      label: f.name,
      meta: i18n.t('folder'),
      resourceId: f.resource_id,
    })),
    ...files.map((f) => ({
      key: f.resource_id,
      kind: 'file' as const,
      label: f.name,
      meta: formatSize(f.size),
      resourceId: f.resource_id,
    })),
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: folder?.name ?? i18n.t('folder') }} />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => item.kind === 'folder' && router.push(`/folder/${item.resourceId}`)}
          >
            <Text style={item.kind === 'folder' ? styles.folderTitle : styles.fileTitle}>
              {item.kind === 'folder' ? `${item.label}/` : item.label}
            </Text>
            <Text style={styles.rowMeta}>{item.meta}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {i18n.t('empty_folder')}
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
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  folderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a73e8',
  },
  fileTitle: {
    fontSize: 16,
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