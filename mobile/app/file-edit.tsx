import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAddTags } from '../hooks/useFiles';
import { usePdfGeneration } from '../hooks/usePdfGeneration';
import { useUpload } from '../hooks/useUpload';
import { TagChip } from '../components/TagChip';
import { FileThumbnail } from '../components/FileThumbnail';
import { ZoomableImage } from '../components/ZoomableImage';
import { fileStore } from '../services/fileStore';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import type { SyncStatus, Variant } from '../types';

const NUM_COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const PADDING = 16;
const ITEM_GAP = 6;
const ITEM_SIZE = (SCREEN_WIDTH - PADDING * 2 - (NUM_COLUMNS - 1) * ITEM_GAP) / NUM_COLUMNS;

type FileEditRouteParams = {
  FileEdit: { fileIds: string[] };
};

type PreviewFile = { uri: string; width: number; height: number };

interface FileEditItemProps {
  fileId: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
  size: number;
}

const FileEditItem = React.memo(function FileEditItem({ fileId, selected, onSelect, onPreview, size }: FileEditItemProps) {
  const record = fileStore.getByBackendId(fileId) ?? fileStore.getById(fileId);

  const uri = record?.localUri ?? undefined;
  const thumbnailUrl = record?.thumbnailUrl ?? undefined;
  const mimeType = record?.mimeType ?? 'application/octet-stream';
  const fileName = record?.name ?? fileId;
  const syncStatus = (record?.syncStatus ?? 'cloud') as SyncStatus;
  const isViewable = mimeType.startsWith('image/') || mimeType === 'application/pdf';

  return (
    <View style={{ width: size, height: size, marginBottom: ITEM_GAP, borderRadius: 6, overflow: 'hidden' }}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={0.7}
        onPress={() => { if (isViewable) onPreview(fileId); else onSelect(fileId); }}
      >
        <FileThumbnail
          uri={uri}
          thumbnailUrl={thumbnailUrl}
          mimeType={mimeType}
          fileName={fileName}
          size={size}
          syncStatus={syncStatus}
        />
      </TouchableOpacity>

      {isViewable && (
        <TouchableOpacity
          style={styles.previewBtn}
          onPress={() => onPreview(fileId)}
          hitSlop={6}
        >
          <MaterialIcons name="visibility" size={16} color="#fff" />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.selectBtn}
        onPress={() => onSelect(fileId)}
        hitSlop={8}
      >
        <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
          {selected && <MaterialIcons name="check" size={14} color="#fff" />}
        </View>
      </TouchableOpacity>
    </View>
  );
});

export function FileEditScreen() {
  const route = useRoute<RouteProp<FileEditRouteParams, 'FileEdit'>>();
  const navigation = useNavigation();
  const { fileIds } = route.params;

  const addTags = useAddTags();
  const { generatePdf, generating, progress } = usePdfGeneration();
  const upload = useUpload();

  const [tagInput, setTagInput] = useState('');
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewFiles, setPreviewFiles] = useState<PreviewFile[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);

  const hasSelection = selectedIds.size > 0;
  const targetIds = hasSelection ? Array.from(selectedIds) : fileIds;

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === fileIds.length) return new Set();
      return new Set(fileIds);
    });
  }, [fileIds]);

  const openPreview = useCallback((files: PreviewFile[], index: number) => {
    setPreviewFiles(files);
    setPreviewIndex(index);
  }, []);

  const handlePreview = useCallback(async (fileId: string) => {
    const record = fileStore.getByBackendId(fileId) ?? fileStore.getById(fileId);

    if (record?.localUri) {
      openPreview([{ uri: record.localUri, width: SCREEN_WIDTH, height: SCREEN_WIDTH }], 0);
      return;
    }

    setPreviewLoading(true);
    try {
      const data = await apiClient.get<any>(`${ENDPOINTS.RESOURCES}/${fileId}`);
      const url = data?.url;
      if (url) {
        const fullVariants: Variant[] = (data?.variants ?? [])
          .filter((v: Variant) => v.variantType === 'thumbnail_full')
          .sort((a: Variant, b: Variant) => a.pageNumber - b.pageNumber);

        if (fullVariants.length > 0) {
          const pages: PreviewFile[] = fullVariants.map((v) => ({
            uri: v.url,
            width: v.width,
            height: v.height,
          }));
          openPreview(pages, 0);
        } else {
          openPreview([{ uri: url, width: SCREEN_WIDTH, height: SCREEN_WIDTH }], 0);
        }
      } else {
        Alert.alert('Erreur', 'Impossible de charger l\'aperçu');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de charger l\'aperçu');
    } finally {
      setPreviewLoading(false);
    }
  }, [openPreview]);

  const handleSwipeVertical = useCallback((direction: 'up' | 'down') => {
    setPreviewIndex((prev) => {
      if (!previewFiles || previewFiles.length <= 1) return prev;
      const next = direction === 'up'
        ? Math.min(prev + 1, previewFiles.length - 1)
        : Math.max(prev - 1, 0);
      return next;
    });
  }, [previewFiles]);

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || pendingTags.includes(tag)) return;
    setPendingTags((prev) => [...prev, tag]);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setPendingTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleApplyTags = useCallback(async () => {
    if (pendingTags.length === 0) return;
    for (const fileId of targetIds) {
      await addTags.mutateAsync({ fileId, tags: pendingTags });
    }
    Alert.alert('Succès', `${pendingTags.length} tag${pendingTags.length > 1 ? 's' : ''} ajouté${pendingTags.length > 1 ? 's' : ''}`);
    setPendingTags([]);
  }, [pendingTags, targetIds, addTags]);

  const handleGeneratePdf = useCallback(async () => {
    if (targetIds.length === 0) return;

    setUploading(true);
    try {
      const results = await Promise.all(
        targetIds.map(async (fileId) => {
          const record = fileStore.getByBackendId(fileId) ?? fileStore.getById(fileId);
          if (record?.localUri) return { uri: record.localUri };
          const data = await apiClient.get<{ url: string }>(`${ENDPOINTS.RESOURCES}/${fileId}`);
          return { uri: data?.url || '' };
        })
      );
      const imageUris = results.filter((r) => r.uri);

      if (imageUris.length === 0) {
        Alert.alert('Erreur', 'Aucune image trouvée pour la génération du PDF');
        setUploading(false);
        return;
      }

      const pdfUri = await generatePdf(imageUris);
      if (!pdfUri) {
        Alert.alert('Erreur', 'Échec de la génération du PDF');
        setUploading(false);
        return;
      }

      Alert.alert(
        'PDF généré',
        'Voulez-vous uploader le fichier ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Uploader',
            onPress: async () => {
              try {
                const pdfName = `document_${Date.now()}.pdf`;
                const pdfUriClean = pdfUri.startsWith('file://') ? pdfUri : 'file://' + pdfUri;
                await upload.mutateAsync([
                  { uri: pdfUriClean, type: 'application/pdf', name: pdfName },
                ]);
                Alert.alert('Succès', 'PDF uploadé avec succès', [
                  { text: 'OK', onPress: () => navigation.goBack() },
                ]);
              } catch (e: any) {
                const msg = e?.message || e?.toString() || 'Erreur inconnue';
                Alert.alert('Erreur', `Échec de l'upload du PDF: ${msg}`);
              }
            },
          },
        ]
      );
    } finally {
      setUploading(false);
    }
  }, [targetIds, generatePdf, upload, navigation]);

  const isLoading = generating || uploading || previewLoading;

  const renderItem = useCallback(({ item }: { item: string }) => (
    <FileEditItem
      fileId={item}
      selected={hasSelection ? selectedIds.has(item) : true}
      onSelect={toggleSelection}
      onPreview={handlePreview}
      size={ITEM_SIZE}
    />
  ), [hasSelection, selectedIds, toggleSelection, handlePreview]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Édition</Text>
            <Text style={styles.subtitle}>
              {hasSelection
                ? `${selectedIds.size} sélectionné${selectedIds.size > 1 ? 's' : ''} / ${fileIds.length}`
                : `${fileIds.length} fichier${fileIds.length > 1 ? 's' : ''}`}
            </Text>
          </View>
          <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
            <Text style={styles.selectAllText}>
              {hasSelection && selectedIds.size === fileIds.length ? 'Tout' : 'Tout'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={fileIds}
        numColumns={NUM_COLUMNS}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={renderItem}
      />

      <View style={styles.tagSection}>
        <Text style={styles.sectionTitle}>Tags</Text>
        <View style={styles.tagRow}>
          {pendingTags.map((tag) => (
            <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => handleRemoveTag(tag)}>
              <TagChip name={tag} onRemove={() => handleRemoveTag(tag)} />
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
            <MaterialIcons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        {pendingTags.length > 0 && (
          <TouchableOpacity style={styles.applyTagsBtn} onPress={handleApplyTags} disabled={addTags.isPending}>
            {addTags.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.applyTagsText}>Appliquer les tags</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.footer}>
        {(generating || uploading) && (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color="#1976D2" />
            <Text style={styles.progressText}>
              {generating ? `Génération du PDF... ${progress}%` : 'Upload en cours...'}
            </Text>
          </View>
        )}
        {previewLoading && (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color="#1976D2" />
            <Text style={styles.progressText}>Chargement de l'aperçu...</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.pdfBtn, isLoading && styles.pdfBtnDisabled]}
          onPress={handleGeneratePdf}
          disabled={isLoading}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name="picture-as-pdf" size={20} color="#fff" />
          )}
          <Text style={styles.pdfBtnText}>Créer un PDF</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={previewFiles !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreviewFiles(null)}
      >
        {previewFiles && (
          <GestureHandlerRootView style={{ flex: 1 }}>
            <ZoomableImage
              key={previewFiles[previewIndex].uri}
              uri={previewFiles[previewIndex].uri}
              width={previewFiles[previewIndex].width}
              height={previewFiles[previewIndex].height}
              onClose={() => setPreviewFiles(null)}
              onSwipeVertical={handleSwipeVertical}
            />
            {previewFiles.length > 1 && (
              <View style={styles.modalPagination}>
                <Text style={styles.modalPaginationText}>
                  {previewIndex + 1} / {previewFiles.length}
                </Text>
              </View>
            )}
          </GestureHandlerRootView>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: PADDING,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  selectAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
  },
  grid: {
    padding: PADDING,
  },
  gridRow: {
    gap: ITEM_GAP,
  },
  tagSection: {
    padding: PADDING,
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
    marginRight: 2,
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
  applyTagsBtn: {
    marginTop: 10,
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyTagsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    padding: PADDING,
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
  pdfBtn: {
    flexDirection: 'row',
    backgroundColor: '#1976D2',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pdfBtnDisabled: {
    opacity: 0.6,
  },
  pdfBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  previewBtn: {
    position: 'absolute',
    top: 4,
    right: 28,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectBtn: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    padding: 4,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircleSelected: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  modalPagination: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  modalPaginationText: {
    color: '#fff',
    fontSize: 13,
  },
});
