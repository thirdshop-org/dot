import React, { useState } from 'react';
import { View, TextInput, FlatList, StyleSheet, Text } from 'react-native';
import { useSearch } from '../hooks/useSearch';
import { FileCard } from '../components/FileCard';
import { FileItem } from '../types';

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useSearch(query);

  const renderItem = ({ item }: { item: FileItem }) => (
    <FileCard
      file={item}
      onPress={(file) => console.log('File pressed:', file.id)}
    />
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Rechercher un fichier..."
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {isLoading && <Text style={styles.loading}>Recherche en cours...</Text>}

      <FlatList
        data={data?.data || []}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  loading: {
    textAlign: 'center',
    color: '#666',
    marginBottom: 8,
  },
  list: {
    padding: 16,
  },
});
