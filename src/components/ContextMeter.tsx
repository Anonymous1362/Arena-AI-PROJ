import React, { useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useTheme, radius, spacing } from '@/src/theme';
import { Durations, Ease, isReducedMotion } from '@/src/theme/motion';
import { PressableScale } from '@/src/components/PressableScale';
import { Sheet } from '@/src/components/Sheet';
import { Button } from '@/src/components/ui';
import { Gauge } from '@/src/components/Icons';
import { contextUsageFor, compactConversation, isCompacting } from '@/src/ai/context';
import { useSettingsStore } from '@/src/store/settings';
import { useChatsStore, type Conversation } from '@/src/store/chats';
import { formatContext, modelMeta, prettyModelName } from '@/src/ai/catalog';
import { haptics } from '@/src/utils/haptics';

/**
 * Live context-window meter.
 *
 * The bar is driven by a UI-thread shared value so it animates with every
 * streamed chunk without re-running layout. Colour steps from the accent to
 * amber to red as the window fills, and the detail sheet exposes a manual
 * "Compact now" for the Project Summary State pass.
 */

function tintFor(pct: number, colors: ReturnType<typeof useTheme>['colors']): string {
  if (pct >= 0.92) return colors.danger;
  if (pct >= 0.75) return colors.warning;
  return colors.success;
}

export function ContextMeter({
  conversation,
  compact = true,
}: {
  conversation: Conversation | undefined;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const enabled = useSettingsStore((s) => s.context.showMeter);
  const systemPrompt = useSettingsStore((s) => s.generation.systemPrompt);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const prompt = conversation?.systemPromptOverride ?? systemPrompt ?? '';
  const usage = useMemo(() => contextUsageFor(conversation, prompt), [conversation, prompt]);

  const fill = useSharedValue(0);
  React.useEffect(() => {
    fill.set(
      isReducedMotion()
        ? Math.min(1, usage.pct)
        : withTiming(Math.min(1, usage.pct), { duration: Durations.smooth, easing: Ease.out })
    );
  }, [fill, usage.pct]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.max(2, fill.get() * 100)}%`,
    transform: [{ scaleX: 1 }],
  }));

  const open = useCallback(() => {
    haptics.navigate();
    setSheet(true);
  }, []);

  if (!enabled) return null;

  const tint = tintFor(usage.pct, colors);
  const pct = Math.round(usage.pct * 100);

  const runCompact = async () => {
    if (!conversation) return;
    setBusy(true);
    const res = await compactConversation(conversation.id, { manual: true });
    setBusy(false);
    if (!res.ok) haptics.warning();
    if (res.ok) setSheet(false);
  };

  return (
    <>
      <PressableScale haptic="none" scale={0.94} onPress={open}>
        <View style={[styles.pill, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <Gauge size={13} color={tint} />
          <View style={[styles.track, { backgroundColor: colors.surface3 }]}>
            <Animated.View style={[styles.bar, { backgroundColor: tint }, barStyle]} />
          </View>
          <Text style={[styles.pct, { color: pct >= 75 ? tint : colors.textFaint }]}>{pct}%</Text>
        </View>
      </PressableScale>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Context window">
        <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2), gap: spacing(3) }}>
          <View style={[styles.bigBar, { backgroundColor: colors.surface2 }]}>
            <Animated.View style={[styles.bigFill, { backgroundColor: tint }, barStyle]} />
          </View>

          <View style={styles.grid}>
            <Stat label="Used" value={formatContext(usage.used)} color={colors.text} />
            <Stat label="Window" value={formatContext(usage.window)} color={colors.text} />
            <Stat label="Free" value={formatContext(Math.max(0, usage.window - usage.used))} color={colors.success} />
            <Stat label="Source" value={usage.source === 'provider' ? 'Provider' : 'Estimate'} color={colors.textSub} />
          </View>

          <View style={[styles.note, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.textSub, fontSize: 12.5, lineHeight: 18 }}>
              {conversation?.model?.model
                ? `${prettyModelName(conversation.model.model)} · ${modelMeta(conversation.model.model).family}`
                : 'No model selected'}
              {'\n'}
              Auto-compact triggers at {useSettingsStore.getState().context.compactAtPct}% — the conversation is
              compressed into a Project Summary State and the most recent turns are kept verbatim. Nothing is deleted.
            </Text>
          </View>

          {conversation?.summary ? (
            <View style={[styles.note, { backgroundColor: colors.accentSoft }]}>
              <Text style={{ color: colors.accent, fontSize: 12.5, fontWeight: '700' }}>
                Compacted {conversation.summaryAt ? new Date(conversation.summaryAt).toLocaleString() : ''}
              </Text>
              <Text numberOfLines={4} style={{ color: colors.accent, fontSize: 12, marginTop: 4, opacity: 0.85 }}>
                {conversation.summary}
              </Text>
            </View>
          ) : null}

          {compact ? (
            <Button
              label={busy ? 'Compacting…' : 'Compact now'}
              icon="archive-outline"
              variant={conversation?.summary ? 'secondary' : 'primary'}
              disabled={busy || isCompacting(conversation?.id ?? '') || (conversation?.messages.length ?? 0) < 8}
              onPress={runCompact}
            />
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface2 }]}>
      <Text style={{ color: colors.textFaint, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ color, fontSize: 16, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  track: { width: 40, height: 4, borderRadius: 2, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2 },
  pct: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bigBar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  bigFill: { height: 10, borderRadius: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  stat: { flexBasis: '47%', flexGrow: 1, borderRadius: radius.md, padding: spacing(3) },
  note: { borderRadius: radius.md, padding: spacing(3) },
  ...(Platform.OS === 'web' ? {} : {}),
});
