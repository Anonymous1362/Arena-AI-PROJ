import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { Button, Card } from '@/src/components/ui';
import { CopperExec, type CopperRuntimeInstallProgress, type CopperRuntimeSession, type CopperRuntimeSessionExit, type CopperRuntimeStatus } from '@/modules/copper-exec';
import { haptics } from '@/src/utils/haptics';
import { useKeyboardVisible } from '@/src/hooks/useKeyboardVisible';

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

function sessionExitNotice(detail: CopperRuntimeSessionExit) {
  if (detail.closedByUser) return 'Copper terminal session closed.';
  // PTY output may include ANSI color/cursor controls. Preserve the useful
  // final diagnostic without injecting terminal control bytes into a notice.
  const output = (detail.outputTail ?? '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(-900);
  return output
    ? `Copper Bash exited with code ${detail.exit}. ${output}`
    : `Copper Bash exited with code ${detail.exit} before it could receive input. Open a new session to try again.`;
}

function installStageTitle(stage: CopperRuntimeInstallProgress['stage']) {
  switch (stage) {
    case 'checking': return 'Preparing installation';
    case 'verifying': return 'Verifying runtime';
    case 'extracting': return 'Installing runtime';
    case 'validating': return 'Checking installation';
    case 'complete': return 'Installation complete';
    case 'failed': return 'Installation needs attention';
  }
}

function StorageMeter({ percent, color, trackColor }: { percent: number; color: string; trackColor: string }) {
  const target = Math.max(0, Math.min(100, percent));
  const displayed = useSharedValue(target);
  useEffect(() => {
    displayed.value = withTiming(target, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [displayed, target]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${displayed.value}%` }));
  return (
    <View style={[styles.meter, { backgroundColor: trackColor }]}>
      <Animated.View style={[styles.meterFill, fillStyle, { backgroundColor: color }]} />
    </View>
  );
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
        title: status.candidateOnly ? 'Copper Runtime device candidate is ready' : 'Copper Runtime is ready',
        body: status.candidateOnly
          ? `This personal test APK contains the real verified arm64 Copper runtime at ${status.runtimePrefix}. Test Bash and PTY behavior on this phone; it is not a released runtime APK or package-update validation.`
          : `Real Copper Bash, apt, and pkg sessions can run from ${status.runtimePrefix}. Your projects stay on shared storage.`,
        icon: 'checkmark-circle-outline' as const,
      };
    case 'not_installed':
      return {
        title: status.candidateOnly ? 'Real Copper Runtime candidate is ready to install' : 'Copper Runtime is ready to install',
        body: status.candidateOnly
          ? 'This personal test APK contains the real verified arm64 Copper bootstrap for phone validation. It is not a released runtime APK.'
          : 'This APK contains a verified arm64 Copper bootstrap. Installation puts executable packages in protected app storage, never on the SD card.',
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
  // The tab bar is absolute, so its actual Android height does not occupy
  // layout space. Reserve its 56pt control row plus the gesture/navigation
  // inset explicitly; this keeps the terminal composer tappable above it.
  const tabBarHeight = Math.max(56, 56 + insets.bottom);
  const keyboardVisible = useKeyboardVisible();
  const terminalScrollRef = useRef<ScrollView>(null);
  const cwdRef = useRef('');
  const sessionIdRef = useRef<string | null>(null);
  // Native PTY output can arrive between the native start resolving and React
  // committing setSession(). Retain that short window rather than discarding
  // an immediate bash/linker failure and leaving a stale-looking terminal.
  const pendingOutputRef = useRef(new Map<string, string>());
  const pendingExitRef = useRef(new Map<string, CopperRuntimeSessionExit>());
  const appStateRef = useRef(AppState.currentState);
  const awaitingPermissionReturnRef = useRef(false);

  const [hasAllFiles, setHasAllFiles] = useState(false);
  const [cwd, setCwd] = useState('');
  const [runtime, setRuntime] = useState<CopperRuntimeStatus | null>(null);
  const [session, setSession] = useState<CopperRuntimeSession | null>(null);
  const [command, setCommand] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('');
  const [busyAction, setBusyAction] = useState<'install' | 'repair' | 'start' | 'close' | null>(null);
  const [installProgress, setInstallProgress] = useState<CopperRuntimeInstallProgress | null>(null);
  const [awaitingPermissionReturn, setAwaitingPermissionReturn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingCommand, setSendingCommand] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const commandInputRef = useRef<TextInput>(null);

  useEffect(() => {
    cwdRef.current = cwd;
  }, [cwd]);

  useEffect(() => {
    sessionIdRef.current = session?.id ?? null;
  }, [session]);

  const closeTerminalFromExit = useCallback((detail: CopperRuntimeSessionExit) => {
    sessionIdRef.current = null;
    setSession(null);
    setSendingCommand(false);
    setCommandError(null);
    setNotice(sessionExitNotice(detail));
  }, []);

  const refreshStatus = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !CopperExec.isAvailable()) return false;
    try {
      const [granted, runtimeStatus, startDirectory] = await Promise.all([
        CopperExec.hasAllFilesAccess(),
        CopperExec.getRuntimeStatus(),
        cwdRef.current ? Promise.resolve(null) : CopperExec.getTerminalStartDirectory(),
      ]);
      setHasAllFiles(granted);
      setRuntime(runtimeStatus);
      if (startDirectory) setCwd(startDirectory);
      return granted;
    } catch (error) {
      setNotice((error as Error).message || 'Copper could not read its terminal status.');
      return false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
    }, [refreshStatus])
  );

  // Android's special All files page opens over Copper without necessarily
  // changing the route focus. Refresh when the app becomes active again so a
  // successful permission grant never requires a second button tap.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returnedToCopper = appStateRef.current !== 'active' && nextState === 'active';
      appStateRef.current = nextState;
      if (!returnedToCopper || !awaitingPermissionReturnRef.current) return;
      awaitingPermissionReturnRef.current = false;
      setAwaitingPermissionReturn(false);
      void refreshStatus().then((granted) => {
        setNotice(
          granted
            ? 'Shared-storage access is enabled ✅ You can open Copper Bash now.'
            : 'Android storage access was not enabled. You can try again whenever you are ready.'
        );
      });
    });
    return () => subscription.remove();
  }, [refreshStatus]);

  useEffect(() => {
    const outputSubscription = CopperExec.addRuntimeOutputListener(({ sessionId, data }) => {
      const activeSessionId = sessionIdRef.current;
      if (!activeSessionId) {
        pendingOutputRef.current.set(
          sessionId,
          appendTerminalData(pendingOutputRef.current.get(sessionId) ?? '', data)
        );
        return;
      }
      if (sessionId !== activeSessionId) return;
      setTerminalOutput((previous) => appendTerminalData(previous, data));
    });
    const exitSubscription = CopperExec.addRuntimeExitListener((detail) => {
      const activeSessionId = sessionIdRef.current;
      if (!activeSessionId) {
        pendingExitRef.current.set(detail.sessionId, detail);
        return;
      }
      if (detail.sessionId !== activeSessionId) return;
      closeTerminalFromExit(detail);
    });
    const errorSubscription = CopperExec.addRuntimeErrorListener(({ sessionId, message }) => {
      if (sessionId !== sessionIdRef.current) return;
      setNotice(message);
    });
    const installSubscription = CopperExec.addRuntimeInstallProgressListener((progress) => {
      setInstallProgress(progress);
      setRuntime((previous) => previous ? {
        ...previous,
        persistentBytes: progress.persistentBytes,
        quotaBytes: progress.quotaBytes,
        remainingBytes: Math.max(0, progress.quotaBytes - progress.persistentBytes),
      } : previous);
    });
    return () => {
      outputSubscription?.remove();
      exitSubscription?.remove();
      errorSubscription?.remove();
      installSubscription?.remove();
    };
  }, [closeTerminalFromExit]);

  useEffect(() => {
    if (!terminalOutput) return;
    const frame = requestAnimationFrame(() => terminalScrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [terminalOutput]);

  const requestAllFiles = async () => {
    if (awaitingPermissionReturn) return;
    awaitingPermissionReturnRef.current = true;
    setAwaitingPermissionReturn(true);
    setNotice('Opening Android storage settings… Copper will refresh automatically when you return.');
    try {
      const granted = await CopperExec.requestAllFilesAccess();
      setHasAllFiles(granted);
      if (granted) {
        awaitingPermissionReturnRef.current = false;
        setAwaitingPermissionReturn(false);
        setNotice('Shared-storage access is enabled ✅ You can open Copper Bash now.');
      }
    } catch (error) {
      awaitingPermissionReturnRef.current = false;
      setAwaitingPermissionReturn(false);
      setNotice((error as Error).message || 'Copper could not open Android storage settings.');
      haptics.error();
    }
  };

  const installRuntime = async (repair = false) => {
    if (!runtime?.bundleAvailable || busyAction) return;
    setBusyAction(repair ? 'repair' : 'install');
    setInstallProgress({
      stage: 'checking',
      message: repair ? 'Preparing Copper Runtime repair…' : 'Preparing Copper Runtime installation…',
      persistentBytes: runtime.persistentBytes,
      quotaBytes: runtime.quotaBytes,
    });
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
    setCommandError(null);
    pendingOutputRef.current.clear();
    pendingExitRef.current.clear();
    try {
      const next = await CopperExec.startRuntimeSession(cwd || null, 28, 100);
      // Set the id synchronously. Waiting for React's state effect here left a
      // small race in which an immediately exited shell event was discarded.
      sessionIdRef.current = next.id;
      const earlyOutput = pendingOutputRef.current.get(next.id);
      pendingOutputRef.current.delete(next.id);
      let earlyExit = pendingExitRef.current.get(next.id) ?? null;
      pendingExitRef.current.delete(next.id);
      if (!earlyExit) {
        try {
          earlyExit = await CopperExec.getRuntimeSessionExitDetail(next.id);
        } catch {
          // The session can still be alive; the runtimeExit listener remains
          // authoritative if a diagnostic lookup is temporarily unavailable.
        }
      }
      if (earlyExit) {
        closeTerminalFromExit(earlyExit);
        return;
      }
      setSession(next);
      setTerminalOutput((previous) => {
        const initial = previous || 'Copper Runtime — interactive Bash session\n';
        return earlyOutput ? appendTerminalData(initial, earlyOutput) : initial;
      });
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
    if (!input.trim() || !session || busyAction || sendingCommand) return;

    setSendingCommand(true);
    setCommandError(null);
    try {
      // This is deliberately a persistent PTY write—not a one-off Android
      // system-shell command. Bash owns cwd, variables, jobs, and package
      // state for the life of the Copper session.
      const written = await CopperExec.writeRuntimeSession(session.id, `${input}\n`);
      if (written <= 0) throw new Error('Copper Bash did not accept the input.');
      setCommand('');
      haptics.selection();
      requestAnimationFrame(() => {
        commandInputRef.current?.focus();
        terminalScrollRef.current?.scrollToEnd({ animated: true });
      });
    } catch (error) {
      // If the native session ended between rendering this composer and the
      // tap, replace the raw bridge exception with the actual process exit
      // code/output tail and remove the stale composer immediately.
      try {
        const exited = await CopperExec.getRuntimeSessionExitDetail(session.id);
        if (exited) {
          closeTerminalFromExit(exited);
          return;
        }
      } catch {
        // Preserve the original bridge error if diagnostics are unavailable.
      }
      const message = (error as Error).message || 'Copper could not send that input.';
      // Keep failure feedback beside the control the person just tapped. The
      // older general notice sits above terminal output and was easy to miss.
      setCommandError(message);
      setNotice(message);
      haptics.error();
    } finally {
      setSendingCommand(false);
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
  const showingLiveInstallProgress = busyAction === 'install' || busyAction === 'repair';
  const runtimeStorageBreakdown: Array<[string, number]> = runtime && !showingLiveInstallProgress
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior="padding"
    >
      <View style={{ flex: 1 }}>
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
          contentContainerStyle={{ paddingHorizontal: spacing(4), paddingTop: spacing(1), paddingBottom: tabBarHeight + spacing(3) }}
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
                <StorageMeter
                  percent={quotaPercent}
                  color={quotaPercent >= 90 ? colors.danger : colors.accent}
                  trackColor={colors.surface3}
                />
                {installProgress ? (
                  <View style={[styles.installStatus, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '800' }}>{installStageTitle(installProgress.stage)}</Text>
                      <Text style={{ color: colors.textSub, fontSize: 12, lineHeight: 17, marginTop: 2 }}>{installProgress.message}</Text>
                    </View>
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                      {formatBytes(installProgress.persistentBytes)}
                    </Text>
                  </View>
                ) : null}
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

            {canInstall ? <View style={{ marginTop: spacing(3) }}><Button label={busyAction === 'install' ? 'Installing Copper Runtime…' : 'Install verified runtime'} icon="download-outline" loading={busyAction === 'install'} onPress={() => installRuntime(false)} /></View> : null}
            {canRepair ? <View style={{ marginTop: spacing(3) }}><Button label={busyAction === 'repair' ? 'Repairing Copper Runtime…' : 'Repair verified runtime'} icon="construct-outline" loading={busyAction === 'repair'} onPress={() => installRuntime(true)} /></View> : null}
          </Card>

          {runtime?.ready && !hasAllFiles ? (
            <Card style={{ marginBottom: spacing(3) }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>One permission for your manual terminal</Text>
              <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19, marginTop: spacing(2), marginBottom: spacing(3) }}>
                This lets commands you type use device storage and a mounted SD card under /storage/. It does not give the AI unrestricted terminal access or access to protected Android /data paths.
              </Text>
              <Button
                label={awaitingPermissionReturn ? 'Checking Android permission…' : 'Open Android storage permission'}
                icon="shield-outline"
                loading={awaitingPermissionReturn}
                disabled={awaitingPermissionReturn}
                onPress={requestAllFiles}
              />
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
        <View style={{
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing(3),
          paddingTop: spacing(2),
          // The tab bar is hidden while the keyboard is up. Keeping its full
          // reservation made the composer float over the terminal output.
          paddingBottom: keyboardVisible ? Math.max(spacing(2), insets.bottom + 4) : tabBarHeight + spacing(2),
        }}>
          <Text numberOfLines={1} selectable style={{ color: colors.textFaint, fontSize: 11.5, marginBottom: spacing(1.5), fontFamily: mono }}>
            {session.cwd}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2) }}>
            <View style={{ flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.termBg, paddingHorizontal: spacing(3), justifyContent: 'center' }}>
              <TextInput
                ref={commandInputRef}
                value={command}
                onChangeText={(next) => {
                  setCommand(next);
                  if (commandError) setCommandError(null);
                }}
                onSubmitEditing={() => void sendCommand()}
                editable={!busyAction && !sendingCommand}
                placeholder="Send input to Copper Bash…"
                placeholderTextColor="#817D73"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                style={{ color: colors.termText, fontFamily: mono, fontSize: 13.5, paddingVertical: 10 }}
              />
            </View>
            <Button
              label={sendingCommand ? 'Sending…' : 'Send'}
              icon="arrow-up"
              loading={sendingCommand}
              disabled={!command.trim() || busyAction !== null || sendingCommand}
              onPress={() => void sendCommand()}
            />
          </View>
          {commandError ? <Text style={{ color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: spacing(1.5) }}>Could not send: {commandError}</Text> : null}
        </View>
      ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  meter: { height: 6, borderRadius: 3, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3 },
  installStatus: { marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  terminal: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  terminalHeader: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.10)' },
  terminalPath: { fontSize: 10.5 },
  terminalOutput: { fontSize: 12.25, lineHeight: 18, padding: 12, minHeight: 150 },
});
