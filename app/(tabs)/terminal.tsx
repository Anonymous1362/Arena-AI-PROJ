import React, { useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing } from '@/src/theme';
import { Segmented } from '@/src/components/ui';
import { PressableScale } from '@/src/components/PressableScale';
import { TerminalView } from '@/src/components/TerminalView';
import { ToolEventCard } from '@/src/components/AgentPanels';
import { ConfirmSheet } from '@/src/components/ConfirmSheet';
import { Terminal } from '@/src/components/Icons';
import { useChatsStore } from '@/src/store/chats';
import { useSettingsStore } from '@/src/store/settings';
import { executorStatus, shellCwd } from '@/src/agent/tools';
import { currentRoot } from '@/src/agent/fs';
import { haptic } from '@/src/utils/haptics';

type Mode = 'shell' | 'agent';

/**
 * Terminal tab.
 *
 * Two views of the same sandbox:
 *  - **Shell** — a real interactive REPL. You type, it runs, output streams
 *    back. No Termux, no second app, no download: it uses the compiled-in
 *    native executor when the device has it and a POSIX-flavoured JS shell
 *    otherwise.
 *  - **Agent** — the audit log of every command the agent ran on your behalf,
 *    with the exact output and exit status it saw.
 */
export default function TerminalScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('shell');
  const conversations = useChatsStore((s) => s.conversations);
  const createConversation = useChatsStore((s) => s.createConversation);

  const events = useMemo(
    () =>
      conversations
        .flatMap((c) =>
          c.messages.flatMap((m) =>
            (m.toolEvents ?? []).filter((e) => e.kind === 'command').map((event) => ({ event, chat: c.title }))
          )
        )
        .sort((a, b) => b.event.ts - a.event.ts),
    [conversations]
  );

  const native = executorStatus() === 'native';
  const root = currentRoot();

  const askAgent = useCallback(
    (transcript: string) => {
      const tail = transcript.length > 4000 ? transcript.slice(-4000) : transcript;
      const conv = createConversation(useSettingsStore.getState().activeModel);
      const prefill = `Here is my terminal session. Explain what happened and tell me the next command to run.\n\n\`\`\`\n${tail}\n\`\`\``;
      haptic('send');
      router.push({ pathname: '/chat/[id]', params: { id: conv.id, prefill } });
    },
    [createConversation]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          paddingTop: insets.top + spacing(4),
          paddingHorizontal: spacing(5),
          paddingBottom: spacing(3),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 }}>Terminal</Text>
          <View style={{ flex: 1 }} />
          <PressableScale haptic="select" scale={0.9} onPress={() => router.push('/settings/shell')}>
            <View style={[styles.iconBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Ionicons name="settings-outline" size={18} color={colors.textSub} />
            </View>
          </PressableScale>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing(2.5) }}>
          <StatusChip
            color={native ? colors.success : colors.warning}
            icon={native ? 'hardware-chip-outline' : 'code-slash'}
            label={native ? 'copper-exec · native shell' : 'built-in sandbox shell'}
          />
          <StatusChip
            color={root.tier === 'granted' ? colors.success : colors.textSub}
            icon={root.tier === 'granted' ? 'folder-open-outline' : 'shield-checkmark-outline'}
            label={root.tier === 'granted' ? 'your folder' : 'app sandbox'}
          />
          <StatusChip color={colors.accent} icon="terminal-outline" label={`/${shellCwd() === '.' ? '' : shellCwd()}`} mono />
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2.5) }}>
        <Segmented<Mode>
          options={[
            { value: 'shell', label: 'Shell' },
            { value: 'agent', label: `Agent log${events.length ? ` · ${events.length}` : ''}` },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            haptic('navigate');
          }}
        />
      </View>

      {mode === 'shell' ? (
        <Animated.View entering={FadeInLeft.duration(180)} style={{ flex: 1 }}>
          <TerminalView onAskAgent={askAgent} />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInRight.duration(180)} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: 130, gap: spacing(3) }}>
            {!events.length ? (
              <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.bgElevated }]}>
                <Terminal size={28} color={colors.accent} />
                <Text style={{ color: colors.text, fontWeight: '700' }}>No agent commands yet</Text>
                <Text style={{ color: colors.textFaint, textAlign: 'center', lineHeight: 19 }}>
                  Every command the agent runs is logged here with its real output and exit status — nothing is
                  paraphrased.{'\n\n'}Try the <Text style={{ color: colors.accent, fontWeight: '700' }}>Shell</Text> tab to
                  drive the same sandbox yourself.
                </Text>
              </View>
            ) : (
              events.map(({ event, chat }, i) => (
                <Animated.View key={event.id} entering={i < 12 ? FadeInDown.delay(i * 35).duration(220) : undefined}>
                  <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11, marginBottom: 5, fontWeight: '600' }}>
                    {chat}
                  </Text>
                  <ToolEventCard ev={event} />
                </Animated.View>
              ))
            )}
          </ScrollView>
        </Animated.View>
      )}

      {/* Shared with the agent loop — one confirmation surface, one rule set. */}
      <ConfirmSheet />
    </View>
  );
}

function StatusChip({
  color,
  icon,
  label,
  mono,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  mono?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statusChip, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Ionicons name={icon} size={11} color={colors.textSub} />
      <Text
        numberOfLines={1}
        style={{
          color: colors.textSub,
          fontSize: 11,
          fontWeight: '700',
          fontFamily: mono ? Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) : undefined,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.4),
    maxWidth: '100%',
  },
  empty: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing(8),
    alignItems: 'center',
    gap: spacing(2),
    marginTop: spacing(8),
  },
});
