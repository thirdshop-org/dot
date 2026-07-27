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
  onPress: () => void;
}

export function SyncStatusIcon({ isSyncing, pendingCount, onPress }: SyncStatusIconProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (isSyncing) {
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
  }, [isSyncing, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Animated.View style={animatedStyle}>
        <MaterialIcons
          name="sync"
          size={22}
          color={isSyncing ? '#1976D2' : pendingCount > 0 ? '#F57C00' : '#666'}
        />
      </Animated.View>
      {pendingCount > 0 && !isSyncing && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {pendingCount > 99 ? '99+' : pendingCount}
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
