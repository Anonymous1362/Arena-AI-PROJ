import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { DimensionValue } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme';
import { Spring } from '@/src/theme/motion';
import { radius } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/src/utils/haptics';

/**
 * Lightweight bottom sheet built on Reanimated + Gesture Handler.
 *
 * The backdrop is an actual full-screen Pressable (not an absolutely-positioned
 * child inside a zero-sized animation wrapper), so an outside tap always
 * dismisses. A single travel value owns opening, dragging, and closing; window
 * resize caused by Android keyboard dismissal updates the distance without
 * restarting the opening animation.
 */

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Cap content height; defaults to 72% of screen. */
  maxHeight?: DimensionValue;
  /** Hide the grabber + title row. */
  plain?: boolean;
}

export function Sheet({ visible, onClose, title, children, maxHeight = '72%', plain = false }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const collapsed = Math.ceil(windowHeight + insets.bottom + 40);
  const collapsedDistance = useSharedValue(collapsed);
  const translateY = useSharedValue(collapsed);
  const dismissing = useSharedValue(false);
  const [mounted, setMounted] = useState(visible);
  const wasVisibleRef = useRef(visible);
  const dismissedBySheetRef = useRef(false);

  // Android's resize mode changes windowHeight as the keyboard closes. Keep
  // the off-screen distance current, but do not reset an already-open panel to
  // the bottom and spring it in again (the old source of the visible jump).
  useEffect(() => {
    collapsedDistance.set(collapsed);
    if (!mounted) translateY.set(collapsed);
  }, [collapsed, collapsedDistance, mounted, translateY]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (visible) {
      dismissedBySheetRef.current = false;
      setMounted(true);
      dismissing.set(false);
      translateY.set(collapsedDistance.get());
      translateY.set(withSpring(0, Spring.snappy));
      // A non-input panel must never leave the chat keyboard exposed beneath
      // it. The composer retains focus when no sheet is open.
      Keyboard.dismiss();
      return;
    }

    if (!wasVisible) return;
    if (dismissedBySheetRef.current) {
      // An outside tap, close button, or swipe already finished its exit
      // animation before invoking the controlled onClose callback.
      setMounted(false);
      return;
    }

    dismissing.set(true);
    translateY.set(withTiming(collapsedDistance.get(), { duration: 190 }, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    }));
  }, [collapsedDistance, dismissing, translateY, visible]);

  const requestClose = useCallback(() => {
    if (!visible || dismissing.get()) return;
    dismissedBySheetRef.current = true;
    dismissing.set(true);
    haptics.light();
    translateY.set(withTiming(collapsedDistance.get(), { duration: 190 }, (finished) => {
      if (finished) runOnJS(onClose)();
    }));
  }, [collapsedDistance, dismissing, onClose, translateY, visible]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(6)
        .failOffsetX([-36, 36])
        .onUpdate((event) => {
          if (dismissing.get()) return;
          const travel = collapsedDistance.get();
          translateY.set(Math.min(travel, Math.max(0, event.translationY)));
        })
        .onEnd((event) => {
          if (dismissing.get()) return;
          const travel = collapsedDistance.get();
          const shouldClose = event.translationY > Math.min(140, travel * 0.18) || event.velocityY > 1_100;
          if (shouldClose) {
            runOnJS(requestClose)();
          } else {
            translateY.set(withSpring(0, Spring.gentle));
          }
        }),
    [collapsedDistance, dismissing, requestClose, translateY]
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.get(), [0, collapsedDistance.get()], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View pointerEvents={mounted ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents={mounted ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.backdrop },
          backdropStyle,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
          onPress={requestClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View
        pointerEvents={mounted ? 'auto' : 'none'}
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: Math.max(14, insets.bottom + 8),
            maxHeight,
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={pan}>
          <View>
            {!plain && (
              <>
                <View style={styles.grabberWrap}>
                  <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
                </View>
                {title ? (
                  <View style={styles.titleRow}>
                    <View style={{ width: 32 }} />
                    <Animated.Text
                      numberOfLines={1}
                      style={[styles.title, { color: colors.text }]}
                    >
                      {title}
                    </Animated.Text>
                    <PressableScale haptic="none" onPress={requestClose} style={styles.closeBtn}>
                      <Ionicons name="close" size={20} color={colors.textSub} />
                    </PressableScale>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </GestureDetector>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: -6 },
      },
      android: { elevation: 24 },
      web: { boxShadow: '0 -8px 40px rgba(0,0,0,0.35)' } as never,
      default: {},
    }),
  },
  grabberWrap: { alignItems: 'center', paddingTop: 10 },
  grabber: { width: 40, height: 4.5, borderRadius: 3 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
  },
  title: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
