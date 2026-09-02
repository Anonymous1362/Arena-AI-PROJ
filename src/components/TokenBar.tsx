import React, { useMemo } from 'react';
import { StyleSheet, Text, View, LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/src/theme';
import type { Conversation } from '@/src/store/chats';

/* --------------------------------- estimate -------------------------------- */

/** Rough token estimate (~4 chars/token) for text + tool transcript content. */
export function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateConversationTokens(conv: Conversation | undefined): number {
  if (!conv) return 0;
  let total = 0;
  for (const m of conv.messages) {
    total += estimateTokens(m.content);
    total += estimateTokens(m.reasoning);
    if (m.planSteps?.length) total += estimateTokens(m.planSteps.map((s) => s.label).join(' '));
    for (const ev of m.toolEvents ?? []) {
      total += estimateTokens(ev.title + ' ' + (ev.detail ?? '') + ' ' + (ev.output ?? ''));
    }
    total += estimateTokens(m.error);
  }
  return total;
}

/** Model-aware context windows (tokens). Rough, per family — used only for the meter. */
function contextWindowFor(modelLabel: string | undefined): number {
  const m = (modelLabel ?? '').toLowerCase();
  if (m.includes('gemini')) return 1_048_576; // 1M
  if (m.includes('claude')) return 200_000;
  if (m.includes('grok') || m.includes('gpt-5') || m.includes('o3') || m.includes('o4')) return 400_000;
  return 128_000;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `${n}`;
}

/* ----------------------------------- bar ----------------------------------- */

/**
 * Slim live context meter shown under the chat header. Estimates the tokens
 * used by the visible transcript and colours the fill against the model’s
 * context window: green → amber at 70% → red at 90%.
 */
export function TokenBar({
  conv,
  modelLabel,
  visible = true,
}: {
  conv: Conversation | undefined;
  modelLabel?: string;
  visible?: boolean;
}) {
  const { colors } = useTheme();
  const used = useMemo(() => estimateConversationTokens(conv), [conv]);
  const window = useMemo(() => contextWindowFor(modelLabel), [modelLabel]);
  const pct = Math.min(1, used / window);
  const progress = useSharedValue(0);
  const trackWpx = useSharedValue(0);

  React.useEffect(() => {
    progress.set(withTiming(pct, { duration: 380 }));
  }, [pct, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: trackWpx.get() * progress.get(),
  }));

  const tone =
    pct >= 0.9 ? colors.danger : pct >= 0.7 ? colors.warning : colors.success;

  if (!visible || !conv || conv.messages.length === 0) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) trackWpx.set(w);
  };

  return (
    <View style={styles.row}>
      <View
        style={[styles.track, { backgroundColor: colors.surface3 }]}
        onLayout={onLayout}
      >
        <Animated.View style={[styles.fill, { backgroundColor: tone }, fillStyle]} />
      </View>
      <Text style={[styles.label, { color: pct >= 0.7 ? tone : colors.textFaint }]} numberOfLines={1}>
        {used >= 1000 ? '~' : ''}
        {formatCount(used)} / {formatCount(window)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 7,
    paddingHorizontal: 2,
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    borderRadius: 2,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as never,
    minWidth: 74,
    textAlign: 'right',
  },
});
