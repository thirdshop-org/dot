import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator, Modal, Dimensions } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useBatchStore } from '../hooks/useBatchStore';
import { usePdfGeneration } from '../hooks/usePdfGeneration';
import { useUpload } from '../hooks/useUpload';
import { CapturedPhoto } from '../types';

const NUM_COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = (SCREEN_WIDTH - 16 * 2 - (NUM_COLUMNS - 1) * 6) / NUM_COLUMNS;

type PendingReviewRouteParams = {
  PendingReview: { batchId: string; photoIds: string[] };
};

export function PendingReviewScreen() {
  const route = useRoute<RouteProp<PendingReviewRouteParams, 'PendingReview'>>();
  const navigation = useNavigation();
  const { getBatch, addTagToBatch, removeTagFromBatch } = useBatchStore();
  const { generatePdf, generating, progress } = usePdfGeneration();
  const upload = useUpload();

  const batch = getBatch(route.params.batchId);

  const initialPhotos = (batch?.photos ?? []).filter((p) =>
    route.params.photoIds.includes(p.id)
  );

  const [photos, setPhotos] = useState<CapturedPhoto[]>(initialPhotos);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set(initialPhotos.map((p) => p.id)));
  const [batchTags, setBatchTags] = useState<string[]>(batch?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const orderedPhotos = photos.filter((p) => selectedSet.has(p.id));

  const togglePhoto = (id: string) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || batchTags.includes(tag)) return;
    setBatchTags((prev) => [...prev, tag]);
    addTagToBatch(route.params.batchId, tag);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setBatchTags((prev) => prev.filter((t) => t !== tag));
    removeTagFromBatch(route.params.batchId, tag);
  };

  const handleFinalize = async () => {
    if (orderedPhotos.length === 0) {
      Alert.alert('Aucune photo', 'Sélectionnez au moins une photo');
      return;
    }

    const pdfUri = await generatePdf(orderedPhotos.map((p) => ({ uri: p.uri })));
    if (!pdfUri) {
      Alert.alert('Erreur', 'Échec de la génération du PDF');
      return;
    }

    Alert.alert(
      'PDF généré',
      'Voulez-vous uploader le fichier ?',
      [
        { text: 'Annuler', style: 'cancel', onPress: () => navigation.goBack() },
        {
          text: 'Uploader',
            onPress: async () => {
            try {
              const pdfName = `${batch?.name ?? 'document'}.pdf`;
              const pdfUriClean = pdfUri.startsWith('file://') ? pdfUri : 'file://' + pdfUri;
              await upload.mutateAsync([
                { uri: pdfUriClean, type: 'application/pdf', name: pdfName },
              ]);
              Alert.alert('Succès', 'PDF uploadé avec succès', [
                { text: 'OK', onPress: () => navigation.navigate('Home' as never) },
              ]);
            } catch (e: any) {
              const msg = e?.message || e?.toString() || "Erreur inconnue";
              Alert.alert('Erreur', `Échec de l'upload du PDF: ${msg}`);
            }
          },
        },
      ]
    );
  };

  if (!batch) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Lot introuvable</Text>
      </View>
    );
  }

  const renderPhoto = ({ item, index }: { item: CapturedPhoto; index: number }) => {
    const isSelected = selectedSet.has(item.id);
    const pageNumber = isSelected
      ? orderedPhotos.findIndex((p) => p.id === item.id) + 1
      : null;

    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => togglePhoto(item.id)}
        onLongPress={() => setPreviewUri(item.uri)}
      >
        <Image source={{ uri: item.uri }} style={styles.thumb} />
        {isSelected && (
          <View style={styles.selectedOverlay}>
            <Text style={styles.pageNumber}>{pageNumber}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Réorganiser les photos</Text>
        <Text style={styles.subtitle}>
          {orderedPhotos.length}/{photos.length} sélectionnée{orderedPhotos.length > 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={photos}
        numColumns={NUM_COLUMNS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={renderPhoto}
      />

      <View style={styles.tagSection}>
        <Text style={styles.sectionTitle}>Tags</Text>
        <View style={styles.tagRow}>
          {batchTags.map((tag) => (
            <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => handleRemoveTag(tag)}>
              <Text style={styles.tagText}>{tag} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tagInputRow}>
          <TextInput
            style={styles.tagInput}
            placeholder="Ajouter un tag..."
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={handleAddTag}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.tagAddBtn} onPress={handleAddTag}>
            <Text style={styles.tagAddText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        {generating && (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color="#1976D2" />
            <Text style={styles.progressText}>Génération du PDF... {progress}%</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.finalizeBtn, generating && styles.finalizeBtnDisabled]}
          onPress={handleFinalize}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.finalizeText}>📄 Finaliser et uploader le PDF</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={previewUri !== null} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPreviewUri(null)}>
          {previewUri && (
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
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
    padding: 16,
  },
  gridRow: {
    gap: 6,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    marginBottom: 6,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(25,118,210,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageNumber: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  tagSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
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
  tagInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  tagAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagAddText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
  },
  finalizeBtn: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  finalizeBtnDisabled: {
    opacity: 0.6,
  },
  finalizeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: SCREEN_WIDTH * 0.95,
    height: '80%',
  },
});
