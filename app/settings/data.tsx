import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, spacing } from '@/src/theme';
import { useChatsStore, type Conversation } from '@/src/store/chats';
import { useSettingsStore } from '@/src/store/settings';
import { AppHeader } from '@/src/components/AppHeader';
import { Banner, Button, Card } from '@/src/components/ui';
import { haptics } from '@/src/utils/haptics';
import { readPickedJson, shareJson } from '@/src/utils/share';

export default function DataSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const conversations = useChatsStore((s) => s.conversations);
  const importConversations = useChatsStore((s) => s.importConversations);
  const clearAllChats = useChatsStore((s) => s.clearAllChats);
  const resetAll = useSettingsStore((s) => s.resetAll);

  const [note, setNote] = useState<string | null>(null);

  const exportAll = async () => {
    try {
      await shareJson(`copper-backup-${new Date().toISOString().slice(0, 10)}.json`, {
        app: 'copper',
        kind: 'backup',
        exportedAt: new Date().toISOString(),
        conversations,
      });
      haptics.success();
    } catch (e) {
      setNote(`Export failed: ${(e as Error).message}`);
    }
  };

  const importBackup = async () => {
    try {
      const data = (await readPickedJson()) as { conversations?: Conversation[] };
      const convs = Array.isArray(data) ? data : data?.conversations;
      if (!Array.isArray(convs)) throw new Error('No conversations found in that file.');
      importConversations(convs);
      haptics.success();
      setNote(`Imported ${convs.length} conversation${convs.length === 1 ? '' : 's'}.`);
    } catch (e) {
      if ((e as Error).message !== 'No file selected.') {
        setNote(`Import failed: ${(e as Error).message}`);
        haptics.error();
      }
    }
  };

  const msgCount = conversations.reduce((n, c) => n + c.messages.length, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Data & privacy" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing(3) }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="lock-closed" size={19} color={colors.accent} />
            </View>
            <Text style={{ color: colors.text, fontSize: 14.5, lineHeight: 20, flex: 1 }}>
              <Text style={{ fontWeight: '800' }}>Private by design.{'\n'}</Text>
              Chats and keys live only on this device. Copper has no backend, no analytics,
              and no accounts.
            </Text>
          </View>
        </Card>

        {note ? <Banner kind="info" text={note} onClose={() => setNote(null)} /> : null}

        <Card style={{ marginTop: spacing(4) }}>
          <View style={{ gap: spacing(2) }}>
            <Button label={`Export all chats (${conversations.length} chats · ${msgCount} msgs)`} variant="secondary" icon="share-outline" onPress={exportAll} />
            <Button label="Import backup (.json)" variant="secondary" icon="download-outline" onPress={importBackup} />
          </View>
        </Card>

        <Card style={{ marginTop: spacing(4) }}>
          <View style={{ gap: spacing(2) }}>
            <Button
              label="Delete all chats"
              variant="danger"
              icon="trash-outline"
              onPress={() =>
                Alert.alert('Delete all chats?', 'Every conversation will be erased from this device. Export first if you care about them.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete all', style: 'destructive', onPress: () => { haptics.warning(); clearAllChats(); } },
                ])
              }
            />
            <Button
              label="Reset settings (keeps chats)"
              variant="ghost"
              icon="refresh-outline"
              onPress={() =>
                Alert.alert('Reset settings?', 'Providers, API keys, downloads list and preferences are reset. Chats are kept.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Reset', style: 'destructive', onPress: () => { haptics.warning(); resetAll(); } },
                ])
              }
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
