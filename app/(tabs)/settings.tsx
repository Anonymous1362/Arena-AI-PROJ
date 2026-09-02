import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useSettingsStore } from '@/src/store/settings';
import { Card, ListNavItem } from '@/src/components/ui';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profiles = useSettingsStore((s) => s.profiles);
  const activeModel = useSettingsStore((s) => s.activeModel);

  const activeSummary = () => {
    if (!activeModel) return 'Not set up yet';
    const p = profiles.find((x) => x.id === activeModel.profileId);
    return `${p?.name ?? 'provider'} · ${activeModel.model}`;
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: spacing(4), paddingTop: insets.top + spacing(4), paddingBottom: spacing(14) }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginBottom: spacing(4) }}>
        Settings
      </Text>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
          <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={21} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>Agent</Text>
            <Text style={{ color: colors.textSub, fontSize: 13, marginTop: 1 }}>{activeSummary()}</Text>
          </View>
        </View>
        {!activeModel ? (
          <Text
            onPress={() => router.push('/settings/api')}
            style={{ color: colors.accent, fontWeight: '700', marginTop: spacing(3), fontSize: 13.5 }}
          >
            Set up a model →
          </Text>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing(4), paddingVertical: spacing(1) }}>
        <ListNavItem
          icon="hammer-outline"
          label="Agent & storage"
          sublabel="Tools, terminal, file access"
          onPress={() => router.push('/settings/agent')}
        />
        <ListNavItem
          icon="key-outline"
          label="Providers"
          sublabel="Gemini, OpenAI, Claude, OpenRouter, Ollama…"
          badge={profiles.length}
          onPress={() => router.push('/settings/api')}
        />
        <ListNavItem
          icon="color-palette-outline"
          label="Appearance"
          sublabel="Theme, text size, haptics"
          onPress={() => router.push('/settings/appearance')}
        />
        <ListNavItem
          icon="options-outline"
          label="Generation"
          sublabel="System prompt, temperature, limits"
          onPress={() => router.push('/settings/generation')}
        />
        <ListNavItem
          icon="stats-chart-outline"
          label="Usage & limits"
          sublabel="Rolling windows, tokens, activity"
          onPress={() => router.push('/settings/usage')}
        />
        <ListNavItem
          icon="server-outline"
          label="Data & privacy"
          sublabel="Export, import, erase"
          onPress={() => router.push('/settings/data')}
          last
        />
      </Card>

      <Card style={{ marginTop: spacing(4), paddingVertical: spacing(1) }}>
        <ListNavItem
          icon="information-circle-outline"
          label="About Copper"
          sublabel="Version, credits, licenses"
          onPress={() => router.push('/settings/about')}
          last
        />
      </Card>

      <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing(5), lineHeight: 18 }}>
        Everything — chats, keys, files — stays on this device.{'\n'}No accounts. No telemetry.
      </Text>
    </ScrollView>
  );
}
