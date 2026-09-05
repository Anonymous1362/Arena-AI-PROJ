import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { Button, Card } from '@/src/components/ui';
import { CopperExec, type CopperRuntimeSession, type CopperRuntimeStatus } from '@/modules/copper-exec';
import { haptics } from '@/src/utils/haptics';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const MAX_SCROLLBACK_CHARS = 256 * 1024;

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit < 2 ? 0 : 1)} ${units[unit]}`;
}

function appendTerminalData(previous: string, data: string) {
  const combined = previous + data;
  if (combined.length <= MAX_SCROLLBACK_CHARS) return combined;
  return `…[Copper clipped older scrollback at ${formatBytes(MAX_SCROLLBACK_CHARS)}]…\n${combined.slice(-MAX_SCROLLBACK_CHARS)}`;
}

function storageLine(label: string, bytes: number): [string, number] {
  return [label, bytes];
}

function runtimeCopy(status: CopperRuntimeStatus | null) {
  if (!status) {
    return {
      title: 'Checking Copper Runtime',
      body: 'Reading the native runtime status from this Copper Android build…',
      icon: 'hourglass-outline' as const,
    };
  }
  switch (status.state) {
    case 'ready':
      return {
        title: 'Copper Runtime is ready',
        body: `Real Copper Bash, apt, and pkg sessions can run from ${status.runtimePrefix}. Your projects stay on shared storage.`,
        icon: 'checkmark-circle-outline' as const,
      };
    case 'not_installed':
      return {
        title: 'Copper Runtime is ready to install',
        body: 'This APK contains a verified arm64 Copper bootstrap. Installation puts executable packages in protected app storage, never on the SD card.',
        icon: 'download-outline' as const,
      };
    case 'repair_required':
      return {
        title: 'Copper Runtime needs repair',
        body: 'The installed prefix is incomplete or damaged. Repair replaces the executable runtime while keeping your shell home directory.',
        icon: 'construct-outline' as const,
      };
    case 'package_mismatch':
      return {
        title: 'Wrong Android package identity',
        body: `This build is ${status.packageName}; the verified runtime requires ${status.expectedPackageName}. Copper refuses an unsafe prefix mismatch.`,
        icon: 'alert-circle-outline' as const,
      };
    case 'bundle_missing':
    default:
      return {
        title: 'Runtime bundle not in this APK yet',
        body: 'A verified arm64 Copper Runtime has been built in CI, but this installed APK does not carry that bootstrap asset. Copper will not pretend Android’s tiny system shell is a package terminal.',
        icon: 'cube-outline' as const,
      };
  }
}

export default function TerminalScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const terminalScrollRef = useRef<ScrollView>(null);
  const cwdRef = useRef('');
  const sessionIdRef = useRef<string | null>(null);

  const [hasAllFiles, setHasAllFiles] = useState(false);
  const [cwd, setCwd] = useState('');
  const [runtime, setRuntime] = useState<CopperRuntimeStatus | null>(null);
  const [session, setSession] = useState<CopperRuntimeSession | null>(null);
  const [command, setCommand] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('');
  const [busyAction, setBusyAction] = useState<'install' | 'repair' | 'start' | 'close' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    cwdRef.current = cwd;
  }, [cwd]);

  useEffect(() => {
    sessionIdRef.current = session?.id ?? null;
  }, [session]);

  const refreshStatus = useCallback(async () => {
    if (Platform.OS !== 'android' || !CopperExec.isAvailable()) return;
    try {
      const [granted, runtimeStatus, startDirectory] = await Promise.all([
        CopperExec.hasAllFilesAccess(),
        CopperExec.getRuntimeStatus(),
        cwdRef.current ? Promise.resolve(null) : CopperExec.getTerminalStartDirectory(),
      ]);
      setHasAllFiles(granted);
      setRuntime(runtimeStatus);
      if (startDirectory) setCwd(startDirectory);
    } catch (error) {
      setNotice((error as Error).message || 'Copper could not read its terminal status.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
    }, [refreshStatus])
  );

  useEffect(() => {
    const outputSubscription = CopperExec.addRuntimeOutputListener(({ sessionId, data }) => {
      if (sessionId !== sessionIdRef.current) return;
      setTerminalOutput((previous) => appendTerminalData(previous, data));
    });
    const exitSubscription = CopperExec.addRuntimeExitListener(({ sessionId, exit, closedByUser }) => {
      if (sessionId !== sessionIdRef.current) return;
      setSession(null);
      setNotice(closedByUser ? 'Copper terminal session closed.' : `Copper terminal exited with code ${exit}.`);
    });
    const errorSubscription = CopperExec.addRuntimeErrorListener(({ sessionId, message }) => {
      if (sessionId !== sessionIdRef.current) return;
      setNotice(message);
    });
    return () => {
      outputSubscription?.remove();
      exitSubscription?.remove();
      errorSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (!terminalOutput) return;
    const frame = requestAnimationFrame(() => terminalScrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [terminalOutput]);

  const requestAllFiles = async () => {
    try {
      const granted = await CopperExec.requestAllFilesAccess();
      setHasAllFiles(granted);
      setNotice(
        granted
          ? 'Shared-storage access is enabled ✅ Your manual Copper session can use device storage and mounted SD cards under /storage/.'
          : 'Android Settings opened. Turn on “Allow access to manage all files”, then come back here.'
      );
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const installRuntime = async (repair = false) => {
    if (!runtime?.bundleAvailable || busyAction) return;
    setBusyAction(repair ? 'repair' : 'install');
    setNotice(null);
    try {
      const next = repair
        ? await CopperExec.repairCopperRuntime()
        : await CopperExec.installCopperRuntime(false);
      setRuntime(next);
      setNotice(next.ready ? 'Copper Runtime installed and verified ✅ Open a terminal session whenever you are ready.' : 'Copper Runtime installation finished, but it still needs attention.');
      if (next.ready) haptics.success();
    } catch (error) {
      setNotice((error as Error).message);
      haptics.error();
      await refreshStatus();
    } finally {
      setBusyAction(null);
    }
  };

  const startSession = async () => {
    if (busyAction || session) return;
    if (!runtime?.ready) {
      setNotice('Install or repair the verified Copper Runtime before opening a package terminal.');
      return;
    }
    if (!hasAllFiles) {
      setNotice('First enable Android’s All files access for the manual terminal. AI workspace access stays separate.');
      return;
    }
    setBusyAction('start');
    setNotice(null);
    try {
      const next = await CopperExec.startRuntimeSession(cwd || null, 28, 100);
      setSession(next);
      setTerminalOutput((previous) => previous || 'Copper Runtime — interactive Bash session\n');
      setNotice('Live Copper Bash session started ✨');
      haptics.success();
    } catch (error) {
      setNotice((error as Error).message);
      haptics.error();
      await refreshStatus();
    } finally {
      setBusyAction(null);
    }
  };

  const sendCommand = async () => {
    const input = command;
    if (!input || !session || busyAction) return;
    try {
      // This is deliberately a persistent PTY write—not a one-off Android
      // system-shell command. Bash owns cwd, variables, jobs, and package
      // state for the life of the Copper session.
      await CopperExec.writeRuntimeSession(session.id, `${input}\n`);
      setCommand('');
      haptics.selection();
    } catch (error) {
      setNotice((error as Error).message);
      haptics.error();
    }
  };

  const interruptSession = async () => {
    if (!session) return;
    try {
      await CopperExec.writeRuntimeSession(session.id, '\u0003');
      haptics.selection();
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const closeSession = async () => {
    if (!session || busyAction) return;
    setBusyAction('close');
    try {
      await CopperExec.closeRuntimeSession(session.id);
      setSession(null);
      setNotice('Copper terminal session closed.');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  const available = Platform.OS === 'android' && CopperExec.isAvailable();
  const copy = runtimeCopy(runtime);
  const quotaPercent = runtime ? Math.min(100, (runtime.persistentBytes / runtime.quotaBytes) * 100) : 0;
  const runtimeStorageBreakdown: Array<[string, number]> = runtime
    ? [
        storageLine('Runtime & installed packages', runtime.runtimePayloadBytes),
        storageLine('APT download cache', runtime.aptArchiveBytes),
        storageLine('APT package indexes', runtime.aptListsBytes),
        storageLine('Runtime temporary files', runtime.runtimeTemporaryBytes),
        storageLine('Shell home & settings', runtime.shellHomeBytes),
        storageLine('Installer / repair state', runtime.installerMetadataBytes + runtime.repairStagingBytes),
      ].filter(([, bytes]) => bytes > 0)
    : [];
  const canInstall = Boolean(runtime?.bundleAvailable && runtime.state === 'not_installed');
  const canRepair = Boolean(runtime?.bundleAvailable && runtime.state === 'repair_required');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + spacing(2), paddingHorizontal: spacing(4), paddingBottom: spacing(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
          <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.termBg }}>
            <Ionicons name="terminal" size={19} color={colors.termText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>Terminal</Text>
            <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>
              Real Copper runtime · manual shared-storage access
            </Text>
          </View>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: runtime?.ready && hasAllFiles ? colors.success : colors.warning }} />
        </View>
      </View>

      {!available ? (
        <View style={{ paddingHorizontal: spacing(4) }}>
          <Card>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Copper Android build required</Text>
            <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19, marginTop: spacing(2) }}>
              The package terminal uses Copper’s native PTY and private Linux runtime. Expo Go and the web/PWA cannot provide it.
            </Text>
          </Card>
        </View>
      ) : (
        <ScrollView
          ref={terminalScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing(4), paddingTop: spacing(1), paddingBottom: spacing(3) }}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={{ marginBottom: spacing(3) }}>
            <View style={{ flexDirection: 'row', gap: spacing(2), alignItems: 'flex-start' }}>
              <Ionicons name={copy.icon} size={20} color={runtime?.ready ? colors.success : colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{copy.title}</Text>
                <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19, marginTop: spacing(1) }}>{copy.body}</Text>
              </View>
            </View>

            {runtime ? (
              <View style={{ marginTop: spacing(3) }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: colors.textFaint, fontSize: 11.5 }}>Private runtime storage</Text>
                  <Text style={{ color: colors.textFaint, fontSize: 11.5 }}>{formatBytes(runtime.persistentBytes)} / {formatBytes(runtime.quotaBytes)}</Text>
                </View>
                <View style={[styles.meter, { backgroundColor: colors.surface3 }]}>
                  <View style={[styles.meterFill, { width: `${quotaPercent}%`, backgroundColor: quotaPercent >= 90 ? colors.danger : colors.accent }]} />
                </View>
                {runtimeStorageBreakdown.length > 0 ? (
                  <View style={{ marginTop: spacing(2), gap: 3 }}>
                    {runtimeStorageBreakdown.map(([label, bytes]) => (
                      <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing(2) }}>
                        <Text style={{ color: colors.textFaint, fontSize: 11.5, flex: 1 }}>{label}</Text>
                        <Text style={{ color: colors.textFaint, fontSize: 11.5 }}>{formatBytes(bytes)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {canInstall ? <View style={{ marginTop: spacing(3) }}><Button label="Install verified runtime" icon="download-outline" loading={busyAction === 'install'} onPress={() => installRuntime(false)} /></View> : null}
            {canRepair ? <View style={{ marginTop: spacing(3) }}><Button label="Repair verified runtime" icon="construct-outline" loading={busyAction === 'repair'} onPress={() => installRuntime(true)} /></View> : null}
          </Card>

          {runtime?.ready && !hasAllFiles ? (
            <Card style={{ marginBottom: spacing(3) }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>One permission for your manual terminal</Text>
              <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19, marginTop: spacing(2), marginBottom: spacing(3) }}>
                This lets commands you type use device storage and a mounted SD card under /storage/. It does not give the AI unrestricted terminal access or access to protected Android /data paths.
              </Text>
              <Button label="Open Android storage permission" icon="shield-outline" onPress={requestAllFiles} />
            </Card>
          ) : null}

          {notice ? <Text style={{ color: colors.textSub, fontSize: 12.5, lineHeight: 18, marginBottom: spacing(3) }}>{notice}</Text> : null}

          {session ? (
            <View style={[styles.terminal, { backgroundColor: colors.termBg, borderColor: colors.border }]}>
              <View style={styles.terminalHeader}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} selectable style={[styles.terminalPath, { color: '#B8B3A8', fontFamily: mono }]}>{session.cwd}</Text>
                  <Text style={{ color: colors.success, fontSize: 10.5, marginTop: 2 }}>LIVE BASH · PID {session.pid}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing(1) }}>
                  <Button label="Ctrl C" variant="ghost" disabled={busyAction !== null} onPress={interruptSession} />
                  <Button label="End" variant="danger" loading={busyAction === 'close'} onPress={closeSession} />
                </View>
              </View>
              <Text selectable style={[styles.terminalOutput, { color: colors.termText, fontFamily: mono }]}>
                {terminalOutput || 'Waiting for Copper Bash…'}
              </Text>
            </View>
          ) : runtime?.ready ? (
            <Card>
              <Ionicons name="code-slash-outline" size={27} color={colors.textFaint} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginTop: spacing(2) }}>Ready when you are ✨</Text>
              <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19, marginTop: spacing(1), marginBottom: spacing(3) }}>
                Open a persistent Copper Bash session. Commands retain their cwd, environment, package state, and interactive PTY—not Android’s one-shot system shell.
              </Text>
              <Button label="Open Copper Bash" icon="terminal-outline" loading={busyAction === 'start'} disabled={!hasAllFiles} onPress={startSession} />
            </Card>
          ) : null}
        </ScrollView>
      )}

      {available && session ? (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing(3), paddingTop: spacing(2), paddingBottom: insets.bottom + spacing(2) }}>
          <Text numberOfLines={1} selectable style={{ color: colors.textFaint, fontSize: 11.5, marginBottom: spacing(1.5), fontFamily: mono }}>
            {session.cwd}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2) }}>
            <View style={{ flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.termBg, paddingHorizontal: spacing(3), justifyContent: 'center' }}>
              <TextInput
                value={command}
                onChangeText={setCommand}
                onSubmitEditing={sendCommand}
                editable={!busyAction}
                placeholder="Send input to Copper Bash…"
                placeholderTextColor="#817D73"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                style={{ color: colors.termText, fontFamily: mono, fontSize: 13.5, paddingVertical: 10 }}
              />
            </View>
            <Button label="Send" icon="arrow-up" disabled={!command || busyAction !== null} onPress={sendCommand} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { height: 6, borderRadius: 3, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3 },
  terminal: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  terminalHeader: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.10)' },
  terminalPath: { fontSize: 10.5 },
  terminalOutput: { fontSize: 12.25, lineHeight: 18, padding: 12, minHeight: 150 },
});
