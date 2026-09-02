import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useSettingsStore } from '@/src/store/settings';
import { SectionHeader } from '@/src/components/ui';
import { PressableScale } from '@/src/components/PressableScale';

/* Accent palette that gives each settings row its own recognizable colour. */
const TINT = {
  agent: '#C15F3C',
  providers: '#2F6FED',
  generation: '#C2456D',
  appearance: '#7C5CE0',
  usage: '#1E9E6A',
  data: '#C07A1F',
  about: '#4C7FB4',
} as const;

function GroupCard({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        overflow: 'hidden',
        paddingHorizontal: spacing(2),
        marginHorizontal: -spacing(0.5),
      }}
    >
      {children}
    </View>
  );
}

function SettingRow({
  icon,
  tint,
  label,
  sublabel,
  badge,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  sublabel: string;
  badge?: string | number;
  onPress: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale haptic="light" scale={0.99} opacityOnPress={0.8} onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: spacing(3),
          paddingHorizontal: spacing(1),
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            backgroundColor: `${tint}1F`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={17} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '700' }}>{label}</Text>
          <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12, marginTop: 1 }}>
            {sublabel}
          </Text>
        </View>
        {badge !== undefined ? (
          <View style={{ backgroundColor: `${tint}1F`, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3 }}>
            <Text style={{ color: tint, fontSize: 12, fontWeight: '800' }}>{String(badge)}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </View>
    </PressableScale>
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profiles = useSettingsStore((s) => s.profiles);
  const activeModel = useSettingsStore((s) => s.activeModel);

  const activeName = activeModel ? (profiles.find((x) => x.id === activeModel.profileId)?.name ?? 'Provider') : 'No model connected';
  const activeModelId = activeModel?.model ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: spacing(4), paddingTop: insets.top + spacing(4), paddingBottom: spacing(14) }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 }}>
        Settings
      </Text>
      <Text style={{ color: colors.textFaint, fontSize: 13.5, marginTop: 2, marginBottom: spacing(3) }}>
        Model, tools, appearance and privacy — all on-device.
      </Text>

      {/* active engine card */}
      <PressableScale haptic="light" scale={0.985} opacityOnPress={0.92} onPress={() => router.push('/settings/api')}>
        <LinearGradient
          colors={[colors.userBubbleFrom, colors.userBubbleTo, colors.accent2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.lg, padding: spacing(4.5), marginBottom: spacing(2) }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={activeModel ? 'sparkles' : 'cloud-offline-outline'} size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '700', letterSpacing: 0.4 }}>
                ACTIVE ENGINE
              </Text>
              <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginTop: 2 }}>
                {activeName}
              </Text>
              <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12.5, marginTop: 1 }}>
                {activeModelId ?? 'Connect a provider to start chatting'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.9)" />
          </View>
        </LinearGradient>
      </PressableScale>

      {/* agent & models */}
      <SectionHeader title="Agent & models" />
      <GroupCard>
        <SettingRow
          icon="hammer-outline"
          tint={TINT.agent}
          label="Agent & storage"
          sublabel="Tools, terminal, file access"
          onPress={() => router.push('/settings/agent')}
        />
        <SettingRow
          icon="key-outline"
          tint={TINT.providers}
          label="Providers & models"
          sublabel={profiles.length ? 'Gemini, Claude, GPT, Grok, DeepSeek…' : 'No providers yet'}
          badge={profiles.length || undefined}
          onPress={() => router.push('/settings/api')}
          last
        />
      </GroupCard>

      {/* chat */}
      <SectionHeader title="Chat" />
      <GroupCard>
        <SettingRow
          icon="chatbubble-ellipses-outline"
          tint={TINT.generation}
          label="Generation"
          sublabel="System prompt, temperature, limits"
          onPress={() => router.push('/settings/generation')}
        />
        <SettingRow
          icon="color-palette-outline"
          tint={TINT.appearance}
          label="Appearance"
          sublabel="Theme, text size, haptics"
          onPress={() => router.push('/settings/appearance')}
          last
        />
      </GroupCard>

      {/* app */}
      <SectionHeader title="App" />
      <GroupCard>
        <SettingRow
          icon="stats-chart-outline"
          tint={TINT.usage}
          label="Usage & limits"
          sublabel="Rolling windows, tokens, activity"
          onPress={() => router.push('/settings/usage')}
        />
        <SettingRow
          icon="shield-checkmark-outline"
          tint={TINT.data}
          label="Data & privacy"
          sublabel="Export, import, erase everything"
          onPress={() => router.push('/settings/data')}
          last
        />
      </GroupCard>

      {/* about */}
      <SectionHeader title="About" />
      <GroupCard>
        <SettingRow
          icon="information-circle-outline"
          tint={TINT.about}
          label="About Copper"
          sublabel="Version, credits, licenses"
          onPress={() => router.push('/settings/about')}
          last
        />
      </GroupCard>

      <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing(5), lineHeight: 18 }}>
        Everything — chats, keys, files — stays on this device.{'\n'}No accounts. No telemetry.
      </Text>
    </ScrollView>
  );
}
