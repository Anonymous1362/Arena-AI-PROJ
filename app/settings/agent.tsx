import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useSettingsStore } from '@/src/store/settings';
import { AppHeader } from '@/src/components/AppHeader';
import { Banner, Button, Card, SwitchRow } from '@/src/components/ui';
import {
  getStorageStatus,
  initExternalStorage,
  requestStorageAccess,
  revokeStorageAccess,
  setGrantedTree,
  useDefaultExternalStorage,
  type FsPermissionInfo,
} from '@/src/agent/fs';
import { TOOL_SPECS, executorStatus } from '@/src/agent/tools';
import { haptics } from '@/src/utils/haptics';

export default function AgentSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const agentScope = useSettingsStore((s) => s.agentScope);
  const patch = useSettingsStore((s) => s.patchAgentScope);
  const behavior = useSettingsStore((s) => s.behavior);
  const patchBehavior = useSettingsStore((s) => s.patchBehavior);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [storage, setStorage] = useState<FsPermissionInfo>(() => getStorageStatus());

  // Re-arm persisted SAF access after hydration, while always discovering the
  // automatic removable/primary external root in the background.
  useEffect(() => {
    let mounted = true;
    setGrantedTree(agentScope.storageEnabled && Platform.OS === 'android' ? agentScope.safTreeUri ?? null : null);
    void initExternalStorage().then(() => {
      if (mounted) setStorage(getStorageStatus());
    });
    return () => { mounted = false; };
  }, [agentScope.safTreeUri, agentScope.storageEnabled]);

  const pickFolder = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await requestStorageAccess();
      const granted = res.tier === 'granted';
      patch({
        storageEnabled: granted,
        safTreeUri: granted ? res.treeUri : undefined,
        safRootLabel: granted ? res.rootLabel : undefined,
      });
      setGrantedTree(granted ? res.treeUri ?? null : null);
      setStorage(getStorageStatus());
      haptics.success();
      setNote(
        granted
          ? `Custom storage root selected: “${res.rootLabel}”. Agent files and exports now use that folder.`
          : `Folder picker closed. Copper is still using ${res.rootLabel.toLowerCase()} automatically.`
      );
    } catch (e) {
      haptics.error();
      setNote(`Could not open the folder picker: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const useAutomaticExternal = async () => {
    setBusy(true);
    setNote(null);
    try {
      revokeStorageAccess();
      patch({ storageEnabled: false, safTreeUri: undefined, safRootLabel: undefined });
      const res = await useDefaultExternalStorage();
      setStorage(getStorageStatus());
      haptics.success();
      setNote(
        res.tier === 'external'
          ? `Using ${res.rootLabel.toLowerCase()} automatically. No broad storage permission is needed.`
          : res.rootLabel
      );
    } catch (e) {
      haptics.error();
      setNote(`Could not switch storage: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const isAndroid = Platform.OS === 'android';
  const usingCustomFolder = storage.tier === 'granted';
  const automaticExternal = storage.tier === 'external';
  const rootSummary = usingCustomFolder
    ? `Custom: “${storage.rootLabel}”`
    : automaticExternal
      ? `Auto: ${storage.rootLabel}`
      : storage.rootLabel;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Agent & storage" subtitle="What the AI can do on this device" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}>
        <Card>
          <SwitchRow
            label="Agent mode"
            hint="Tools, terminal & multi-step task execution in chat."
            value={agentScope.enabled}
            onChange={(v) => patch({ enabled: v })}
          />
          <SwitchRow
            label="Auto-continue"
            hint="Automatically resume when a reply is cut off by token limits."
            value={behavior.autoContinue}
            onChange={(v) => patchBehavior({ autoContinue: v })}
          />
        </Card>

        <Card style={{ marginTop: spacing(4) }}>
          <SwitchRow
            label="Confirm before deleting"
            hint="Ask permission for delete / rm -rf actions."
            value={agentScope.confirmDangerous}
            onChange={(v) => patch({ confirmDangerous: v })}
          />
          <SwitchRow
            label="Read replies aloud"
            hint="Speak each finished answer (on-device voices)."
            value={agentScope.autoReadAloud}
            onChange={(v) => patch({ autoReadAloud: v })}
          />
        </Card>

        <Card style={{ marginTop: spacing(4) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(3) }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={automaticExternal ? 'hardware-chip-outline' : 'folder-open'} size={19} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Storage root</Text>
              <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>{rootSummary}</Text>
            </View>
          </View>

          {storage.rootPath ? (
            <View style={{ backgroundColor: colors.termBg, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2), marginBottom: spacing(3) }}>
              <Text selectable style={{ color: colors.termText, fontSize: 11.5, lineHeight: 17 }}>
                {storage.rootPath}
              </Text>
            </View>
          ) : null}

          {isAndroid ? (
            <>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: spacing(1) }}>
                Always uses external / SD card storage
              </Text>
              <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19, marginBottom: spacing(3) }}>
                Agent file tools, the native terminal, and Copper exports use the app’s external files folder.
                A removable SD card is preferred when it is mounted; otherwise Android’s primary external storage is used.
                Copper does not silently fall back to internal app storage for these files.
              </Text>
              {storage.tier === 'unavailable' ? (
                <Text style={{ color: colors.warning, fontSize: 12.5, lineHeight: 18, marginBottom: spacing(3) }}>
                  No writable external volume is available right now. Insert/remount the card and tap “Use default external”.
                </Text>
              ) : null}
              <Text style={{ color: colors.textFaint, fontSize: 12, lineHeight: 18, marginBottom: spacing(3) }}>
                The automatic folder needs no Termux-style setup or broad “all files” permission. To use a different folder
                (SD card, Downloads, Documents), choose it explicitly below.
              </Text>
              <View style={{ gap: spacing(2) }}>
                <Button
                  label="Pick a folder (SD card, Downloads… )"
                  icon="folder-open-outline"
                  loading={busy}
                  onPress={pickFolder}
                />
                {usingCustomFolder ? (
                  <Button
                    label="Use default external (auto)"
                    variant="secondary"
                    icon="refresh-outline"
                    loading={busy}
                    onPress={useAutomaticExternal}
                  />
                ) : (
                  <Button
                    label="Refresh external / SD card"
                    variant="ghost"
                    icon="refresh-outline"
                    loading={busy}
                    onPress={useAutomaticExternal}
                  />
                )}
              </View>
            </>
          ) : (
            <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19 }}>
              This platform has no Android-style removable storage volume. Agent files remain jailed to the app sandbox.
            </Text>
          )}
        </Card>

        {note ? <Banner kind="info" text={note} onClose={() => setNote(null)} /> : null}

        <Card style={{ marginTop: spacing(4) }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: spacing(2) }}>
            Tools the agent can use
          </Text>
          {TOOL_SPECS.map((t) => (
            <View key={t.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: spacing(1.6) }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons
                  name={t.name === 'run_command' ? 'terminal' : t.danger ? 'trash-outline' : 'document-outline'}
                  size={14}
                  color={t.name === 'run_command' ? colors.accent : colors.textSub}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>{t.name}</Text>
                <Text numberOfLines={2} style={{ color: colors.textFaint, fontSize: 12 }}>
                  {t.description}
                </Text>
              </View>
            </View>
          ))}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: spacing(2),
              backgroundColor: colors.termBg,
              borderRadius: radius.md,
              paddingHorizontal: spacing(3),
              paddingVertical: spacing(2),
            }}
          >
            <Ionicons name="terminal" size={14} color={colors.termText} />
            <Text style={{ color: colors.termText, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
              Shell: {executorStatus() === 'native' ? 'native · external storage cwd' : 'sandboxed built-ins (ls, cat, grep, find…)'}
            </Text>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: executorStatus() === 'native' ? colors.success : colors.warning,
              }}
            />
          </View>
          <Text style={{ color: colors.textFaint, fontSize: 12, lineHeight: 18, marginTop: spacing(2) }}>
            Native Android commands start in the automatic external root. When you choose a custom SAF folder,
            the safe built-in commands stay inside that folder instead.
          </Text>
        </Card>

        <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: spacing(4) }}>
          File operations are limited to text files (≤2 MB read, ≤1 MB write).{'\n'}
          Nothing ever leaves the device except the model API you configured.
        </Text>
      </ScrollView>
    </View>
  );
}
