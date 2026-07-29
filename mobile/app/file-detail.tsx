import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  ActivityIndicator,
  Modal,
  Pressable,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFile, useDownloadFile } from '../hooks/useFiles';
import { fileStore } from '../services/fileStore';
import { TagChip } from '../components/TagChip';
import { FileThumbnail } from '../components/FileThumbnail';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { ZoomableImage } from '../components/ZoomableImage';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { downloadRegistry } from '../services/downloadRegistry';
import { deleteAsync } from 'expo-file-system/legacy';
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

const PANEL_HEIGHT = 410;
const PANEL_HEADER_VISIBLE = 100;

function DetailItem({ fileId, deviceFile, onSelectImage }: { fileId: string; deviceFile?: DeviceFileParam; onSelectImage?: (state: ModalState) => void }) {
  const isDevice = !!deviceFile;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const localEntry = fileStore.getById(fileId);
  const apiId = isDevice ? '' : (localEntry?.backendId ?? fileId);
  const { data: fileData } = useFile(apiId);
  const downloadFile = useDownloadFile();
  const [downloading, setDownloading] = useState(false);

  const file = fileData as any;
  const uri = isDevice ? deviceFile.localUri : (localEntry?.localUri ?? file?.url);

  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const handleImageLoad = useCallback((event: { source: { width: number; height: number } }) => {
    setImageSize({ width: event.source.width, height: event.source.height });
  }, []);

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
  const fileName = deviceFile?.name ?? file?.name ?? fileId;

  const createdAt = deviceFile?.createdAt ?? file?.createdAt;
  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const fileSize = file?.size ?? 0;
  const formattedSize = fileSize > 0
    ? fileSize > 1024 * 1024
      ? `${(fileSize / (1024 * 1024)).toFixed(1)} Mo`
      : `${(fileSize / 1024).toFixed(1)} Ko`
    : '';

  const [optionsVisible, setOptionsVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const panelOffset = useSharedValue(PANEL_HEIGHT - PANEL_HEADER_VISIBLE);
  const panelStartY = useSharedValue(0);
  const isPanelExpanded = useSharedValue(false);
  const [panelExpanded, setPanelExpanded] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!file) return;
    const bid = localEntry?.backendId ?? fileId;
    setDownloading(true);
    try {
      await downloadFile.mutateAsync({
        id: bid,
        backendResourceId: bid,
        name: fileName,
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
  }, [file, fileName, fileId, localEntry, downloadFile]);

  const handleShare = useCallback(async () => {
    setOptionsVisible(false);
    if (uri) {
      await Share.share({ url: uri, title: fileName });
    } else if (file?.url) {
      await Share.share({ url: file.url, title: fileName });
    }
  }, [uri, fileName, file?.url]);

  const handleDelete = useCallback(() => {
    setOptionsVisible(false);
    Alert.alert(
      'Supprimer',
      `Supprimer "${fileName}" définitivement ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const bid = localEntry?.backendId ?? (file as any)?.backendResourceId;
              if (bid) {
                await apiClient.delete(`${ENDPOINTS.RESOURCES}/${bid}`);
                fileStore.deleteByBackendId(bid);
              } else {
                fileStore.deleteById(fileId);
              }
              if (localEntry?.localUri) {
                await deleteAsync(localEntry.localUri, { idempotent: true });
              }
              downloadRegistry.remove(fileId);
              navigation.goBack();
            } catch {} finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [fileName, fileId, localEntry, file, navigation]);

  const togglePanelJS = useCallback(() => {
    if (isPanelExpanded.value) {
      panelOffset.value = withSpring(PANEL_HEIGHT - PANEL_HEADER_VISIBLE);
      isPanelExpanded.value = false;
      setPanelExpanded(false);
    } else {
      panelOffset.value = withSpring(0);
      isPanelExpanded.value = true;
      setPanelExpanded(true);
    }
  }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      panelStartY.value = panelOffset.value;
    })
    .onUpdate((event) => {
      const offset = Math.max(0, Math.min(PANEL_HEIGHT - PANEL_HEADER_VISIBLE, panelStartY.value + event.translationY));
      panelOffset.value = offset;
    })
    .onEnd(() => {
      if (panelOffset.value > (PANEL_HEIGHT - PANEL_HEADER_VISIBLE) / 2) {
        panelOffset.value = withSpring(PANEL_HEIGHT - PANEL_HEADER_VISIBLE);
        isPanelExpanded.value = false;
        runOnJS(setPanelExpanded)(false);
      } else {
        panelOffset.value = withSpring(0);
        isPanelExpanded.value = true;
        runOnJS(setPanelExpanded)(true);
      }
    });

  const panelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelOffset.value }],
  }));

  const renderImageContent = () => {
    if (hasPages) {
      return fullThumbnails.map((thumb, thumbIndex) => {
        const allImages: SelectedImage[] = fullThumbnails.map((t) => ({
          uri: t.url,
          width: SCREEN_WIDTH,
          height: t.height * (SCREEN_WIDTH / t.width),
        }));
        return (
          <Pressable
            key={thumb.id}
            onPress={() => onSelectImage?.({ images: allImages, index: thumbIndex })}
          >
            <Image
              source={{ uri: thumb.url }}
              style={[styles.image, { height: thumb.height * (SCREEN_WIDTH / thumb.width) }]}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={200}
            />
          </Pressable>
        );
      });
    }
    if (uri) {
      return (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            imageSize
              ? { height: imageSize.height * SCREEN_WIDTH / imageSize.width }
              : { aspectRatio: 1 },
          ]}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={200}
          onLoad={handleImageLoad}
        />
      );
    }
    if (file) {
      return (
        <View style={styles.cloudOnlyContainer}>
          <FileThumbnail
            thumbnailUrl={file?.thumbnailUrl}
            mimeType={file?.mimeType ?? 'application/pdf'}
            fileName={file?.name ?? fileId}
            size={SCREEN_WIDTH * 0.5}
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
      );
    }
    return <ActivityIndicator size="large" color="#1976D2" />;
  };

  if (deleting) {
    return (
      <View style={[styles.detailContainer, styles.center]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.detailContainer}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (!hasPages && uri) {
            const height = imageSize
              ? imageSize.height * SCREEN_WIDTH / imageSize.width
              : SCREEN_WIDTH;
            onSelectImage?.({
              images: [{ uri, width: SCREEN_WIDTH, height }],
              index: 0,
            });
          }
        }}
      >
        <View style={styles.imageCentered}>
          {renderImageContent()}
        </View>
      </Pressable>

      <View style={[styles.headerOverlay, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerDate} numberOfLines={1}>{formattedDate}</Text>

        <TouchableOpacity onPress={() => setOptionsVisible(true)} style={styles.headerBtn}>
          <MaterialIcons name="more-vert" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.panel, { paddingBottom: insets.bottom + 12 }, panelAnimatedStyle]}>
          <TouchableOpacity onPress={togglePanelJS} activeOpacity={0.7}>
            <View style={styles.panelHandle} />
            <View style={styles.panelHeader}>
              <Text style={styles.panelFileName} numberOfLines={1}>{fileName}</Text>
              <SyncStatusBadge status={syncStatus} size={20} />
            </View>
          </TouchableOpacity>

          <View style={styles.panelBody}>
            {formattedDate ? (
              <View style={styles.metaRow}>
                <MaterialIcons name="calendar-today" size={16} color="#888" />
                <Text style={styles.metaText}>{formattedDate}</Text>
              </View>
            ) : null}

            {formattedSize ? (
              <View style={styles.metaRow}>
                <MaterialIcons name="storage" size={16} color="#888" />
                <Text style={styles.metaText}>{formattedSize}</Text>
              </View>
            ) : null}

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
                <Text style={styles.ocrText} numberOfLines={4}>{file.ocrText}</Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
                <MaterialIcons name="share" size={20} color="#1976D2" />
                <Text style={styles.actionBtnText}>Partager</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={handleDelete}>
                <MaterialIcons name="delete-outline" size={20} color="#E53935" />
                <Text style={[styles.actionBtnText, { color: '#E53935' }]}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>

      <Modal visible={optionsVisible} transparent animationType="fade" onRequestClose={() => setOptionsVisible(false)}>
        <TouchableOpacity style={styles.optionsOverlay} activeOpacity={1} onPress={() => setOptionsVisible(false)}>
          <View style={styles.optionsMenu}>
            <TouchableOpacity style={styles.optionItem} onPress={handleShare}>
              <MaterialIcons name="share" size={22} color="#333" />
              <Text style={styles.optionText}>Partager</Text>
            </TouchableOpacity>
            <View style={styles.optionDivider} />
            <TouchableOpacity style={styles.optionItem} onPress={handleDelete}>
              <MaterialIcons name="delete-outline" size={22} color="#E53935" />
              <Text style={[styles.optionText, { color: '#E53935' }]}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
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
        windowSize={5}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
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
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageWrapper: {
    width: SCREEN_WIDTH,
  },
  detailContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    height: PANEL_HEIGHT,
  },
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  panelFileName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  panelBody: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  metaText: {
    fontSize: 14,
    color: '#666',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagsSection: {
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  ocrSection: {
    marginTop: 12,
  },
  ocrText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1976D2',
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
  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  optionsMenu: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  optionDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginHorizontal: 20,
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
