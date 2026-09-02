import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing } from '@/src/theme';
import { Durations, Ease } from '@/src/theme/motion';
import { useToastStore } from '@/src/store/toast';

const LIFETIME = 3200;

/** Floating pill at the top of the screen; renders nothing when idle. */
export function Toast() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const text = useToastStore((s) => s.text);
  const kind = useToastStore((s) => s.kind);
  const seq = useToastStore((s) => s.seq);
  const hide = useToastStore((s) => s.hide);
  const y = useSharedValue(-80);
  const opacity = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!text) return;
    y.value = withTiming(0, { duration: Durations.normal, easing: Ease.springish });
    opacity.value = withTiming(1, { duration: Durations.fast });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      y.value = withTiming(-80, { duration: Durations.normal, easing: Ease.in });
      opacity.value = withTiming(0, { duration: Durations.fast });
      setTimeout(hide, Durations.normal);
    }, LIFETIME);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: opacity.value,
  }));

  const tint = kind === 'success' ? colors.success : kind === 'warn' ? colors.warning : colors.accent;
  const icon = kind === 'success' ? 'checkmark-circle' : kind === 'warn' ? 'alert-circle' : 'information-circle';

  return (
    <Animated.View pointerEvents="none" style={[style, { position: 'absolute', top: insets.top + 8, left: spacing(4), right: spacing(4), zIndex: 60 }]}>
      {text ? (
        <View
          style={[
            styles.pill,
            { backgroundColor: colors.surface, borderColor: colors.borderStrong, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
          ]}
        >
          <Ionicons name={icon} size={15} color={tint} />
          <Text numberOfLines={2} style={{ color: colors.text, fontSize: 12.5, fontWeight: '600', flex: 1, lineHeight: 17 }}>
            {text}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2.5),
  },
});
