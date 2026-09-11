import { Stack, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { syncRoot } from '../features/syncDevice';
import { pickDirectory } from '../services/safDirectory';
import { getFiles, saveDirectory } from '../services/localStorage';
import type { StoredFile } from '../services/db/types';
import FloatingNavBar from '../components/FloatingNavBar';
import i18n from '../i18n';

type FilePair = {
  key: string;
  left: StoredFile;
  right: StoredFile | null;
};

type FileSection = {
  key: string;
  dayLabel: string;
  data: FilePair[];
};

function formatSize(bytes: number): string {
  if ( bytes < 1024 ) return `${bytes} ${i18n.t('bytes')}`;
  if ( bytes < 1024 * 1024 ) return `${(bytes / 1024).toFixed(1)} ${i18n.t('kilobytes')}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${i18n.t('megabytes')}`;
}

function formatDay(timestamp: number): string {
  return new Intl.DateTimeFormat(i18n.locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(timestamp);
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function chunkToPairs(files: StoredFile[]): FilePair[] {
  const pairs: FilePair[] = [];
  for ( let i = 0; i < files.length; i += 2 ) {
    pairs.push({
      key: files[i].resource_id + (files[i + 1]?.resource_id ?? ''),
      left: files[i],
      right: files[i + 1] ?? null,
    });
  }
  return pairs;
}

function groupFilesByDay(files: StoredFile[]): FileSection[] {
  const byDay = new Map<number, StoredFile[]>();
  for ( const file of files ) {
    const day = startOfDay(file.addedAt);
    const bucket = byDay.get(day);
    if ( bucket ) bucket.push(file);
    else byDay.set(day, [file]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, data]) => ({
      key: String(day),
      dayLabel: formatDay(day),
      data: chunkToPairs(data.sort((a, b) => b.addedAt - a.addedAt)),
    }));
}

function FileCard({ file }: { file: StoredFile }) {
  return (
    <View style={styles.card}>
      <Ionicons name="document-outline" size={28} color="#1a73e8" />
      <Text style={styles.cardTitle} numberOfLines={1}>{file.name}</Text>
      <Text style={styles.cardMeta}>{formatSize(file.size)}</Text>
    </View>
  );
}

export default function Index() {

  const [sections, setSections] = useState<FileSection[]>([]);

  const load = useCallback(async () => {
    const files = (await getFiles()).filter(f => f.exists);
    setSections(groupFilesByDay(files));
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
      <Stack.Screen options={{ title: i18n.t('files') }} />
      <StatusBar style="auto" />
      <Pressable style={styles.button} onPress={handlePickDirectory}>
        <Text style={styles.buttonText}>{i18n.t('add_folder')}</Text>
      </Pressable>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.dayLabel}</Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <FileCard file={item.left} />
            {item.right ? <FileCard file={item.right} /> : <View style={styles.cardSpacer} />}
          </View>
        )}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {i18n.t('no_files_yet')}
          </Text>
        }
      />
      <FloatingNavBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#1a73e8',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    margin: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  card: {
    flex: 1,
    backgroundColor: '#f7f8fa',
    borderRadius: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#eaeaea',
  },
  cardSpacer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  cardMeta: {
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