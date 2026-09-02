import React, { useCallback, useRef } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Spring, isReducedMotion } from '@/src/theme/motion';
import { haptic, type HapticEvent } from '@/src/utils/haptics';

interface PressableScaleProps extends PressableProps {
  /** Spring scale while pressed (default 0.97). */
  scale?: number;
  opacityOnPress?: number;
  /**
   * Haptic vocabulary. `light` maps to a *tap* — silent unless the user has
   * haptics set to "rich", which is what stops the app buzzing on every click.
   * Use the semantic names (`press`, `send`, `select`, …) for real actions.
   */
  haptic?: 'none' | HapticEvent | 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning';
  /** Skip the scale animation (keep the haptic). */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

const HAPTIC_ALIAS: Record<string, HapticEvent> = {
  light: 'tap',
  medium: 'press',
  heavy: 'press',
  selection: 'select',
};

function resolveEvent(name: PressableScaleProps['haptic']): HapticEvent | null {
  if (!name || name === 'none') return null;
  return (HAPTIC_ALIAS[name] ?? name) as HapticEvent;
}

/**
 * The app-wide touchable: springy scale + opacity response and a consistent
 * haptic vocabulary.
 *
 * Performance notes (this is the hottest component in the app):
 *  - the animation lives entirely in a Reanimated worklet, so presses never
 *    round-trip to the JS thread;
 *  - reduced motion collapses the spring to a near-instant settle instead of
 *    disabling the interaction;
 *  - a per-gesture ref guard stops Android's duplicate `onPressIn` deliveries
 *    from double-firing the haptic.
 */
export const PressableScale = React.memo(function PressableScale({
  scale = 0.97,
  opacityOnPress = 0.86,
  haptic: hapticName = 'none',
  flat = false,
  style,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const fired = useRef(false);
  const reduced = useRef(isReducedMotion());

  const animated = useAnimatedStyle(() => {
    if (flat) return {};
    const to = pressed.get() ? (reduced.current ? 1 : scale) : 1;
    const op = pressed.get() ? (reduced.current ? 1 : opacityOnPress) : 1;
    return {
      transform: [{ scale: withSpring(to, Spring.responsive) }],
      opacity: withSpring(op, Spring.snappy),
    };
  });

  const handlePressIn = useCallback(
    (e: any) => {
      pressed.set(1);
      if (!fired.current) {
        fired.current = true;
        const ev = resolveEvent(hapticName);
        if (ev) haptic(ev);
      }
      onPressIn?.(e);
    },
    [hapticName, onPressIn, pressed]
  );

  const handlePressOut = useCallback(
    (e: any) => {
      pressed.set(0);
      fired.current = false;
      onPressOut?.(e);
    },
    [onPressOut, pressed]
  );

  const body = (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={style}
      {...rest}
    >
      {children}
    </Pressable>
  );

  if (flat) return body;
  return <Animated.View style={animated}>{body}</Animated.View>;
});
