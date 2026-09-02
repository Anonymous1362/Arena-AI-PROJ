import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useChatsStore } from '@/src/store/chats';
import { useTerminalStore } from '@/src/store/terminal';
import { ToolEventCard } from '@/src/components/AgentPanels';
import { Terminal, ArrowUp } from '@/src/components/Icons';
import { PressableScale } from '@/src/components/PressableScale';
import { executorStatus, runInteractiveCommand } from '@/src/agent/tools';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string;

function StatusPill({ mode }: { mode: 'native' | 'builtin' }) {
  const { colors } = useTheme();
  const native = mode === 'native';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        borderRadius: radius.full,
        paddingHorizontal: spacing(2.4),
        paddingVertical: 3,
        backgroundColor: native ? 'rgba(61,122,70,0.14)' : 'rgba(176,124,34,0.16)',
        marginTop: 4,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: native ? colors.success : colors.warning }} />
      <Text style={{ color: native ? colors.success : colors.warning, fontSize: 11.5, fontWeight: '800' }}>
        {native ? 'NATIVE SHELL' : 'SANDBOXED BUILT-INS'}
      </Text>
    </View>
  );
}

export default function TerminalScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const conversations = useChatsStore((s) => s.conversations);
  const manual = useTerminalStore((s) => s.entries);
  const addEntry = useTerminalStore((s) => s.addEntry);
  const clearManual = useTerminalStore((s) => s.clear);

  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const mode = useMemo(() => executorStatus(), []);

  const agentEvents = useMemo(
    () =>
      conversations
        .flatMap((c) =>
          c.messages.flatMap((m) =>
            (m.toolEvents ?? [])
              .filter((e) => e.kind === 'command')
              .map((event) => ({ event, chat: c.title }))
          )
        )
        .sort((a, b) => b.event.ts - a.event.ts)
        .slice(0, 50),
    [conversations]
  );

  const run = useCallback(
    async (raw?: string) => {
      const cmd = (raw ?? input).trim();
      if (!cmd || running) return;
      setInput('');
      setRunning(true);
      const res = await runInteractiveCommand(cmd);
      addEntry({ cmd, output: res.output, ok: res.ok, mode: res.mode, ms: res.ms });
      setRunning(false);
    },
    [addEntry, input, running]
  );

  const hasAnything = manual.length > 0 || agentEvents.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* header */}
      <View style={{ paddingTop: insets.top + spacing(4), paddingHorizontal: spacing(5), paddingBottom: spacing(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', flex: 1 }}>Terminal</Text>
          {manual.length ? (
            <PressableScale
              haptic="light"
              scale={0.9}
              onPress={() => {
                clearManual();
              }}
            >
              <View style={{ backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: spacing(2.6), paddingVertical: spacing(1.2) }}>
                <Text style={{ color: colors.textSub, fontSize: 12, fontWeight: '700' }}>Clear mine</Text>
              </View>
            </PressableScale>
          ) : null}
        </View>
        <Text style={{ color: colors.textFaint, marginTop: 2 }}>Run commands yourself, or watch the agent work.</Text>
        <StatusPill mode={mode} />
      </View>

      {/* output */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2), gap: spacing(2.5) }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        {!hasAnything ? (
          <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.bgElevated }]}>
            <Terminal size={26} color={colors.accent} />
            <Text style={{ color: colors.text, fontWeight: '700' }}>Type a command below</Text>
            <Text style={{ color: colors.textFaint, textAlign: 'center', lineHeight: 18 }}>
              {mode === 'native'
                ? 'A native executor is available — commands run through a real shell.'
                : 'Runs through the sandboxed shell for now: ls, cat, pwd, echo, grep, head, tail, wc, touch, mkdir, rm, mv, cp, find, help.'}
            </Text>
          </View>
        ) : null}

        {manual.map((e) => (
          <View key={e.id} style={[styles.block, { backgroundColor: colors.surface2, borderLeftColor: colors.borderStrong }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.prompt, { color: colors.accent }]}>$</Text>
              <Text style={[styles.cmd, { color: colors.text }]} selectable>
                {e.cmd}
              </Text>
            </View>
            {e.output ? (
              <Text style={[styles.out, { color: e.ok ? colors.textSub : colors.danger }]} selectable>
                {e.output}
              </Text>
            ) : null}
            <Text style={{ color: colors.textFaint, fontSize: 10.5, marginTop: 4 }}>
              {e.ok ? 'exit 0' : 'exit 1'} · {e.ms}ms · {e.mode === 'native' ? 'native' : 'builtin'}
            </Text>
          </View>
        ))}

        {manual.length > 0 && agentEvents.length > 0 ? (
          <View style={{ marginTop: spacing(2) }}>
            <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>AGENT RUNS</Text>
          </View>
        ) : null}

        {agentEvents.map(({ event, chat }) => (
          <View key={event.id}>
            <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11, marginBottom: 5 }}>
              {chat}
            </Text>
            <ToolEventCard ev={event} />
          </View>
        ))}
      </ScrollView>

      {/* input */}
      <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={running ? 'Running…' : 'Type a command…'}
          placeholderTextColor={colors.textFaint}
          editable={!running}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={() => run()}
          style={[styles.input, { color: colors.text }]}
          selectionColor={colors.accent}
        />
        <PressableScale haptic="medium" scale={0.88} onPress={() => run()} disabled={running || !input.trim()}>
          <View style={[styles.sendBtn, { backgroundColor: input.trim() && !running ? colors.accent : colors.surface3 }]}>
            <ArrowUp size={18} color={input.trim() && !running ? colors.onAccent : colors.textFaint} strokeWidth={2.2} />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing(8),
    alignItems: 'center',
    gap: spacing(2),
    marginTop: spacing(6),
  },
  block: {
    borderRadius: radius.md,
    paddingVertical: spacing(2.4),
    paddingHorizontal: spacing(3),
    borderLeftWidth: 3,
  },
  prompt: { fontSize: 13, fontWeight: '800', fontFamily: MONO },
  cmd: { fontSize: 13.5, fontWeight: '700', fontFamily: MONO, flex: 1 },
  out: { fontSize: 12.5, lineHeight: 18, marginTop: 6, fontFamily: MONO },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginHorizontal: spacing(3),
    marginBottom: spacing(2),
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing(3),
    paddingRight: spacing(2),
    paddingVertical: spacing(1.6),
  },
  input: { flex: 1, fontSize: 14.5, fontFamily: MONO, paddingVertical: spacing(1.4) },
  sendBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
