import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/src/theme';

function Dot({ index, color }: { index: number; color: string }) {
  const opacity = useSharedValue(0.25);
  useEffect(() => {
    opacity.set(
      withDelay(
        index * 160,
        withRepeat(
          withTiming(1, { duration: 480, easing: Easing.inOut(Easing.quad) }),
          -1,
          true
        )
      )
    );
  }, [index, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** Animated thinking indicator used while the first token is pending. */
export function TypingDots({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {label ? (
        <Text numberOfLines={1} style={[styles.label, { color: colors.textSub }]}>
          {label}
        </Text>
      ) : null}
      <Dot index={0} color={colors.accent} />
      <Dot index={1} color={colors.accent} />
      <Dot index={2} color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: '600', marginRight: 4 },
});
