import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';
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
  onScaleChange?: (scale: number) => void;
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.5 };

export function ZoomableImage({ uri, width, height, onScaleChange }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const notifyScale = useCallback((s: number) => {
    onScaleChange?.(s);
  }, [onScaleChange]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), MAX_SCALE);
      runOnJS(notifyScale)(scale.value);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1, SPRING_CONFIG);
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(notifyScale)(1);
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .minDistance(10)
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      if (savedScale.value <= 1) {
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

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
        runOnJS(notifyScale)(1);
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 200 });
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(notifyScale)(DOUBLE_TAP_SCALE);
      }
    });

  const composed = Gesture.Exclusive(pinch, doubleTap, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.Image
        source={{ uri }}
        style={[styles.image, { width, height }, animatedStyle]}
        resizeMode="contain"
      />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  image: {
    overflow: 'hidden',
  },
});
