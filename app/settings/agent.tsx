import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useSettingsStore } from '@/src/store/settings';
import { AppHeader } from '@/src/components/AppHeader';
import { Banner, Button, Card, SwitchRow } from '@/src/components/ui';
import {
  requestStorageAccess,
  revokeStorageAccess,
  setGrantedTree,
} from '@/src/agent/fs';
import { TOOL_SPECS, executorStatus } from '@/src/agent/tools';
import { haptics } from '@/src/utils/haptics';
import { Platform } from 'react-native';

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

  // re-arm the FS layer from persisted state
  useEffect(() => {
    setGrantedTree(agentScope.storageEnabled && Platform.OS === 'android' ? agentScope.safTreeUri ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grant = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await requestStorageAccess();
      haptics.success();
      patch({
        storageEnabled: true,
        safTreeUri: res.treeUri,
        safRootLabel: res.rootLabel,
      });
      setGrantedTree(res.treeUri ?? null);
      setNote(
        res.tier === 'granted'
          ? `Storage root granted: “${res.rootLabel}”. The agent can now read/write files there.`
          : 'Using the private app sandbox as the storage root.'
      );
    } catch (e) {
      setNote(`Could not get access: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const revoke = () => {
    haptics.warning();
    revokeStorageAccess();
    patch({ storageEnabled: false, safTreeUri: undefined, safRootLabel: undefined });
    setNote('Storage access revoked. The agent now uses the private app sandbox only.');
  };

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
              <Ionicons name="folder-open" size={19} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Project folders</Text>
              <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>
                Where a chat's work lives inside the storage root.
              </Text>
            </View>
          </View>
          <SwitchRow
            label="Keep each task in a project folder"
            hint="The agent creates projects/<name>/ per deliverable — a game becomes projects/space-game/ with all its code inside."
            value={agentScope.projectFolders}
            onChange={(v) => patch({ projectFolders: v })}
          />
          <SwitchRow
            label="One project folder per chat"
            hint="On: every file this chat makes shares one folder named after the chat. Off: the agent organises freely. Flip back anytime."
            value={agentScope.oneProjectPerChat}
            onChange={(v) => patch({ oneProjectPerChat: v })}
          />
          <Button
            label="Storage root & permissions"
            variant="ghost"
            icon="key-outline"
            onPress={() => router.push('/settings/shell')}
          />
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
              Shell: {executorStatus() === 'native' ? 'native · full access' : 'sandboxed built-ins (ls, cat, grep, find…)'}
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
            Android devices with an executor grant unlock full native shell execution automatically —
            no setup in this app.
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
