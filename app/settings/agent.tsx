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
  setWorkspaceOnly,
  type FsPermissionInfo,
} from '@/src/agent/fs';
import { TOOL_SPECS, executorStatus } from '@/src/agent/tools';
import { haptics } from '@/src/utils/haptics';
import { CopperExec } from '@/modules/copper-exec';

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
  const [hasAllFiles, setHasAllFiles] = useState(false);

  // Re-arm persisted SAF access after hydration, while always discovering the
  // automatic removable/primary external root in the background.
  useEffect(() => {
    let mounted = true;
    setWorkspaceOnly(agentScope.workspaceOnly);
    setGrantedTree(agentScope.storageEnabled && Platform.OS === 'android' ? agentScope.safTreeUri ?? null : null);
    void Promise.all([
      initExternalStorage(),
      Platform.OS === 'android' ? CopperExec.hasAllFilesAccess() : Promise.resolve(false),
    ]).then(([, allFiles]) => {
      if (!mounted) return;
      setStorage(getStorageStatus());
      setHasAllFiles(allFiles);
    });
    return () => { mounted = false; };
  }, [agentScope.safTreeUri, agentScope.storageEnabled, agentScope.workspaceOnly]);

  const pickFolder = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await requestStorageAccess();
      const granted = res.tier === 'granted';
      patch({
        storageEnabled: granted,
        workspaceOnly: true,
        safTreeUri: granted ? res.treeUri : undefined,
        safRootLabel: granted ? res.rootLabel : undefined,
      });
      setWorkspaceOnly(true);
      setGrantedTree(granted ? res.treeUri ?? null : null);
      setStorage(getStorageStatus());
      haptics.success();
      setNote(
        granted
          ? `AI workspace selected: “${res.rootLabel}”. The AI can create and read projects only inside that folder.`
          : 'Folder picker closed. Select COPPER Projects to enable the AI workspace.'
      );
    } catch (e) {
      haptics.error();
      setNote(`Could not open the folder picker: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const clearAiWorkspace = async () => {
    setBusy(true);
    try {
      revokeStorageAccess();
      setWorkspaceOnly(true);
      patch({ storageEnabled: false, workspaceOnly: true, safTreeUri: undefined, safRootLabel: undefined });
      await initExternalStorage();
      setStorage(getStorageStatus());
      setNote('AI workspace cleared. Select another folder before letting the AI create or edit project files.');
    } finally {
      setBusy(false);
    }
  };

  const requestAllFiles = async () => {
    try {
      const granted = await CopperExec.requestAllFilesAccess();
      setHasAllFiles(granted);
      setNote(
        granted
          ? 'All files access is enabled for the manual Terminal tab.'
          : 'Android Settings opened. Enable “Allow access to manage all files”, then return and reopen this screen.'
      );
    } catch (e) {
      setNote(`Could not open Android storage permission: ${(e as Error).message}`);
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
          <SwitchRow
            label="Limit AI to selected workspace"
            hint="Recommended. AI files stay inside the folder you select, such as COPPER Projects."
            value={agentScope.workspaceOnly}
            onChange={(v) => {
              setWorkspaceOnly(v);
              patch({ workspaceOnly: v });
              setStorage(getStorageStatus());
            }}
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
                AI project workspace
              </Text>
              <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19, marginBottom: spacing(3) }}>
                Select your COPPER Projects folder on the SD card. AI file tools and generated exports are jailed inside it,
                so a game can be created as its own named subfolder without the AI touching folders outside your workspace.
              </Text>
              {!usingCustomFolder && agentScope.workspaceOnly ? (
                <Text style={{ color: colors.warning, fontSize: 12.5, lineHeight: 18, marginBottom: spacing(3) }}>
                  Select `/storage/0123-4567/Download/COPPER Projects` in the picker to enable AI project files.
                </Text>
              ) : null}
              <Text style={{ color: colors.textFaint, fontSize: 12, lineHeight: 18, marginBottom: spacing(3) }}>
                The picker opens at a removable card when one is mounted. You can choose COPPER Projects, Downloads,
                Documents, or another folder. Multiple named projects can live inside the one selected workspace.
              </Text>
              <View style={{ gap: spacing(2) }}>
                <Button
                  label={usingCustomFolder ? 'Change AI workspace folder' : 'Select COPPER Projects folder'}
                  icon="folder-open-outline"
                  loading={busy}
                  onPress={pickFolder}
                />
                {usingCustomFolder ? (
                  <Button
                    label="Stop using selected workspace"
                    variant="ghost"
                    icon="lock-closed-outline"
                    loading={busy}
                    onPress={clearAiWorkspace}
                  />
                ) : null}
              </View>
            </>
          ) : (
            <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19 }}>
              This platform has no Android-style removable storage volume. Agent files remain jailed to the app sandbox.
            </Text>
          )}
        </Card>

        {isAndroid ? (
          <Card style={{ marginTop: spacing(4) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(2) }}>
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.termBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="terminal" size={19} color={colors.termText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Manual terminal access</Text>
                <Text style={{ color: hasAllFiles ? colors.success : colors.textSub, fontSize: 12.5, marginTop: 1 }}>
                  {hasAllFiles ? 'All shared storage enabled' : 'All shared storage not enabled'}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19, marginBottom: spacing(3) }}>
              This applies only to commands you type in the Terminal tab. It can access device storage and mounted SD cards under /storage/ after you approve Android’s special all-files screen. AI tools remain in the selected project workspace.
            </Text>
            <Button
              label={hasAllFiles ? 'All files access enabled' : 'Open Android storage permission'}
              variant={hasAllFiles ? 'secondary' : 'primary'}
              icon={hasAllFiles ? 'checkmark-circle-outline' : 'shield-outline'}
              onPress={requestAllFiles}
            />
          </Card>
        ) : null}

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
              AI shell: {executorStatus() === 'native' ? 'native · automatic external cwd' : 'workspace-safe file commands (ls, cat, grep, find…)'}
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
            AI commands stay inside the selected workspace when workspace protection is on. The separate Terminal tab is for your manual all-files commands.
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
