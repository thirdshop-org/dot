import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useBatchStore } from '../hooks/useBatchStore';
import { usePdfGeneration } from '../hooks/usePdfGeneration';
import { useUpload } from '../hooks/useUpload';
import { CapturedPhoto } from '../types';

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
  const [batchTags, setBatchTags] = useState<string[]>(batch?.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setPhotos((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    if (index >= photos.length - 1) return;
    setPhotos((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, [photos.length]);

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
    if (photos.length === 0) return;

    const pdfUri = await generatePdf(photos.map((p) => ({ uri: p.uri })));
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
              await upload.mutateAsync([
                {
                  uri: 'file://' + pdfUri,
                  type: 'application/pdf',
                  name: `${batch?.name ?? 'document'}.pdf`,
                },
              ]);
              Alert.alert('Succès', 'PDF uploadé avec succès', [
                { text: 'OK', onPress: () => navigation.navigate('Home' as never) },
              ]);
            } catch {
              Alert.alert('Erreur', "Échec de l'upload du PDF");
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Réorganiser les photos</Text>
        <Text style={styles.subtitle}>{photos.length} photo{photos.length > 1 ? 's' : ''}</Text>
      </View>

      <FlatList
        data={photos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <View style={styles.photoRow}>
            <Image source={{ uri: item.uri }} style={styles.thumb} />
            <Text style={styles.photoIndex}>#{index + 1}</Text>
            <View style={styles.arrows}>
              <TouchableOpacity
                style={[styles.arrowBtn, index === 0 && styles.arrowDisabled]}
                onPress={() => moveUp(index)}
                disabled={index === 0}
              >
                <Text style={styles.arrowText}>▲</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.arrowBtn, index >= photos.length - 1 && styles.arrowDisabled]}
                onPress={() => moveDown(index)}
                disabled={index >= photos.length - 1}
              >
                <Text style={styles.arrowText}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
  list: {
    padding: 16,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 8,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
  photoIndex: {
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  arrows: {
    gap: 4,
  },
  arrowBtn: {
    width: 36,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowDisabled: {
    opacity: 0.3,
  },
  arrowText: {
    fontSize: 14,
    color: '#333',
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
});
