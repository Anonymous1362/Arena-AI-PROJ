import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing, SECTION_TINTS } from '@/src/theme';
import { SettingsScaffold, TintSection } from '@/src/components/SettingsScaffold';
import { TextField } from '@/src/components/ui';
import { PressableScale } from '@/src/components/PressableScale';
import { Button, Stepper, SwitchRow } from '@/src/components/ui';
import { useSettingsStore } from '@/src/store/settings';
import { SHELL_BUILTINS, executorStatus, shellCwd } from '@/src/agent/tools';
import {
  currentRoot,
  listStorageVolumes,
  managedAccessGranted,
  openAllFilesSettings,
  requestStorageAccess,
  revokeStorageAccess,
  setGrantedTree,
  verifyManagedAccess,
  type StorageVolume,
} from '@/src/agent/fs';
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

  /* ------------------------------ root choosing ----------------------------- */

  const mode: 'sandbox' | 'saf' | 'managed' =
    root.tier === 'managed' ? 'managed' : root.tier === 'granted' ? 'saf' : 'sandbox';
  const modeLabel =
    mode === 'managed' ? `all files · ${root.uri.replace('file://', '')}` : mode === 'saf' ? 'granted folder' : 'app sandbox';

  const [baseDraft, setBaseDraft] = useState(agentScope.managedBase ?? '');
  const [volumes, setVolumes] = useState<StorageVolume[]>([]);

  const choose = (next: 'sandbox' | 'saf' | 'managed') => {
    haptic('select');
    if (next === 'sandbox') {
      patchAgent({ storageEnabled: false, managedBase: '' });
      setGrantedTree(null);
      setNote('Root reset to the private app sandbox.');
    } else if (next === 'saf') {
      patchAgent({ managedBase: '' });
      if (!agentScope.safTreeUri) void grant();
      else setNote(`Using granted folder “${agentScope.safRootLabel ?? ''}”.`);
    } else {
      patchAgent({ storageEnabled: false, managedBase: baseDraft || '/storage/emulated/0' });
      setNote('Open “All files access” for Copper, toggle it on, then tap Verify.');
      void openAllFilesSettings();
    }
    force((n) => n + 1);
  };

  const applyBase = () => {
    const clean = baseDraft.trim().replace(/\/+$/, '');
    if (!clean.startsWith('/')) {
      setNote('Paths must be absolute, e.g. /storage/emulated/0/Download');
      return;
    }
    patchAgent({ storageEnabled: false, managedBase: clean });
    setBaseDraft(clean);
    haptic('success');
    setNote(`Root set to ${clean} — verifying…`);
    void verifyManagedAccess(clean).then((ok) => {
      setNote(ok ? `All-files access confirmed. Root is ${clean}.` : `Path saved, but Android has not granted All-files access yet.`);
      force((n) => n + 1);
    });
  };

  const verify = async () => {
    setBusy(true);
    const ok = await verifyManagedAccess(agentScope.managedBase || baseDraft || undefined);
    if (ok) {
      const vols = await listStorageVolumes();
      setVolumes(vols);
      setNote(`All-files access confirmed${vols.length ? ` — ${vols.length} volume(s) visible.` : '.'}`);
      haptic('success');
    } else {
      setNote('Not granted yet. In the page that opens, enable “All files access” for Copper, then verify again.');
      haptic('warning');
    }
    setBusy(false);
    force((n) => n + 1);
  };

  const openSettingsAndVerify = async () => {
    await openAllFilesSettings();
    setNote('Toggle “All files access” on for Copper, come back and tap Verify.');
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

      <TintSection title="Storage root" tint={SECTION_TINTS.context} icon="folder-open-outline" note={modeLabel}>
        <Text style={{ color: colors.textSub, fontSize: 12.5, lineHeight: 18, marginBottom: spacing(3) }}>
          The agent and the Terminal tab share exactly one jailed root: nothing reads or writes outside it. Pick how
          wide that jail is — from the private sandbox up to Termux-style whole-device access.
        </Text>

        <RootOption
          active={mode === 'sandbox'}
          icon="shield-checkmark-outline"
          title="App sandbox"
          sub="Private to Copper. Always available, no permissions, survives reinstalls of nothing."
          onPress={() => choose('sandbox')}
        />
        <RootOption
          active={mode === 'saf'}
          icon="folder-open-outline"
          title="Picked folder (SAF)"
          sub={agentScope.safRootLabel ? `Granted: ${agentScope.safRootLabel}` : 'Android folder picker — one folder tree, e.g. your SD-card projects folder.'}
          onPress={() => choose('saf')}
        />
        <RootOption
          active={mode === 'managed'}
          icon="key-outline"
          title="All files access (a path)"
          sub="Needs Android's “All files access”. Reaches internal storage and removable SD cards by real path."
          onPress={() => choose('managed')}
        />

        {note ? (
          <View style={[styles.note, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 11.5, flex: 1, lineHeight: 17 }}>{note}</Text>
          </View>
        ) : null}

        {mode === 'saf' ? (
          <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) }}>
            {root.tier === 'granted' ? (
              <Button label="Revoke access" variant="danger" style={{ flex: 1 }} onPress={revoke} />
            ) : (
              <Button label={busy ? 'Requesting…' : 'Grant a folder'} icon="folder-outline" style={{ flex: 1 }} loading={busy} onPress={grant} />
            )}
          </View>
        ) : null}

        {mode === 'managed' ? (
          <View style={{ gap: spacing(3), marginTop: spacing(3) }}>
            <TextField
              label="Root path (the jail)"
              value={baseDraft}
              onChangeText={setBaseDraft}
              placeholder="/storage/0123-4567/Download/COPPER Projects"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {volumes.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                {volumes.map((v) => (
                  <PressableScale key={v.path} haptic="select" scale={0.94} onPress={() => setBaseDraft(v.path)}>
                    <View style={[styles.volChip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                      <Ionicons name={v.label.startsWith('SD') ? 'save-outline' : 'phone-portrait-outline'} size={11} color={colors.textSub} />
                      <Text numberOfLines={1} style={{ color: colors.textSub, fontSize: 11, fontWeight: '700' }}>{v.label}</Text>
                    </View>
                  </PressableScale>
                ))}
              </ScrollView>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing(2) }}>
              <Button label="Apply path" icon="checkmark" style={{ flex: 1 }} onPress={applyBase} />
              <Button label="Open All-files settings" variant="ghost" style={{ flex: 1 }} onPress={openSettingsAndVerify} />
            </View>
            <Button label={busy ? 'Checking…' : 'Verify access'} variant="ghost" onPress={verify} loading={busy} />
            <Text style={{ color: colors.textFaint, fontSize: 11.5, lineHeight: 16 }}>
              Tip: point it at your COPPER Projects folder and the agent can only ever touch that folder. Point it at
              /storage and the Terminal becomes Termux-like over the whole device — your call, your risk.
            </Text>
          </View>
        ) : null}

        {Platform.OS !== 'android' ? (
          <Text style={{ color: colors.textFaint, fontSize: 11.5, marginTop: spacing(2), lineHeight: 16 }}>
            Folder grants and All-files access are Android features. On iOS and web the agent works inside the app sandbox.
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
  volChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});

/* -------------------------------- root option ------------------------------- */

function RootOption({
  active,
  icon,
  title,
  sub,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale haptic="select" scale={0.985} onPress={onPress} style={{ marginBottom: spacing(2) }}>
      <View
        style={{
          flexDirection: 'row',
          gap: spacing(3),
          alignItems: 'flex-start',
          borderRadius: radius.md,
          borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accentSoft : colors.surface,
          padding: spacing(3),
        }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? colors.accent : colors.surface2,
          }}
        >
          <Ionicons name={icon} size={15} color={active ? colors.onAccent : colors.textSub} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{title}</Text>
            {active ? <Ionicons name="checkmark-circle" size={15} color={colors.accent} /> : null}
          </View>
          <Text style={{ color: colors.textSub, fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>{sub}</Text>
        </View>
      </View>
    </PressableScale>
  );
}
