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
import {
  Terminal as TerminalIcon,
  Wrench as WrenchIcon,
  StepCode,
  StepWrite,
  StepRead,
  StepRun,
  StepFind,
  StepCraft,
} from '@/src/components/Icons';
import { Durations, Ease } from '@/src/theme/motion';
import { Sheet } from '@/src/components/Sheet';

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

function Spinning({ icon: Icon, size, color }: { icon: React.ComponentType<{ size: number; color: string }>; size: number; color: string }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.set(withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1, false));
  }, [rot]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon size={size} color={color} />
    </Animated.View>
  );
}

function StepIcon({ state, colors }: { state: PlanStep['state']; colors: ReturnType<typeof useTheme>['colors'] }) {
  if (state === 'done') return <Ionicons name="checkmark-circle" size={17} color={colors.success} />;
  if (state === 'active') return <SpinningIcon name="sync-circle" size={17} color={colors.accent} />;
  return <Ionicons name="ellipse-outline" size={15} color={colors.textFaint} />;
}

/* --------------------------------- plan panel -------------------------------- */

export type StepKind = 'code' | 'write' | 'read' | 'run' | 'find' | 'craft';

/** Classify a plan step by its words so each gets its own glyph + tint. */
export function stepKind(label: string): StepKind {
  const l = label.toLowerCase();
  if (/(read|open|inspect|review|look at|examine)/.test(l)) return 'read';
  if (/(run|test|verify|install|build|exec|command|typecheck|type-check|lint|check)/.test(l)) return 'run';
  if (/(search|find|locate|grep|explore|map|scan)/.test(l)) return 'find';
  if (/(write|create|add|implement|fix|update|edit|make|draft|compose|design)/.test(l)) return 'write';
  if (/(code|function|component|module|refactor|api|script|hook|class)/.test(l)) return 'code';
  return 'craft';
}

const STEP_GLYPH: Record<StepKind, React.ComponentType<{ size: number; color: string }>> = {
  code: StepCode,
  write: StepWrite,
  read: StepRead,
  run: StepRun,
  find: StepFind,
  craft: StepCraft,
};

function stepTint(kind: StepKind, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (kind) {
    case 'code': return colors.info;
    case 'write': return colors.accent;
    case 'read': return colors.success;
    case 'run': return colors.warning;
    case 'find': return colors.chart[4];
    default: return colors.chart[3];
  }
}

/**
 * The connector line between step tiles. It *draws* downwards (height animated
 * on the UI thread, ~0.9 s decelerate) when its step completes — the slow ink
 * line from Claude's plan view, without shipping their assets.
 */
function Connector({ filled, tint, base }: { filled: boolean; tint: string; base: string }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withTiming(filled ? 22 : 0, { duration: 900, easing: Ease.out });
  }, [filled, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <View style={{ width: 2, height: 22, backgroundColor: base, borderRadius: 1, overflow: 'hidden', marginVertical: 3 }}>
      <Animated.View style={[style, { width: 2, backgroundColor: tint, borderRadius: 1 }]} />
    </View>
  );
}

function StepTile({ state, kind, colors }: { state: PlanStep['state']; kind: StepKind; colors: ReturnType<typeof useTheme>['colors'] }) {
  const Glyph = STEP_GLYPH[kind];
  const tint = stepTint(kind, colors);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (state === 'active') {
      pulse.value = withRepeat(withTiming(0.55, { duration: 750, easing: Ease.inOut }), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: Durations.fast });
    }
  }, [state, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const bg = state === 'done' ? colors.successSoft : state === 'active' ? colors.accentSoft : colors.surface2;
  const iconColor = state === 'done' ? colors.success : state === 'active' ? colors.accent : `${tint}99`;

  return (
    <Animated.View
      style={[
        style,
        {
          width: 30,
          height: 30,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: state === 'active' ? 1.2 : 0,
          borderColor: colors.accent,
        },
      ]}
    >
      <Glyph size={15} color={iconColor} />
    </Animated.View>
  );
}

