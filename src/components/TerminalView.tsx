import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme, radius, spacing, tabBarClearance } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';
import { useSettingsStore } from '@/src/store/settings';
import { runShellCommand, setShellCwd, shellCwd, SHELL_BUILTINS, executorStatus } from '@/src/agent/tools';
import { classifyCommand, dangerHeadline } from '@/src/agent/danger';
import { useConfirmStore } from '@/src/agent/confirm';
import { listAgentDir, currentRoot } from '@/src/agent/fs';
import { haptic } from '@/src/utils/haptics';
import { useKeyboardInset } from '@/src/utils/keyboard';
import { uid } from '@/src/utils/id';

export interface TermLine {
  id: string;
  kind: 'in' | 'out' | 'err' | 'sys';
  text: string;
  ts: number;
}

const BANNER = [
  'copper-sh — sandboxed shell over the agent storage root.',
  'Type `help` for the built-in command list.',
].join('\n');

const QUICK = ['ls', 'pwd', 'map', 'cat ', 'grep ', 'find .', 'tree', 'help', 'clear'];

/**
 * An interactive terminal built into the app — no Termux, no second sandbox,
 * nothing to download.
 *
 * It drives the exact same executor the agent's `run_command` tool uses, so
 * both share one working directory, one storage root and one honesty story:
 * a native `/system/bin/sh` when the copper-exec module is compiled in, and a
 * POSIX-flavoured JS shell otherwise (sequencing, pipes, quoting, cd, grep,
 * find, mkdir, rm, mv, cp, …).
 *
 * Input rides the real keyboard frame on the UI thread, so the prompt is never
 * covered on Android's edge-to-edge layout.
 */
