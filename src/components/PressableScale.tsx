import React, { useCallback } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Spring } from '@/src/theme/motion';
import { haptics } from '@/src/utils/haptics';

interface PressableScaleProps extends PressableProps {
  /** Spring scale while pressed (default 0.97). */
  scale?: number;
  opacityOnPress?: number;
  haptic?: 'none' | 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * The app-wide touchable: springy scale + opacity response and a consistent
 * haptic vocabulary. This is what gives the UI its "premium sensi touch feel".
 *
 * Haptic policy: default is `none`. A vibration fires *only* where a caller
 * opts in explicitly — and exactly once per gesture (on press-in). Semantic
 * feedback (success / warning / error) belongs in the onPress handler of the
 * action itself, never in both places, so Android never delivers a double buzz.
 */
export function PressableScale({
  scale = 0.97,
  opacityOnPress = 0.85,
  haptic = 'none',
  style,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(pressed.get() ? scale : 1, Spring.snappy) }],
    opacity: withSpring(pressed.get() ? opacityOnPress : 1, Spring.snappy),
  }));

  const handlePressIn = useCallback(
    (e: any) => {
      pressed.set(1);
      if (haptic !== 'none') {
        const fn = (haptics as any)[haptic];
        if (typeof fn === 'function') fn();
      }
      onPressIn?.(e);
    },
    [haptic, onPressIn, pressed]
  );

  const handlePressOut = useCallback(
    (e: any) => {
      pressed.set(0);
      onPressOut?.(e);
    },
    [onPressOut, pressed]
  );

  const handlePress = useCallback(
    (e: any) => {
      onPress?.(e as never);
    },
    [onPress]
  );

  return (
    <Animated.View style={animated}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={style}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
