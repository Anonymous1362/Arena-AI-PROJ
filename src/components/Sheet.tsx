import React, { useCallback, useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
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
 * Lightweight, dependency-free bottom sheet built on Reanimated + Gesture
 * Handler. One UI-thread value owns both drag and dismissal, so a downward
 * swipe cannot reset to the open position for a frame before it closes.
 * Works on iOS, Android and web (PWA).
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
  // A fixed 700px travel distance can leave tall sheets visible on Android.
  const collapsed = Math.ceil(windowHeight + insets.bottom + 40);
  const translateY = useSharedValue(collapsed);
  const dismissing = useSharedValue(false);

  useEffect(() => {
    if (visible) {
      dismissing.set(false);
      translateY.set(collapsed);
      translateY.set(withSpring(0, Spring.snappy));
    } else {
      dismissing.set(true);
      translateY.set(withTiming(collapsed, { duration: 190 }));
    }
  }, [collapsed, dismissing, translateY, visible]);

  const close = useCallback(() => {
    haptics.light();
    onClose();
  }, [onClose]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(6)
        .failOffsetX([-36, 36])
        .onUpdate((event) => {
          if (dismissing.get()) return;
          translateY.set(Math.min(collapsed, Math.max(0, event.translationY)));
        })
        .onEnd((event) => {
          if (dismissing.get()) return;
          const shouldClose = event.translationY > Math.min(140, collapsed * 0.18) || event.velocityY > 1_100;
          if (shouldClose) {
            dismissing.set(true);
            translateY.set(withTiming(collapsed, { duration: 190 }, (finished) => {
              if (finished) runOnJS(close)();
            }));
          } else {
            translateY.set(withSpring(0, Spring.gentle));
          }
        }),
    [close, collapsed, dismissing, translateY]
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.get(), [0, collapsed], [1, 0], Extrapolation.CLAMP),
  }));

  const isPct = typeof maxHeight === 'string';

  return (
    <View pointerEvents={visible ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.backdrop },
          backdropStyle,
        ]}
      >
        <PressableScale
          haptic="none"
          scale={1}
          opacityOnPress={1}
          onPress={close}
          style={StyleSheet.absoluteFill}
        >
          <View style={StyleSheet.absoluteFill} />
        </PressableScale>
      </Animated.View>

      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
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
                    <PressableScale haptic="none" onPress={close} style={styles.closeBtn}>
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