export function TerminalView({ onAskAgent }: { onAskAgent?: (transcript: string) => void }) {
  const { colors } = useTheme();
  const terminal = useSettingsStore((s) => s.terminal);
  const insets = useSafeAreaInsets();
  const kb = useKeyboardInset();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const [lines, setLines] = useState<TermLine[]>([
    { id: uid('t'), kind: 'sys', text: BANNER, ts: Date.now() },
    { id: uid('t'), kind: 'sys', text: `root: ${currentRoot().tier === 'granted' ? 'user-granted folder' : 'app sandbox'} · executor: ${executorStatus()}`, ts: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState(shellCwd());
  const [busy, setBusy] = useState(false);
  const [historyIx, setHistoryIx] = useState(-1);
  const history = useRef<string[]>([]);
  const [atBottom, setAtBottom] = useState(true);

  const native = executorStatus() === 'native';
  const prompt = `copper:/${cwd === '.' ? '' : cwd}$`;

  const push = useCallback((kind: TermLine['kind'], text: string) => {
    setLines((prev) => {
      const next = [...prev, { id: uid('t'), kind, text, ts: Date.now() }];
      // Settings → Shell & sandbox → Scrollback, clamped so a runaway command
      // can't grow the array without bound.
      const cap = Math.min(4000, Math.max(100, terminal.scrollback));
      return next.length > cap ? next.slice(next.length - cap) : next;
    });
  }, [terminal.scrollback]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    if (atBottom) scrollToEnd();
  }, [lines, atBottom, scrollToEnd]);

  const run = useCallback(
    async (raw: string) => {
      const command = raw.trim();
      if (!command) return;
      setInput('');
      setHistoryIx(-1);
      history.current = [command, ...history.current.filter((h) => h !== command)].slice(0, 200);
      push('in', `${prompt} ${command}`);

      if (command === 'clear') {
        setLines([]);
        return;
      }
      if (command === 'history') {
        push('out', history.current.map((h, i) => `${String(i + 1).padStart(3, ' ')}  ${h}`).join('\n'));
        scrollToEnd();
        return;
      }

      // Same guard the agent uses: rm, git reset --hard, force-push, …
      const danger = terminal.confirmDestructive ? classifyCommand(command) : null;
      if (danger) {
        const allowed = await new Promise<boolean>((resolve) => {
          useConfirmStore.getState().push({
            id: uid('c'),
            toolName: 'run_command',
            summary: dangerHeadline(danger),
            argsPreview: command,
            resolve,
          });
        });
        if (!allowed) {
          push('sys', 'declined — nothing ran.');
          scrollToEnd();
          return;
        }
      }

      setBusy(true);
      try {
        const res = await runShellCommand(command, 30_000, cwd);
        // `cd` mutates shared shell state — mirror it locally.
        setCwd(shellCwd());
        if (res.output) push(res.ok ? 'out' : 'err', res.output);
        if (!res.ok && !res.output) push('err', `exit ${res.exit}`);
      } catch (e) {
        push('err', (e as Error).message);
      } finally {
        setBusy(false);
        scrollToEnd();
      }
    },
    [cwd, prompt, push, scrollToEnd, terminal.confirmDestructive]
  );

  /* ------------------------------ tab completion ----------------------------- */

  const complete = useCallback(async () => {
    const text = input;
    if (!text.trim()) return;
    const parts = text.split(/(\s+)/);
    const last = parts[parts.length - 1] ?? '';
    const isFirstWord = text.trim().split(/\s+/).length === 1;

    if (isFirstWord) {
      const hit = (SHELL_BUILTINS as readonly string[]).filter((b) => b.startsWith(last));
      if (hit.length === 1) {
        setInput(`${hit[0]} `);
        haptic('select');
        return;
      }
      if (hit.length > 1) push('sys', hit.join('   '));
      return;
    }

    // path completion against the sandbox
    const slash = last.lastIndexOf('/');
    const dir = slash >= 0 ? last.slice(0, slash) || '.' : cwd;
    const frag = slash >= 0 ? last.slice(slash + 1) : last;
    try {
      const listing = await listAgentDir(dir);
      const names = listing
        .split('\n')
        .slice(1)
        .map((l) => l.trim().split(/\s+/))
        .filter((p) => p.length > 1)
        .map((p) => ({ kind: p[0], name: p.slice(1).join(' ') }))
        .filter((n) => n.name.startsWith(frag));
      if (names.length === 1) {
        const suffix = names[0].kind === 'd' ? '/' : '';
        const prefix = slash >= 0 ? last.slice(0, slash + 1) : '';
        setInput(text.slice(0, text.length - last.length) + prefix + names[0].name + suffix);
        haptic('select');
      } else if (names.length > 1) {
        push('sys', names.map((n) => (n.kind === 'd' ? `${n.name}/` : n.name)).join('   '));
      }
    } catch {
      /* nothing to complete */
    }
    scrollToEnd();
  }, [cwd, input, push, scrollToEnd]);

  const stepHistory = useCallback(
    (dir: -1 | 1) => {
      const h = history.current;
      if (!h.length) return;
      const next = dir === -1 ? Math.min(historyIx + 1, h.length - 1) : Math.max(historyIx - 1, -1);
      setHistoryIx(next);
      setInput(next === -1 ? '' : h[next]);
      haptic('tap');
    },
    [historyIx]
  );

  const transcript = useMemo(() => lines.map((l) => (l.kind === 'in' ? l.text : l.text)).join('\n'), [lines]);

  const inputLift = useAnimatedStyle(() => ({ transform: [{ translateY: -kb.shared.get() }] }));

  const colorFor = (kind: TermLine['kind']) =>
    kind === 'err' ? '#F08A72' : kind === 'in' ? colors.termAccent : kind === 'sys' ? '#8FA6C8' : colors.termText;

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.screen, { backgroundColor: colors.termBg }]}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing(3.5), paddingBottom: spacing(4), flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => setAtBottom(false)}
          onMomentumScrollEnd={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const bottom = contentSize.height - contentOffset.y - layoutMeasurement.height < 60;
            setAtBottom(bottom);
          }}
        >
          {lines.map((l) => (
            <Text
              key={l.id}
              selectable
              style={{
                color: colorFor(l.kind),
                fontSize: terminal.fontSize,
                lineHeight: terminal.fontSize * 1.5,
                fontFamily: MONO,
                opacity: l.kind === 'sys' ? 0.75 : 1,
                flexWrap: terminal.wrap ? 'wrap' : 'nowrap',
              }}
            >
              {l.text}
            </Text>
          ))}
          {busy ? (
            <Text style={{ color: colors.termAccent, fontSize: terminal.fontSize, fontFamily: MONO, marginTop: 4 }}>
              ▍running…
            </Text>
          ) : null}
        </ScrollView>

        {!atBottom ? (
          <PressableScale haptic="navigate" scale={0.9} onPress={scrollToEnd}>
            <View style={[styles.jump, { backgroundColor: colors.surface3 }]}>
              <Ionicons name="chevron-down" size={18} color={colors.termText} />
            </View>
          </PressableScale>
        ) : null}
      </View>

      {/* quick commands */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing(3), gap: 7, paddingVertical: spacing(2) }}
        style={{ backgroundColor: colors.bg, flexGrow: 0 }}
      >
        {QUICK.map((q) => (
          <PressableScale key={q} haptic="tap" scale={0.94} onPress={() => (q.endsWith(' ') ? setInput(q) : run(q))}>
            <View style={[styles.chip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Text style={{ color: colors.textSub, fontSize: 11.5, fontWeight: '700', fontFamily: MONO }}>{q.trim()}</Text>
            </View>
          </PressableScale>
        ))}
        {onAskAgent ? (
          <PressableScale haptic="select" scale={0.94} onPress={() => onAskAgent(transcript)}>
            <View style={[styles.chip, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
              <Ionicons name="sparkles" size={11} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 11.5, fontWeight: '800' }}>Ask the agent</Text>
            </View>
          </PressableScale>
        ) : null}
        <PressableScale
          haptic="select"
          scale={0.94}
          onPress={async () => {
            await Clipboard.setStringAsync(transcript);
            haptic('success');
          }}
        >
          <View style={[styles.chip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <Ionicons name="copy-outline" size={11} color={colors.textSub} />
            <Text style={{ color: colors.textSub, fontSize: 11.5, fontWeight: '700' }}>Copy session</Text>
          </View>
        </PressableScale>
      </ScrollView>

      {/* input row */}
      <Animated.View style={[{ backgroundColor: colors.bg }, inputLift]}>
        <View style={[styles.inputBar, { borderTopColor: colors.border, paddingBottom: tabBarClearance(insets.bottom) }]}>
          <PressableScale haptic="tap" scale={0.86} onPress={() => stepHistory(1)}>
            <View style={[styles.histBtn, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="chevron-up" size={16} color={colors.textSub} />
            </View>
          </PressableScale>
          <PressableScale haptic="tap" scale={0.86} onPress={() => stepHistory(-1)}>
            <View style={[styles.histBtn, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="chevron-down" size={16} color={colors.textSub} />
            </View>
          </PressableScale>

          <View style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.accent, fontSize: 12, fontFamily: MONO, fontWeight: '700' }} numberOfLines={1}>
              {prompt}
            </Text>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder={native ? 'sh -c …' : 'ls, cat, grep, help…'}
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              blurOnSubmit={false}
              returnKeyType="go"
              onSubmitEditing={() => run(input)}
              style={{ flex: 1, color: colors.text, fontSize: 13.5, fontFamily: MONO, paddingVertical: Platform.OS === 'ios' ? 8 : 4 }}
              selectionColor={colors.accent}
            />
          </View>

          <PressableScale haptic="tap" scale={0.86} onPress={complete}>
            <View style={[styles.histBtn, { backgroundColor: colors.surface2 }]}>
              <Text style={{ color: colors.textSub, fontSize: 11, fontWeight: '800', fontFamily: MONO }}>tab</Text>
            </View>
          </PressableScale>

          <PressableScale haptic="send" scale={0.86} onPress={() => run(input)} disabled={busy || !input.trim()}>
            <View
              style={[
                styles.runBtn,
                { backgroundColor: input.trim() && !busy ? colors.accent : colors.surface3, opacity: busy ? 0.6 : 1 },
              ]}
            >
              <Ionicons name="play" size={15} color={input.trim() && !busy ? colors.onAccent : colors.textFaint} />
            </View>
          </PressableScale>
        </View>
      </Animated.View>
    </View>
  );
}

const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, SFMono-Regular, Menlo, monospace',
});

export { setShellCwd };

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 160 },
  jump: { position: 'absolute', right: 12, bottom: 12, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.8),
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing(3),
    paddingTop: spacing(2),
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  histBtn: { width: 30, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(2.5),
    minHeight: 38,
  },
  runBtn: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
