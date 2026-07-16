import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useFile, useFileImage } from '../hooks/useFiles';
import { TagChip } from '../components/TagChip';
import { FileThumbnail } from '../components/FileThumbnail';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ZoomableImage } from '../components/ZoomableImage';
import type { Thumbnail } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;

type SelectedImage = { uri: string; width: number; height: number };

type ModalState = { images: SelectedImage[]; index: number } | null;

type RootStackParamList = {
  FileDetail: { fileIds: string[]; initialIndex: number };
};

type FileDetailRouteProp = RouteProp<RootStackParamList, 'FileDetail'>;

function DetailItem({ fileId, onSelectImage }: { fileId: string; onSelectImage?: (state: ModalState) => void }) {
  const { data: imageData, isLoading: imageLoading } = useFileImage(fileId);
  const { data: fileData } = useFile(fileId);
  const uri = imageData?.data?.url;
  const file = fileData as any;

  const fullThumbnails: Thumbnail[] = (file?.data?.thumbnails ?? [])
    .filter((t: Thumbnail) => t.resolutionLabel === 'full')
    .sort((a: Thumbnail, b: Thumbnail) => a.pageNumber - b.pageNumber);

  const hasPages = fullThumbnails.length > 0;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      {hasPages ? (
        fullThumbnails.map((thumb, thumbIndex) => {
          const allImages: SelectedImage[] = fullThumbnails.map((t) => ({
            uri: t.url,
            width: SCREEN_WIDTH,
            height: t.height * (SCREEN_WIDTH / t.width),
          }));
          return (
            <Pressable
              key={thumb.id}
              style={styles.pageImageContainer}
              onPress={() => onSelectImage?.({ images: allImages, index: thumbIndex })}
            >
              <Image
                source={{ uri: thumb.url }}
                style={[styles.pageImage, { height: thumb.height * (SCREEN_WIDTH / thumb.width) }]}
                resizeMode="contain"
              />
            </Pressable>
          );
        })
      ) : (
        <View style={styles.imageContainer}>
          {uri ? (
            <Pressable
              onPress={() => onSelectImage?.({ images: [{ uri, width: SCREEN_WIDTH, height: SCREEN_WIDTH }], index: 0 })}
            >
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            </Pressable>
          ) : file ? (
            <FileThumbnail
              thumbnailUrl={file.data?.thumbnailUrl}
              mimeType={file.mimeType ?? 'application/pdf'}
              fileName={file.name ?? fileId}
              size={SCREEN_WIDTH * 0.6}
              isLoading={imageLoading}
            />
          ) : (
            <ActivityIndicator size="large" color="#1976D2" />
          )}
        </View>
      )}

      <View style={styles.details}>
        <Text style={styles.fileName}>{imageData?.data?.name ?? file?.name ?? fileId}</Text>

        {imageData?.data?.size != null && (
          <Text style={styles.meta}>
            Taille : {(imageData.data.size / 1024).toFixed(1)} Ko
          </Text>
        )}

        {file?.createdAt && (
          <Text style={styles.meta}>
            Ajouté le {new Date(file.createdAt).toLocaleDateString('fr-FR', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </Text>
        )}

        {file?.tags && file.tags.length > 0 && (
          <View style={styles.tagsSection}>
            <Text style={styles.sectionLabel}>Tags</Text>
            <View style={styles.tagsRow}>
              {file.tags.map((tag: any) => (
                <TagChip key={tag.id} name={tag.name} />
              ))}
            </View>
          </View>
        )}

        {file?.ocrText && (
          <View style={styles.ocrSection}>
            <Text style={styles.sectionLabel}>Texte OCR</Text>
            <Text style={styles.ocrText}>{file.ocrText}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

export function FileDetailScreen() {
  const route = useRoute<FileDetailRouteProp>();
  const { fileIds, initialIndex } = route.params;

  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [modalState, setModalState] = useState<ModalState>(null);

  const handleSwipeVertical = useCallback((direction: 'up' | 'down') => {
    setModalState((prev) => {
      if (!prev) return prev;
      const next = direction === 'up'
        ? Math.min(prev.index + 1, prev.images.length - 1)
        : Math.max(prev.index - 1, 0);
      if (next === prev.index) return prev;
      return { ...prev, index: next };
    });
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={fileIds}
        keyExtractor={(item) => item}
        horizontal
        snapToInterval={SCREEN_WIDTH}
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(index);
        }}
        renderItem={({ item }) => (
          <View style={styles.pageWrapper}>
            <DetailItem fileId={item} onSelectImage={setModalState} />
          </View>
        )}
      />

      <View style={styles.pagination}>
        <Text style={styles.paginationText}>
          {currentIndex + 1} / {fileIds.length}
        </Text>
      </View>

      <Modal
        visible={modalState !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setModalState(null)}
      >
        {modalState && (
          <GestureHandlerRootView style={{ flex: 1 }}>
            <ZoomableImage
              key={modalState.images[modalState.index].uri}
              uri={modalState.images[modalState.index].uri}
              width={modalState.images[modalState.index].width}
              height={modalState.images[modalState.index].height}
              onClose={() => setModalState(null)}
              onSwipeVertical={handleSwipeVertical}
            />
            {modalState.images.length > 1 && (
              <View style={styles.modalPagination}>
                <Text style={styles.modalPaginationText}>
                  {modalState.index + 1} / {modalState.images.length}
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
    backgroundColor: '#000',
  },
  pageWrapper: {
    width: SCREEN_WIDTH,
  },
  page: {
    flex: 1,
  },
  pageContent: {
    flexGrow: 1,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  pageImageContainer: {
    alignItems: 'center',
    backgroundColor: '#000',
    paddingVertical: 4,
  },
  pageImage: {
    width: SCREEN_WIDTH,
  },
  details: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: -16,
    padding: 20,
  },
  fileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  meta: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagsSection: {
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ocrSection: {
    marginTop: 16,
  },
  ocrText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginTop: 4,
  },
  pagination: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  paginationText: {
    color: '#fff',
    fontSize: 13,
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
