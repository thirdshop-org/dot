import React, { useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

interface SyncStatusIconProps {
  isSyncing: boolean;
  pendingCount: number;
  isUploading: boolean;
  uploadPendingCount: number;
  onPress: () => void;
}

export function SyncStatusIcon({ isSyncing, pendingCount, isUploading, uploadPendingCount, onPress }: SyncStatusIconProps) {
  const rotation = useSharedValue(0);
  const isActive = isSyncing || isUploading;
  const totalPending = pendingCount + uploadPendingCount;

  useEffect(() => {
    if (isActive) {
      rotation.value = withRepeat(
        withSequence(
          withTiming(360, { duration: 1000, easing: Easing.linear }),
          withTiming(0, { duration: 0 })
        ),
        -1
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = withTiming(0, { duration: 200 });
    }
  }, [isActive, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Animated.View style={animatedStyle}>
        <MaterialIcons
          name="sync"
          size={22}
          color={isActive ? '#1976D2' : totalPending > 0 ? '#F57C00' : '#666'}
        />
      </Animated.View>
      {totalPending > 0 && !isActive && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {totalPending > 99 ? '99+' : totalPending}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginRight: 4,
    padding: 8,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    backgroundColor: '#E53935',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
});
