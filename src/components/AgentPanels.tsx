import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme, radius, spacing } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';
import type { PlanStep, ToolEvent } from '@/src/ai/types';

/* ------------------------------- shared atoms ------------------------------- */

function SpinningIcon({ name, size, color }: { name: keyof typeof Ionicons.glyphMap; size: number; color: string }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.set(withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1, false));
  }, [rot]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

function StepIcon({ state, colors }: { state: PlanStep['state']; colors: ReturnType<typeof useTheme>['colors'] }) {
  if (state === 'done') return <Ionicons name="checkmark-circle" size={17} color={colors.success} />;
  if (state === 'active') return <SpinningIcon name="sync-circle" size={17} color={colors.accent} />;
  return <Ionicons name="ellipse-outline" size={15} color={colors.textFaint} />;
}

/* --------------------------------- plan panel -------------------------------- */

export function PlanPanel({ steps, running }: { steps: PlanStep[]; running: boolean }) {
  const { colors } = useTheme();
  const doneCount = steps.filter((s) => s.state === 'done').length;
  const allDone = steps.length > 0 && doneCount === steps.length;
  const [open, setOpen] = useState(running);

  useEffect(() => {
    if (running) setOpen(true);
    else {
      const t = setTimeout(() => setOpen(false), 1400);
      return () => clearTimeout(t);
    }
  }, [running, steps]);

  const title = running ? 'Working plan' : allDone ? 'Plan complete' : 'Plan';

  return (
    <View
      style={[
        styles.planWrap,
        { backgroundColor: colors.bgElevated, borderColor: colors.border },
      ]}
    >
      <PressableScale
        haptic="light"
        scale={0.99}
        opacityOnPress={0.85}
        onPress={() => setOpen((o) => !o)}
      >
        <View style={styles.planHeader}>
          {running ? (
            <SpinningIcon name="sync" size={15} color={colors.accent} />
          ) : (
            <Ionicons name={allDone ? 'checkmark-circle' : 'list'} size={15} color={allDone ? colors.success : colors.textSub} />
          )}
          <Text style={[styles.planTitle, { color: colors.textSub }]}>{title}</Text>
          <Text style={[styles.planProgress, { color: colors.textFaint }]}>
            {doneCount}/{steps.length}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
        </View>
      </PressableScale>

      {open ? (
        <View style={styles.stepList}>
          {steps.map((s, i) => (
            <View key={s.id} style={[styles.stepRow, i === steps.length - 1 && { borderBottomWidth: 0 }]}>
              <StepIcon state={s.state} colors={colors} />
              <Text
                numberOfLines={3}
                style={[
                  styles.stepLabel,
                  {
                    color:
                      s.state === 'active' ? colors.text : s.state === 'done' ? colors.textFaint : colors.textSub,
                    textDecorationLine: s.state === 'done' ? 'line-through' : 'none',
                    fontWeight: s.state === 'active' ? '700' : '500',
                  },
                ]}
              >
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------- tool event card ----------------------------- */

function previewLines(output: string, n = 7): string {
  const lines = output.split('\n');
  if (lines.length <= n) return output;
  return `${lines.slice(0, n).join('\n')}\n… (${lines.length - n} more lines)`;
}

export function ToolEventCard({ ev }: { ev: ToolEvent }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const isCommand = ev.kind === 'command';
  const needsCollapse = ev.output.split('\n').length > 8 || ev.output.length > 480;
  const title = isCommand ? (ev.title.startsWith('$') ? ev.title : `$ ${ev.title}`) : ev.title;
  const headerBg = isCommand ? colors.termBg : colors.surface2;
  const bodyBg = isCommand ? colors.termBg : colors.surface;
  const titleColor = isCommand ? colors.termText : ev.ok ? colors.text : colors.danger;

  return (
    <View style={[styles.toolWrap, { borderColor: colors.border }]}>
      <View style={[styles.toolHeader, { backgroundColor: headerBg }]}>
        <View style={styles.toolHeaderLeading}>
          {ev.running ? (
            <SpinningIcon name={isCommand ? 'terminal' : 'construct'} size={14} color={titleColor} />
          ) : (
            <Ionicons
              name={isCommand ? 'terminal' : ev.ok ? 'construct' : 'alert-circle'}
              size={14}
              color={titleColor}
            />
          )}
          <Text numberOfLines={1} style={[styles.toolTitle, { color: titleColor }]}>
            {title}
          </Text>
        </View>
        {!ev.running ? (
          <View style={styles.toolHeaderTrailing}>
            <PressableScale
              haptic="none"
              scale={0.9}
              onPress={() => {
                Clipboard.setStringAsync(ev.output);
              }}
            >
              <Ionicons name="copy-outline" size={13} color={isCommand ? '#8E8A7E' : colors.textFaint} />
            </PressableScale>
            <Ionicons
              name={ev.ok ? 'checkmark' : 'close'}
              size={14}
              color={ev.ok ? colors.success : colors.danger}
            />
          </View>
        ) : null}
      </View>

      {ev.output ? (
        <PressableScale
          haptic="none"
          scale={1}
          opacityOnPress={0.8}
          onPress={() => {
            if (needsCollapse) setExpanded(!expanded);
          }}
        >
          <View style={{ backgroundColor: bodyBg }}>
            <Text
              selectable
              style={[
                styles.output,
                {
                  color: isCommand ? colors.termText : colors.textSub,
                  opacity: isCommand ? 0.92 : 1,
                },
              ]}
            >
              {expanded || !needsCollapse ? ev.output : previewLines(ev.output)}
            </Text>
            {needsCollapse && !expanded ? (
              <Text style={[styles.more, { color: isCommand ? '#8E8A7E' : colors.textFaint }]}>
                tap to expand
              </Text>
            ) : null}
          </View>
        </PressableScale>
      ) : (
        <View style={{ backgroundColor: bodyBg, paddingHorizontal: spacing(3), paddingVertical: spacing(2) }}>
          <Text style={[styles.output, { paddingHorizontal: 0, color: '#8E8A7E' }]}>running…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  planWrap: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing(2),
    overflow: 'hidden',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing(3.4),
    paddingVertical: spacing(2.6),
  },
  planTitle: { fontSize: 13.5, fontWeight: '700', flex: 1 },
  planProgress: { fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] as never },
  stepList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.18)',
    paddingHorizontal: spacing(3.4),
    paddingTop: spacing(1),
    paddingBottom: spacing(2),
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: spacing(1.6),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.10)',
  },
  stepLabel: { fontSize: 14, lineHeight: 19, flex: 1 },
  toolWrap: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: spacing(2),
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  toolHeaderLeading: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, marginRight: 8 },
  toolHeaderTrailing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolTitle: { fontSize: 12.5, fontWeight: '700', flexShrink: 1, flexGrow: 1 },
  output: { fontSize: 12.5, lineHeight: 18, paddingHorizontal: spacing(3), paddingVertical: spacing(2), fontVariant: ['tabular-nums'] as never },
  more: { fontSize: 11, paddingHorizontal: spacing(3), paddingBottom: spacing(2), fontWeight: '600' },
});