export function PlanPanel({
  steps,
  running,
  onOpenStep,
  canOpenStep,
}: {
  steps: PlanStep[];
  running: boolean;
  /** Tap a step to read what it actually did (commands, writes, outputs). */
  onOpenStep?: (index: number) => void;
  canOpenStep?: (index: number) => boolean;
}) {
  const { colors } = useTheme();
  const doneCount = steps.filter((s) => s.state === 'done').length;
  const allDone = steps.length > 0 && doneCount === steps.length;
  const [open, setOpen] = useState(running);

  useEffect(() => {
    if (running) setOpen(true);
    else {
      const t = setTimeout(() => setOpen(false), 2600);
      return () => clearTimeout(t);
    }
  }, [running, steps]);

  const title = running ? 'Working plan' : allDone ? 'Plan complete' : 'Plan';

  return (
    <View style={[styles.planWrap, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
      <PressableScale haptic="light" scale={0.99} opacityOnPress={0.85} onPress={() => setOpen((o) => !o)}>
        <View style={styles.planHeader}>
          {running ? <SpinningIcon name="sync" size={15} color={colors.accent} /> : <StepCraft size={15} color={allDone ? colors.success : colors.textSub} />}
          <Text style={[styles.planTitle, { color: colors.textSub }]}>{title}</Text>
          <Text style={[styles.planProgress, { color: colors.textFaint }]}>
            {doneCount}/{steps.length}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
        </View>
      </PressableScale>

      {open ? (
        <View style={{ paddingHorizontal: spacing(3.5), paddingTop: spacing(2), paddingBottom: spacing(3) }}>
          {steps.map((s, i) => {
            const kind = stepKind(s.label);
            const openable = !!onOpenStep && !!canOpenStep?.(i);
            const Row = openable ? PressableScale : View;
            return (
              <View key={s.id} style={{ flexDirection: 'row' }}>
                <View style={{ width: 30, alignItems: 'center' }}>
                  <StepTile state={s.state} kind={kind} colors={colors} />
                  {i < steps.length - 1 ? (
                    <Connector filled={s.state === 'done'} tint={stepTint(kind, colors)} base={colors.border} />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingLeft: spacing(3), paddingBottom: i < steps.length - 1 ? spacing(2.5) : 0 }}>
                  <Row
                    {...(openable
                      ? { haptic: 'select' as const, scale: 0.98, onPress: () => onOpenStep?.(i) }
                      : {})}
                    style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5 }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        color: s.state === 'active' ? colors.text : s.state === 'done' ? colors.textFaint : colors.textSub,
                        fontSize: 13,
                        lineHeight: 19,
                        fontWeight: s.state === 'active' ? '700' : '500',
                        paddingTop: 5,
                      }}
                    >
                      {s.label}
                    </Text>
                    {openable ? (
                      <Ionicons name="chevron-forward-circle-outline" size={15} color={colors.textFaint} style={{ marginTop: 6 }} />
                    ) : null}
                  </Row>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Popup panel for one step: the commands and tool calls it really ran. */
export function StepSheet({
  visible,
  onClose,
  step,
  events,
}: {
  visible: boolean;
  onClose: () => void;
  step: PlanStep | null;
  events: ToolEvent[];
}) {
  const { colors } = useTheme();
  const kind = step ? stepKind(step.label) : 'craft';
  const Glyph = STEP_GLYPH[kind];
  return (
    <Sheet visible={visible} onClose={onClose} title={step?.label ?? 'Step'} maxHeight="76%">
      <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(6) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(4) }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph size={17} color={stepTint(kind, colors)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
              {step?.state === 'done' ? 'Completed' : step?.state === 'active' ? 'In progress' : 'Not started'}
            </Text>
            <Text style={{ color: colors.textFaint, fontSize: 11.5, marginTop: 1 }}>
              {events.length ? `${events.length} recorded action${events.length === 1 ? '' : 's'}` : 'No commands or tool calls recorded'}
            </Text>
          </View>
        </View>
        {events.length ? (
          events.map((ev) => (
            <View key={ev.id} style={{ marginBottom: spacing(2.5) }}>
              <ToolEventCard ev={ev} />
            </View>
          ))
        ) : (
          <Text style={{ color: colors.textFaint, fontSize: 12.5, lineHeight: 18 }}>
            This step was thinking-only — the model planned or reasoned without touching files or the terminal.
          </Text>
        )}
      </View>
    </Sheet>
  );
}

/* ------------------------------- artifacts ---------------------------------- */

export function ArtifactPanel({ events }: { events: ToolEvent[] }) {
  const { colors } = useTheme();
  const artifacts = events.filter((e) => e.title === 'write_file' && e.ok && !e.running);
  if (!artifacts.length) return null;
  return (
    <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing(2), backgroundColor: colors.bgElevated }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <Ionicons name="sparkles-outline" size={15} color={colors.accent} />
        <Text style={{ color: colors.text, fontWeight: '800', flex: 1 }}>Artifacts</Text>
        <Text style={{ color: colors.textFaint, fontSize: 12 }}>{artifacts.length}</Text>
      </View>
      {artifacts.map((event) => (
        <View key={event.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5) }}>
          <Ionicons name="document-text-outline" size={16} color={colors.accent} />
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.textSub, fontWeight: '700' }}>{event.detail || 'Generated file'}</Text><Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11 }}>{event.output}</Text></View>
          <PressableScale haptic="light" onPress={() => Clipboard.setStringAsync(event.detail || event.output)}><Ionicons name="copy-outline" size={15} color={colors.textFaint}/></PressableScale>
        </View>
      ))}
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
            <Spinning icon={isCommand ? TerminalIcon : WrenchIcon} size={14} color={titleColor} />
          ) : (
            <>
              {isCommand ? (
                <TerminalIcon size={14} color={titleColor} />
              ) : ev.ok ? (
                <WrenchIcon size={14} color={titleColor} />
              ) : (
                <Ionicons name="alert-circle" size={14} color={colors.danger} />
              )}
            </>
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
