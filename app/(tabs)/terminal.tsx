import React, { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { Button, Card } from '@/src/components/ui';
import { CopperExec } from '@/modules/copper-exec';
import { haptics } from '@/src/utils/haptics';

type CommandEntry = {
  id: string;
  command: string;
  cwd: string;
  output: string;
  exit: number;
};

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export default function TerminalScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [hasAllFiles, setHasAllFiles] = useState(false);
  const [cwd, setCwd] = useState('');
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<CommandEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshPermission = useCallback(async () => {
    if (Platform.OS !== 'android' || !CopperExec.isAvailable()) return;
    try {
      const [granted, startDir] = await Promise.all([
        CopperExec.hasAllFilesAccess(),
        cwd ? Promise.resolve(null) : CopperExec.getTerminalStartDirectory(),
      ]);
      setHasAllFiles(granted);
      if (startDir) setCwd(startDir);
    } catch {
      setHasAllFiles(false);
    }
  }, [cwd]);

  useFocusEffect(
    useCallback(() => {
      void refreshPermission();
    }, [refreshPermission])
  );

  const requestAllFiles = async () => {
    try {
      const granted = await CopperExec.requestAllFilesAccess();
      setHasAllFiles(granted);
      setNotice(
        granted
          ? 'All files access is enabled. This terminal can work anywhere under /storage/.'
          : 'Android Settings opened. Enable “Allow access to manage all files”, then return here.'
      );
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const addEntry = (entry: Omit<CommandEntry, 'id'>) => {
    setHistory((items) => [...items, { ...entry, id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }].slice(-80));
  };

  const run = async () => {
    const raw = command.trim();
    if (!raw || busy) return;
    if (Platform.OS !== 'android' || !CopperExec.isAvailable()) {
      setNotice('The manual terminal needs a rebuilt Copper Android APK. It is not available in Expo Go or the web app.');
      return;
    }
    if (!hasAllFiles) {
      setNotice('Enable All files access before running commands outside the selected AI workspace.');
      return;
    }

    setBusy(true);
    setNotice(null);
    setCommand('');
    try {
      // Persist `cd` between commands without relying on a shell process that
      // has already exited. Relative paths are resolved natively and remain
      // within Android shared storage (/storage).
      const cd = raw.match(/^cd(?:\s+(.+))?\s*$/);
      if (cd) {
        const target = (cd[1] ?? '').trim().replace(/^['"]|['"]$/g, '') || '/storage';
        const next = await CopperExec.resolveSharedDirectory(target, cwd || null);
        addEntry({ command: raw, cwd, output: next, exit: 0 });
        setCwd(next);
        haptics.success();
        return;
      }

      const result = await CopperExec.execAllFiles(raw, cwd || null, 60_000);
      addEntry({
        command: raw,
        cwd: result.cwd,
        output: result.stdout || '(no output)',
        exit: result.exit,
      });
      if (result.exit === 0) haptics.success();
      else haptics.error();
    } catch (e) {
      const message = (e as Error).message;
      addEntry({ command: raw, cwd, output: message, exit: 1 });
      haptics.error();
    } finally {
      setBusy(false);
    }
  };

  const available = Platform.OS === 'android' && CopperExec.isAvailable();

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
              Manual commands · Android shared storage
            </Text>
          </View>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: hasAllFiles ? colors.success : colors.warning }} />
        </View>
      </View>

      {!available ? (
        <View style={{ paddingHorizontal: spacing(4) }}>
          <Card>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Copper Android build required</Text>
            <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19, marginTop: spacing(2) }}>
              The manual terminal is native Android functionality. Build and install Copper’s APK; Expo Go and the web/PWA cannot provide it.
            </Text>
          </Card>
        </View>
      ) : !hasAllFiles ? (
        <View style={{ paddingHorizontal: spacing(4) }}>
          <Card>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Allow manual all-files access</Text>
            <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19, marginTop: spacing(2), marginBottom: spacing(3) }}>
              This is separate from AI project access. It lets commands you type work anywhere in Android shared storage — device storage and mounted SD cards under /storage/. It never grants access to Android’s protected /data area.
            </Text>
            <Button label="Open Android storage permission" icon="shield-outline" onPress={requestAllFiles} />
          </Card>
        </View>
      ) : null}

      {notice ? (
        <Text style={{ paddingHorizontal: spacing(4), paddingTop: spacing(2), color: colors.textSub, fontSize: 12.5, lineHeight: 18 }}>
          {notice}
        </Text>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing(4), paddingTop: spacing(3), paddingBottom: spacing(2) }}
        keyboardShouldPersistTaps="handled"
      >
        {history.length === 0 ? (
          <View style={{ paddingVertical: spacing(8), alignItems: 'center' }}>
            <Ionicons name="code-slash-outline" size={30} color={colors.textFaint} />
            <Text style={{ color: colors.textSub, fontSize: 14, fontWeight: '700', marginTop: spacing(3) }}>Manual terminal</Text>
            <Text style={{ color: colors.textFaint, fontSize: 12.5, textAlign: 'center', lineHeight: 18, marginTop: spacing(1), maxWidth: 300 }}>
              Start at your SD card root, use cd to move around, and run Android shell commands. AI access remains limited to its selected project workspace.
            </Text>
          </View>
        ) : history.map((entry) => (
          <View key={entry.id} style={[styles.entry, { borderColor: colors.border, backgroundColor: colors.termBg }]}>
            <Text selectable style={[styles.cwd, { color: '#9B9689', fontFamily: mono }]}>{entry.cwd || '/storage'}</Text>
            <Text selectable style={[styles.command, { color: colors.termText, fontFamily: mono }]}>$ {entry.command}</Text>
            <Text selectable style={[styles.output, { color: entry.exit === 0 ? colors.termText : '#F6A69A', fontFamily: mono }]}>{entry.output}</Text>
            <Text style={[styles.exit, { color: entry.exit === 0 ? colors.success : colors.danger }]}>exit {entry.exit}</Text>
          </View>
        ))}
      </ScrollView>

      {available ? (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing(3), paddingTop: spacing(2), paddingBottom: insets.bottom + spacing(2) }}>
          <Text numberOfLines={1} selectable style={{ color: colors.textFaint, fontSize: 11.5, marginBottom: spacing(1.5), fontFamily: mono }}>
            {cwd || '/storage'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2) }}>
            <View style={{ flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.termBg, paddingHorizontal: spacing(3), justifyContent: 'center' }}>
              <TextInput
                value={command}
                onChangeText={setCommand}
                onSubmitEditing={run}
                editable={!busy && hasAllFiles}
                placeholder={hasAllFiles ? 'Type a command…' : 'Allow storage access to run commands'}
                placeholderTextColor="#817D73"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                style={{ color: colors.termText, fontFamily: mono, fontSize: 13.5, paddingVertical: 10 }}
              />
            </View>
            <Button label={busy ? 'Running' : 'Run'} icon="play" loading={busy} disabled={!hasAllFiles || !command.trim()} onPress={run} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 10, padding: 12 },
  cwd: { fontSize: 10.5, marginBottom: 5 },
  command: { fontSize: 13, fontWeight: '700', lineHeight: 19 },
  output: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  exit: { fontSize: 10.5, fontWeight: '700', marginTop: 8, textAlign: 'right' },
});
