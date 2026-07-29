import React, { useRef, useState, useCallback, useEffect } from 'react';
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
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useFile, useDownloadFile } from '../hooks/useFiles';
import { fileStore } from '../services/fileStore';
import { TagChip } from '../components/TagChip';
import { FileThumbnail } from '../components/FileThumbnail';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ZoomableImage } from '../components/ZoomableImage';
import type { Variant, SyncStatus } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;

type SelectedImage = { uri: string; width: number; height: number };

type ModalState = { images: SelectedImage[]; index: number } | null;

export type DeviceFileParam = {
  localUri: string;
  name: string;
  mimeType: string;
  createdAt: string;
};

type RootStackParamList = {
  FileDetail: { fileIds: string[]; initialIndex: number; deviceFiles?: Record<string, DeviceFileParam> };
};

type FileDetailRouteProp = RouteProp<RootStackParamList, 'FileDetail'>;

function DetailItem({ fileId, deviceFile, onSelectImage }: { fileId: string; deviceFile?: DeviceFileParam; onSelectImage?: (state: ModalState) => void }) {
  const isDevice = !!deviceFile;

  const localEntry = fileStore.getById(fileId);
  const apiId = isDevice ? '' : (localEntry?.backendId ?? fileId);
  const { data: fileData } = useFile(apiId);
  const downloadFile = useDownloadFile();
  const [downloading, setDownloading] = useState(false);

  const file = fileData as any;
  const uri = isDevice ? deviceFile.localUri : (localEntry?.localUri ?? file?.url);

  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!uri) { setImageSize(null); return; }
    Image.getSize(
      uri,
      (w, h) => setImageSize({ width: w, height: h }),
      () => setImageSize(null),
    );
  }, [uri]);

  const syncStatus: SyncStatus = isDevice
    ? 'local'
    : localEntry
      ? (localEntry.syncStatus as SyncStatus)
      : 'cloud';

  const fullVariants: Variant[] = (file?.variants ?? [])
    .filter((v: Variant) => v.variantType === 'thumbnail_full')
    .sort((a: Variant, b: Variant) => a.pageNumber - b.pageNumber);
  const fullThumbnails = fullVariants;

  const hasPages = fullThumbnails.length > 0;

  const handleDownload = useCallback(async () => {
    if (!file) return;
    const bid = localEntry?.backendId ?? fileId;
    setDownloading(true);
    try {
      await downloadFile.mutateAsync({
        id: bid,
        backendResourceId: bid,
        name: file?.name ?? localEntry?.name ?? fileId,
        mimeType: file?.mimeType ?? localEntry?.mimeType ?? 'application/octet-stream',
        size: file?.size ?? localEntry?.size ?? 0,
        createdAt: file?.createdAt ?? localEntry?.createdAt ?? new Date().toISOString(),
        source: 'cloud',
        syncStatus: 'cloud',
        tags: file?.tags ?? [],
        isFolder: false,
      });
    } catch {} finally {
      setDownloading(false);
    }
  }, [file, fileId, localEntry, downloadFile]);

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
              onPress={() => onSelectImage?.({
                images: [{ uri, width: SCREEN_WIDTH, height: imageSize ? imageSize.height * SCREEN_WIDTH / imageSize.width : SCREEN_WIDTH }],
                index: 0,
              })}
            >
              <Image
                source={{ uri }}
                style={[
                  styles.image,
                  imageSize && { height: imageSize.height * SCREEN_WIDTH / imageSize.width },
                ]}
                resizeMode="contain"
              />
            </Pressable>
          ) : file ? (
            <View style={styles.cloudOnlyContainer}>
              <FileThumbnail
                thumbnailUrl={file?.thumbnailUrl}
                mimeType={file?.mimeType ?? 'application/pdf'}
                fileName={file?.name ?? fileId}
                size={SCREEN_WIDTH * 0.6}
              />
              {syncStatus === 'cloud' && (
                <TouchableOpacity
                  style={styles.downloadBtn}
                  onPress={handleDownload}
                  disabled={downloading}
                >
                  {downloading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialIcons name="cloud-download" size={20} color="#fff" />
                  )}
                  <Text style={styles.downloadBtnText}>
                    {downloading ? 'Téléchargement...' : 'Télécharger'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <ActivityIndicator size="large" color="#1976D2" />
          )}
        </View>
      )}

      <View style={styles.details}>
        <View style={styles.detailHeader}>
          <Text style={styles.fileName}>{deviceFile?.name ?? file?.name ?? fileId}</Text>
          <SyncStatusBadge status={syncStatus} size={20} />
        </View>

        {(deviceFile || file?.size != null) && (
          <Text style={styles.meta}>
            Taille : {((deviceFile ? 0 : file?.size) ?? 0 / 1024).toFixed(1)} Ko
          </Text>
        )}

        {(deviceFile?.createdAt || file?.createdAt) && (
          <Text style={styles.meta}>
            Ajouté le {new Date(deviceFile?.createdAt ?? file?.createdAt).toLocaleDateString('fr-FR', {
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
  const { fileIds, initialIndex, deviceFiles } = route.params;

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
            <DetailItem fileId={item} deviceFile={deviceFiles?.[item]} onSelectImage={setModalState} />
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
    backgroundColor: '#000',
  },
  image: {
    width: SCREEN_WIDTH,
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
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  cloudOnlyContainer: {
    alignItems: 'center',
    gap: 16,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976D2',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  downloadBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
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
