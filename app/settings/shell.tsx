import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing, SECTION_TINTS } from '@/src/theme';
import { SettingsScaffold, TintSection } from '@/src/components/SettingsScaffold';
import { Button, Stepper, SwitchRow } from '@/src/components/ui';
import { useSettingsStore } from '@/src/store/settings';
import { SHELL_BUILTINS, executorStatus, shellCwd } from '@/src/agent/tools';
import { currentRoot, requestStorageAccess, revokeStorageAccess, setGrantedTree } from '@/src/agent/fs';
import { haptic } from '@/src/utils/haptics';

const TINT = SECTION_TINTS.shell;

function StatusLed({ ok, label }: { ok: boolean; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View style={[styles.led, { backgroundColor: ok ? colors.success : colors.warning }]} />
      <Text style={{ color: ok ? colors.success : colors.warning, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

export default function ShellSettingsScreen() {
  const { colors } = useTheme();
  const terminal = useSettingsStore((s) => s.terminal);
  const patchTerminal = useSettingsStore((s) => s.patchTerminal);
  const agentScope = useSettingsStore((s) => s.agentScope);
  const patchAgent = useSettingsStore((s) => s.patchAgentScope);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    setGrantedTree(agentScope.storageEnabled && Platform.OS === 'android' ? agentScope.safTreeUri ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const native = executorStatus() === 'native';
  const root = currentRoot();

  const grant = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await requestStorageAccess();
      haptic('success');
      patchAgent({ storageEnabled: true, safTreeUri: res.treeUri, safRootLabel: res.rootLabel });
      setGrantedTree(res.treeUri ?? null);
      setNote(
        res.tier === 'granted'
          ? `Storage root granted: “${res.rootLabel}”.`
          : 'Fell back to the private app sandbox.'
      );
      force((n) => n + 1);
    } catch (e) {
      haptic('error');
      setNote(`Could not get access: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const revoke = () => {
    revokeStorageAccess();
    patchAgent({ storageEnabled: false, safTreeUri: undefined, safRootLabel: undefined });
    setNote('Storage grant revoked — the agent is back in the private app sandbox.');
    haptic('warning');
    force((n) => n + 1);
  };

  return (
    <SettingsScaffold
      title="Shell & sandbox"
      subtitle="Terminal"
      tint={TINT}
      icon="terminal-outline"
      intro="The Terminal tab and the agent's run_command tool share one executor, one working directory and one jailed storage root."
    >
      <TintSection title="Executor" tint={TINT} icon="hardware-chip-outline">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(2) }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Mode</Text>
          <StatusLed ok={native} label={native ? 'native shell' : 'built-in JS shell'} />
        </View>
        <Text style={{ color: colors.textSub, fontSize: 12.5, lineHeight: 18 }}>
          {native
            ? 'A native executor module is present — commands run through /system/bin/sh in a real Android process.'
            : 'No native executor is present, so commands run in the built-in sandboxed shell: a small POSIX-flavoured interpreter over the app storage root (cd, ls, cat, grep, mkdir, rm, mv, cp, find, pipes, && and ;).'}
        </Text>
        <View style={[styles.note, { backgroundColor: colors.surface2 }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textFaint} />
          <Text style={{ color: colors.textSub, fontSize: 11.5, flex: 1, lineHeight: 17 }}>
            Android 10+ forbids executing downloaded binaries (W^X), so no in-app terminal can give you `apt`, `pip` or
            a compiled toolchain without a second app. What it can do — for free, with nothing else installed — is a real
            shell over your files, plus Python/Node/C/Rust when the executor module is compiled in. See
            docs/TERMINAL-AND-CODING-AGENTS.md for the honest comparison.
          </Text>
        </View>
        <Text style={{ color: colors.textFaint, fontSize: 11.5, marginTop: spacing(2) }}>cwd: /{shellCwd() === '.' ? '' : shellCwd()}</Text>
      </TintSection>

      <TintSection title="Storage root" tint={SECTION_TINTS.context} icon="folder-open-outline">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(2) }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Current root</Text>
          <StatusLed ok={root.tier === 'granted'} label={root.tier === 'granted' ? 'granted folder' : 'app sandbox'} />
        </View>
        <Text style={{ color: colors.textSub, fontSize: 12.5, lineHeight: 18 }}>
          {agentScope.safRootLabel ?? root.uri}
        </Text>
        {note ? <Text style={{ color: colors.accent, fontSize: 12, marginTop: spacing(2), lineHeight: 17 }}>{note}</Text> : null}
        <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) }}>
          {root.tier === 'granted' ? (
            <Button label="Revoke access" variant="danger" style={{ flex: 1 }} onPress={revoke} />
          ) : (
            <Button label={busy ? 'Requesting…' : 'Grant a folder'} icon="folder-outline" style={{ flex: 1 }} loading={busy} onPress={grant} />
          )}
        </View>
        {Platform.OS !== 'android' ? (
          <Text style={{ color: colors.textFaint, fontSize: 11.5, marginTop: spacing(2), lineHeight: 16 }}>
            Folder grants use Android’s Storage Access Framework. On iOS and web the agent works inside the app sandbox.
          </Text>
        ) : null}
      </TintSection>

      <TintSection title="Terminal appearance" tint={SECTION_TINTS.models} icon="color-palette-outline">
        <Stepper
          label="Font size"
          value={terminal.fontSize}
          step={0.5}
          min={9}
          max={20}
          format={(v) => `${v.toFixed(1)}pt`}
          onChange={(v) => patchTerminal({ fontSize: v })}
        />
        <Stepper
          label="Scrollback"
          hint="Lines kept in memory. Lower is faster on long sessions."
          value={terminal.scrollback}
          step={100}
          min={100}
          max={5000}
          format={(v) => `${Math.round(v)} lines`}
          onChange={(v) => patchTerminal({ scrollback: Math.round(v) })}
        />
        <SwitchRow label="Wrap long lines" hint="Off = horizontal scrolling instead." value={terminal.wrap} onChange={(v) => patchTerminal({ wrap: v })} />
        <SwitchRow
          label="Confirm destructive commands"
          hint="Ask before rm -rf, delete_path and similar run from the Terminal tab or the agent."
          value={terminal.confirmDestructive}
          onChange={(v) => patchTerminal({ confirmDestructive: v })}
        />
      </TintSection>

      <TintSection title="Built-in commands" tint={SECTION_TINTS.usage} icon="list-outline" note={`${SHELL_BUILTINS.length}`}>
        <View style={styles.cmdGrid}>
          {SHELL_BUILTINS.map((c) => (
            <View key={c} style={[styles.cmdChip, { backgroundColor: colors.surface2 }]}>
              <Text style={{ color: colors.textSub, fontSize: 11.5, fontWeight: '700', fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace' }}>{c}</Text>
            </View>
          ))}
        </View>
      </TintSection>
    </SettingsScaffold>
  );
}

const styles = StyleSheet.create({
  led: { width: 8, height: 8, borderRadius: 4 },
  note: { flexDirection: 'row', gap: 8, borderRadius: radius.md, padding: spacing(3), marginTop: spacing(3) },
  cmdGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cmdChip: { borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 5 },
});
