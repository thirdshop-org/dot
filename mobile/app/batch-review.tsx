import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBatchStore } from '../hooks/useBatchStore';
import { usePdfGeneration } from '../hooks/usePdfGeneration';

type RootStackParamList = {
  Home: undefined;
  BatchReview: { batchId: string };
  PendingReview: { batchId: string; photoIds: string[] };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type BatchReviewRouteParams = { BatchReview: { batchId: string } };

export function BatchReviewScreen() {
  const route = useRoute<RouteProp<BatchReviewRouteParams, 'BatchReview'>>();
  const navigation = useNavigation<NavigationProp>();
  const { getBatch, removePhotoFromBatch } = useBatchStore();

  const batch = getBatch(route.params.batchId);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (!batch) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Lot introuvable</Text>
      </View>
    );
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = selectedIds.size;

  const handleDelete = () => {
    if (selectedCount === 0) return;
    const label = selectedCount === 1 ? 'cette photo' : `ces ${selectedCount} photos`;
    Alert.alert(
      'Supprimer',
      `Retirer ${label} du lot ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            selectedIds.forEach((id) => removePhotoFromBatch(batch.id, id));
            setSelectedIds(new Set());
          },
        },
      ]
    );
  };

  const handleGroup = () => {
    if (selectedCount === 0) return;
    const ids = Array.from(selectedIds);
    navigation.navigate('PendingReview', { batchId: batch.id, photoIds: ids });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{batch.name}</Text>
        <Text style={styles.subtitle}>
          {batch.photos.length} photo{batch.photos.length > 1 ? 's' : ''} • {formatDate(batch.createdAt)}
        </Text>
      </View>

      <FlatList
        data={batch.photos}
        numColumns={3}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => {
          const isSelected = selectedIds.has(item.id);
          return (
            <TouchableOpacity
              style={[styles.gridItem, isSelected && styles.gridItemSelected]}
              onPress={() => toggleSelection(item.id)}
            >
              <Image source={{ uri: item.uri }} style={styles.thumb} />
              {isSelected && (
                <View style={styles.selectedOverlay}>
                  <Text style={styles.selectedCheck}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.footer}>
        <Text style={styles.selectionInfo}>
          {selectedCount > 0 ? `${selectedCount} sélectionnée${selectedCount > 1 ? 's' : ''}` : 'Touchez une photo pour sélectionner'}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn, selectedCount === 0 && styles.actionBtnDisabled]}
            onPress={handleDelete}
            disabled={selectedCount === 0}
          >
            <Text style={styles.actionText}>🗑 Supprimer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.groupBtn, selectedCount === 0 && styles.actionBtnDisabled]}
            onPress={handleGroup}
            disabled={selectedCount === 0}
          >
            <Text style={styles.actionText}>📦 Regrouper</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  grid: {
    padding: 4,
  },
  gridItem: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: 4,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  gridItemSelected: {
    borderWidth: 3,
    borderColor: '#1976D2',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(25,118,210,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCheck: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  selectionInfo: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  deleteBtn: {
    backgroundColor: '#F44336',
  },
  groupBtn: {
    backgroundColor: '#4CAF50',
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
