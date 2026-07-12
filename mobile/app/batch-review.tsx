import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Alert, ActivityIndicator, Share } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useBatchStore } from '../hooks/useBatchStore';
import { usePdfGeneration } from '../hooks/usePdfGeneration';

type BatchReviewRouteParams = {
  BatchReview: { batchId: string };
};

export function BatchReviewScreen() {
  const route = useRoute<RouteProp<BatchReviewRouteParams, 'BatchReview'>>();
  const navigation = useNavigation();
  const { getBatch, addTagToBatch, removeTagFromBatch } = useBatchStore();
  const { generatePdf, generating } = usePdfGeneration();

  const batch = getBatch(route.params.batchId);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState('');

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

  const selectedPhotos = batch.photos.filter((p) => selectedIds.has(p.id));
  const selectedCount = selectedIds.size;

  const handleGeneratePdf = async () => {
    const photos = selectedCount > 0 ? selectedPhotos : batch.photos;
    if (photos.length === 0) return;

    const uri = await generatePdf(photos);
    if (uri) {
      Alert.alert('PDF généré', 'Voulez-vous partager le fichier ?', [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Partager',
          onPress: () => {
            Share.share({ url: uri, title: batch.name });
          },
        },
      ]);
    } else {
      Alert.alert('Erreur', 'Impossible de générer le PDF');
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || batch.tags.includes(tag)) return;
    addTagToBatch(batch.id, tag);
    setTagInput('');
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
        <View style={styles.tagSection}>
          <View style={styles.tagRow}>
            {batch.tags.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={styles.tagChip}
                onPress={() => removeTagFromBatch(batch.id, tag)}
              >
                <Text style={styles.tagText}>{tag} ✕</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.disabledNote}>Tags disponibles avec le backend (bientôt)</Text>
        </View>

        <View style={styles.actions}>
          <Text style={styles.selectionInfo}>
            {selectedCount > 0 ? `${selectedCount} sélectionnée${selectedCount > 1 ? 's' : ''}` : 'Toutes les photos'}
          </Text>

          <TouchableOpacity
            style={[styles.actionButton, generating && styles.actionButtonDisabled]}
            onPress={handleGeneratePdf}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionText}>📄 Générer PDF</Text>
            )}
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
  tagSection: {
    gap: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 13,
    color: '#1976D2',
  },
  disabledNote: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  actions: {
    gap: 8,
    alignItems: 'center',
  },
  selectionInfo: {
    fontSize: 14,
    color: '#666',
  },
  actionButton: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
