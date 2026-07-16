import React, { useCallback } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';

interface ZoomableImageProps {
  uri: string;
  width: number;
  height: number;
  onClose?: () => void;
  onSwipeVertical?: (direction: 'up' | 'down') => void;
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.5 };

export function ZoomableImage({ uri, width, height, onClose, onSwipeVertical }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleSwipeVertical = useCallback((direction: 'up' | 'down') => {
    onSwipeVertical?.(direction);
  }, [onSwipeVertical]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1, SPRING_CONFIG);
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .minDistance(5)
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd((e) => {
      if (savedScale.value <= 1) {
        const absY = Math.abs(e.translationY);
        const absX = Math.abs(e.translationX);
        if (absY > 30 && absY > absX) {
          runOnJS(handleSwipeVertical)(e.translationY > 0 ? 'down' : 'up');
        }
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const zoomGestures = Gesture.Simultaneous(pinch, pan);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1, { duration: 200 });
        translateX.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 200 });
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      if (scale.value <= 1) {
        runOnJS(handleClose)();
      }
    });

  const taps = Gesture.Exclusive(doubleTap, singleTap);

  const composed = Gesture.Race(zoomGestures, taps);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <View style={styles.container}>
      <GestureDetector gesture={composed}>
        <Animated.Image
          source={{ uri }}
          style={[styles.image, { width, height }, animatedStyle]}
          resizeMode="contain"
        />
      </GestureDetector>
      {onClose && (
        <Pressable style={styles.closeButton} onPress={onClose}>
          <View style={styles.closeIcon}>
            <View style={[styles.closeLine, styles.closeLine1]} />
            <View style={[styles.closeLine, styles.closeLine2]} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

const CLOSE_SIZE = 36;
const CLOSE_LINE = 20;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: CLOSE_SIZE,
    height: CLOSE_SIZE,
    borderRadius: CLOSE_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    width: CLOSE_LINE,
    height: CLOSE_LINE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeLine: {
    position: 'absolute',
    width: CLOSE_LINE,
    height: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  closeLine1: {
    transform: [{ rotate: '45deg' }],
  },
  closeLine2: {
    transform: [{ rotate: '-45deg' }],
  },
});
