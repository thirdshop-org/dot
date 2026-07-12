import React from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text, Dimensions, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFiles } from '../hooks/useFiles';
import { FileItem } from '../types';

const NUM_COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = (SCREEN_WIDTH - 16 * 2 - (NUM_COLUMNS - 1) * 6) / NUM_COLUMNS;

type RootStackParamList = {
  Home: undefined;
  Upload: undefined;
  Scan: undefined;
  Search: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type GroupedFiles = Record<string, FileItem[]>;

function groupByDate(files: FileItem[]): GroupedFiles {
  const groups: GroupedFiles = {};
  for (const file of files) {
    const d = new Date(file.createdAt);
    const key = d.toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!groups[key]) groups[key] = [];
    groups[key].push(file);
  }
  return groups;
}

function formatDateLabel(key: string): string {
  const d = new Date();
  const today = d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  d.setDate(d.getDate() - 1);
  const yesterday = d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  if (key === today) return "Aujourd'hui";
  if (key === yesterday) return 'Hier';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { data, isLoading, error } = useFiles();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>Chargement...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>Erreur de chargement</Text>
      </View>
    );
  }

  const files = data?.data ?? [];
  const groups = groupByDate(files);
  const groupKeys = Object.keys(groups);

  return (
    <View style={styles.container}>
      <FlatList
        data={groupKeys}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        renderItem={({ item: dateKey }) => {
          const groupFiles = groups[dateKey];
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{formatDateLabel(dateKey)}</Text>
              <View style={styles.grid}>
                {groupFiles.map((file) => (
                  <View key={file.id} style={styles.gridItem}>
                    {file.url ? (
                      <Image source={{ uri: file.url }} style={styles.thumb} />
                    ) : (
                      <View style={styles.placeholder}>
                        <Text style={styles.placeholderText}>PDF</Text>
                      </View>
                    )}
                    <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        }}
      />

      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Upload')}
        >
          <Text style={styles.navText}>Upload</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Scan')}
        >
          <Text style={styles.navText}>Scan</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Search')}
        >
          <Text style={styles.navText}>Recherche</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 16,
    color: '#666',
  },
  list: {
    padding: 16,
    paddingBottom: 80,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#333',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridItem: {
    width: ITEM_SIZE,
  },
  thumb: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
  placeholder: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 6,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600',
  },
  fileName: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  navButton: {
    padding: 8,
  },
  navText: {
    fontSize: 16,
    color: '#1976D2',
  },
});
