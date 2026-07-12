import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFile, useFileImage, useAddTags } from '../hooks/useFiles';
import { usePdfGeneration } from '../hooks/usePdfGeneration';
import { useUpload } from '../hooks/useUpload';
import { TagChip } from '../components/TagChip';
import { FileThumbnail } from '../components/FileThumbnail';
import { FileItem } from '../types';

const NUM_COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = (SCREEN_WIDTH - 16 * 2 - (NUM_COLUMNS - 1) * 6) / NUM_COLUMNS;

type FileEditRouteParams = {
  FileEdit: { fileIds: string[] };
};

interface FileEditItemProps {
  fileId: string;
}

function FileEditItem({ fileId }: FileEditItemProps) {
  const { data: fileData, isLoading: fileLoading } = useFile(fileId);
  const { data: imageData, isLoading: imageLoading } = useFileImage(fileId);
  const file = fileData as any;
  const uri = imageData?.data?.url;
  const isLoading = fileLoading || imageLoading;

  if (isLoading) {
    return (
      <View style={[styles.gridItem, styles.gridItemLoading]}>
        <ActivityIndicator size="small" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.gridItem}>
      {uri && file?.mimeType?.startsWith('image/') ? (
        <Image source={{ uri }} style={styles.thumb} />
      ) : (
        <FileThumbnail
          mimeType={file?.mimeType ?? 'application/octet-stream'}
          fileName={file?.name ?? fileId}
          size={ITEM_SIZE}
        />
      )}
    </View>
  );
}

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
    for (const fileId of fileIds) {
      await addTags.mutateAsync({ fileId, tags: pendingTags });
    }
    Alert.alert('Succès', `${pendingTags.length} tag${pendingTags.length > 1 ? 's' : ''} ajouté${pendingTags.length > 1 ? 's' : ''}`);
    setPendingTags([]);
  }, [pendingTags, fileIds, addTags]);

  const handleGeneratePdf = useCallback(async () => {
    if (fileIds.length === 0) return;

    setUploading(true);
    try {
      const imageUris: { uri: string }[] = [];

      for (const fileId of fileIds) {
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.1.17:8080/api/v1'}/files/${fileId}`);
        const data = await response.json();
        const url = data?.data?.url;
        if (url) {
          imageUris.push({ uri: url });
        }
      }

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
  }, [fileIds, generatePdf, upload, navigation]);

  const isLoading = generating || uploading;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Édition</Text>
        <Text style={styles.subtitle}>
          {fileIds.length} fichier{fileIds.length > 1 ? 's' : ''} sélectionné{fileIds.length > 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={fileIds}
        numColumns={NUM_COLUMNS}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => <FileEditItem fileId={item} />}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  gridItemLoading: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumb: {
    width: '100%',
    height: '100%',
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
});
