import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';

const PANEL_HEIGHT = 300;
const PANEL_HEADER_VISIBLE = 80;

interface SelectionPanelProps {
  selectedCount: number;
  onClose: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onTags?: () => void;
  onFolder?: () => void;
  onMove?: () => void;
  insetsBottom: number;
}

export function SelectionPanel({
  selectedCount,
  onClose,
  onDelete,
  onEdit,
  onTags,
  onFolder,
  onMove,
  insetsBottom,
}: SelectionPanelProps) {
  const panelOffset = useSharedValue(PANEL_HEIGHT - PANEL_HEADER_VISIBLE);
  const panelStartY = useSharedValue(0);
  const isPanelExpanded = useSharedValue(false);
  const [panelExpanded, setPanelExpanded] = React.useState(false);

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

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.panel, { paddingBottom: insetsBottom + 12 }, panelAnimatedStyle]}>
        <TouchableOpacity onPress={togglePanelJS} activeOpacity={0.7}>
          <View style={styles.panelHandle} />
          <View style={styles.panelHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <MaterialIcons name="close" size={22} color="#333" />
            </TouchableOpacity>
            <Text style={styles.selectionCount}>
              {selectedCount} sélectionnée{selectedCount > 1 ? 's' : ''}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.selectAllBtn}>
              <Text style={styles.selectAllText}>Tout</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        <View style={styles.panelBody}>
          <View style={styles.actionsGrid}>
            {onDelete && (
              <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={onDelete}>
                <MaterialIcons name="delete" size={22} color="#E53935" />
                <Text style={[styles.actionLabel, { color: '#E53935' }]}>Supprimer</Text>
              </TouchableOpacity>
            )}
            {onEdit && (
              <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={onEdit}>
                <MaterialIcons name="edit" size={22} color="#1E88E5" />
                <Text style={[styles.actionLabel, { color: '#1E88E5' }]}>Éditer</Text>
              </TouchableOpacity>
            )}
            {onTags && (
              <TouchableOpacity style={[styles.actionBtn, styles.tagBtn]} onPress={onTags}>
                <MaterialIcons name="label" size={22} color="#8E24AA" />
                <Text style={[styles.actionLabel, { color: '#8E24AA' }]}>Tags</Text>
              </TouchableOpacity>
            )}
            {onFolder && (
              <TouchableOpacity style={[styles.actionBtn, styles.folderBtn]} onPress={onFolder}>
                <MaterialIcons name="create-new-folder" size={22} color="#F57C00" />
                <Text style={[styles.actionLabel, { color: '#F57C00' }]}>Dossier</Text>
              </TouchableOpacity>
            )}
            {onMove && (
              <TouchableOpacity style={[styles.actionBtn, styles.moveBtn]} onPress={onMove}>
                <MaterialIcons name="drive-file-move" size={22} color="#00897B" />
                <Text style={[styles.actionLabel, { color: '#00897B' }]}>Déplacer</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
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
    marginBottom: 16,
  },
  closeBtn: {
    padding: 4,
  },
  selectionCount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  selectAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectAllText: {
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '600',
  },
  panelBody: {
    flex: 1,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionBtn: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteBtn: {},
  editBtn: {},
  tagBtn: {},
  folderBtn: {},
  moveBtn: {},
});
