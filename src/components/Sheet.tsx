import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme';
import { Spring, Timing } from '@/src/theme/motion';
import { radius } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/src/utils/haptics';

/**
 * Lightweight, dependency-free bottom sheet built on Reanimated + Gesture
 * Handler. Slides with a spring, dimmes the backdrop, drag-to-dismiss.
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

const COLLAPSED = 700;

export function Sheet({ visible, onClose, title, children, maxHeight = '72%', plain = false }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(COLLAPSED);
  const backdrop = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      drag.set(0);
      y.set(withSpring(0, Spring.overlay));
      backdrop.set(Timing.normal(1));
    } else {
      y.set(Timing.normal(COLLAPSED));
      backdrop.set(Timing.fast(0));
    }
  }, [visible, y, backdrop, drag]);

  const close = useMemo(() => () => {
    haptics.light();
    onClose();
  }, [onClose]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          drag.set(Math.max(0, e.translationY));
        })
        .onEnd((e) => {
          const shouldClose = e.translationY > 110 || e.velocityY > 900;
          if (shouldClose) {
            drag.set(0);
            y.set(Timing.normal(COLLAPSED));
            backdrop.set(Timing.fast(0));
            runOnJS(close)();
          } else {
            drag.set(withSpring(0, Spring.gentle));
          }
        }),
    [close, drag, y, backdrop]
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() + drag.get() }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.get(),
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
          onPress={() => {
            haptics.light();
            onClose();
          }}
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
                    <PressableScale haptic="light" onPress={onClose} style={styles.closeBtn}>
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
    transform: [{ translateY: COLLAPSED }],
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
