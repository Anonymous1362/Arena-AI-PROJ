import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing, SECTION_TINTS } from '@/src/theme';
import { enterStagger, isReducedMotion } from '@/src/theme/motion';
import { useSettingsStore } from '@/src/store/settings';
import { useChatsStore } from '@/src/store/chats';
import { useProjectsStore } from '@/src/store/projects';
import { Card, ListNavItem } from '@/src/components/ui';
import { PressableScale } from '@/src/components/PressableScale';
import { contextUsageFor } from '@/src/ai/context';
import { formatContext, modelMeta, prettyModelName, thinkingLabel } from '@/src/ai/catalog';
import { executorStatus } from '@/src/agent/tools';
import { githubReady } from '@/src/agent/github';

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  sub: string;
  to: string;
  badge?: string | number;
  value?: string;
}

interface Group {
  title: string;
  tint: string;
  rows: Row[];
}

export default function SettingsScreen() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = isReducedMotion();

  const profiles = useSettingsStore((s) => s.profiles);
  const activeModel = useSettingsStore((s) => s.activeModel);
  const appearance = useSettingsStore((s) => s.appearance);
  const generation = useSettingsStore((s) => s.generation);
  const agentScope = useSettingsStore((s) => s.agentScope);
  const contextCfg = useSettingsStore((s) => s.context);
  const github = useSettingsStore((s) => s.github);
  const conversationCount = useChatsStore((s) => s.conversations.length);
  const projectCount = useProjectsStore((s) => s.projects.length);

  const profile = profiles.find((p) => p.id === activeModel?.profileId);
  const meta = modelMeta(activeModel?.model ?? '');

  const latest = useChatsStore((s) =>
    [...s.conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  );
  const usage = useMemo(() => contextUsageFor(latest, latest?.systemPromptOverride ?? generation.systemPrompt), [latest, generation.systemPrompt]);

  const groups: Group[] = [
    {
      title: 'Model',
      tint: SECTION_TINTS.models,
      rows: [
        {
          icon: 'cube-outline',
          tint: SECTION_TINTS.models,
          label: 'Models & thinking',
          sub: `${thinkingLabel(generation.thinking)} thinking · ${formatContext(meta.contextWindow)} window`,
          to: '/settings/models',
          value: activeModel?.model ? prettyModelName(activeModel.model) : undefined,
        },
        {
          icon: 'key-outline',
          tint: SECTION_TINTS.providers,
          label: 'Providers & keys',
          sub: 'Gemini, Claude, GPT, Grok, OpenRouter, Ollama…',
          to: '/settings/api',
          badge: profiles.length,
        },
        {
          icon: 'options-outline',
          tint: SECTION_TINTS.generation,
          label: 'Generation',
          sub: 'System prompt, temperature, output limit',
          to: '/settings/generation',
        },
        {
          icon: 'stats-chart-outline',
          tint: SECTION_TINTS.usage,
          label: 'Usage & limits',
          sub: `${formatContext(usage.used)} used in the newest chat`,
          to: '/settings/usage',
        },
      ],
    },
    {
      title: 'Agent',
      tint: SECTION_TINTS.agent,
      rows: [
        {
          icon: 'hammer-outline',
          tint: SECTION_TINTS.agent,
          label: 'Agent & storage',
          sub: agentScope.enabled ? 'Tools on · file access configured' : 'Tools off — chat only',
          to: '/settings/agent',
        },
        {
          icon: 'terminal-outline',
          tint: SECTION_TINTS.shell,
          label: 'Shell & sandbox',
          sub: executorStatus() === 'native' ? 'Native executor detected' : 'Built-in sandboxed shell',
          to: '/settings/shell',
        },
        {
          icon: 'git-branch-outline',
          tint: SECTION_TINTS.github,
          label: 'GitHub connector',
          sub: github.login ? `@${github.login} · ${github.owner}/${github.repo}` : 'Connect a token to commit to your repo',
          to: '/settings/github',
          badge: githubReady() && agentScope.githubTools ? 'on' : undefined,
        },
      ],
    },
    {
      title: 'Experience',
      tint: SECTION_TINTS.motion,
      rows: [
        {
          icon: 'color-palette-outline',
          tint: SECTION_TINTS.appearance,
          label: 'Appearance',
          sub: `${appearance.theme === 'system' ? 'System' : appearance.theme} theme · ${appearance.accent} accent`,
          to: '/settings/appearance',
        },
        {
          icon: 'pulse-outline',
          tint: SECTION_TINTS.motion,
          label: 'Motion & haptics',
          sub: `${appearance.motion} motion · ${appearance.haptics} haptics`,
          to: '/settings/motion',
        },
      ],
    },
    {
      title: 'Data',
      tint: SECTION_TINTS.data,
      rows: [
        {
          icon: 'server-outline',
          tint: SECTION_TINTS.data,
          label: 'Data & privacy',
          sub: `${conversationCount} chats · ${projectCount} projects`,
          to: '/settings/data',
        },
        {
          icon: 'information-circle-outline',
          tint: SECTION_TINTS.about,
          label: 'About Copper',
          sub: 'Version, credits, licenses',
          to: '/settings/about',
        },
      ],
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: spacing(4), paddingTop: insets.top + spacing(4), paddingBottom: spacing(28) }}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
    >
      <Animated.View entering={reduced ? undefined : FadeInDown.duration(280)}>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 }}>Settings</Text>
        <Text style={{ color: colors.textFaint, fontSize: 13, marginTop: 4, marginBottom: spacing(4) }}>
          Ten sections · everything stays on this device
        </Text>
      </Animated.View>

      {/* hero: the active brain */}
      <Animated.View entering={reduced ? undefined : enterStagger(0, 0)}>
        <PressableScale haptic="select" scale={0.99} onPress={() => router.push('/settings/models')}>
          <LinearGradient
            colors={[colors.userBubbleFrom, colors.userBubbleTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Ionicons name="sparkles" size={19} color={colors.userBubbleFrom} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' }}>
                  Active brain
                </Text>
                <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '800', marginTop: 2, letterSpacing: -0.3 }}>
                  {activeModel?.model ? prettyModelName(activeModel.model) : 'No model selected'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
            </View>
            <View style={styles.heroChips}>
              <HeroChip label={profile?.name ?? 'no provider'} />
              <HeroChip label={`${thinkingLabel(generation.thinking)} thinking`} />
              <HeroChip label={`${formatContext(meta.contextWindow)} window`} />
              <HeroChip label={agentScope.enabled ? 'agent on' : 'agent off'} />
              {contextCfg.autoCompact ? <HeroChip label={`compact @${contextCfg.compactAtPct}%`} /> : null}
            </View>
          </LinearGradient>
        </PressableScale>
      </Animated.View>

      {groups.map((g, gi) => (
        <Animated.View key={g.title} entering={reduced ? undefined : enterStagger(gi + 1, 60)}>
          <View style={styles.groupHead}>
            <View style={[styles.groupDot, { backgroundColor: g.tint }]} />
            <Text style={[styles.groupTitle, { color: colors.textSub }]}>{g.title}</Text>
            <View style={[styles.groupRule, { backgroundColor: colors.border }]} />
          </View>
          <Card style={{ paddingVertical: spacing(1), borderLeftWidth: 2.5, borderLeftColor: g.tint }}>
            {g.rows.map((r, i) => (
              <ListNavItem
                key={r.to}
                icon={r.icon}
                iconColor={r.tint}
                label={r.label}
                sublabel={r.sub}
                value={r.value}
                badge={r.badge}
                last={i === g.rows.length - 1}
                onPress={() => router.push(r.to as never)}
              />
            ))}
          </Card>
        </Animated.View>
      ))}

      <View style={[styles.footer, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <Ionicons name={scheme === 'dark' ? 'moon-outline' : 'sunny-outline'} size={15} color={colors.textFaint} />
        <Text style={{ color: colors.textFaint, fontSize: 11.5, flex: 1, lineHeight: 17 }}>
          Chats, keys, files and the GitHub token are stored in on-device AsyncStorage and sent only to the endpoints
          you configure. No accounts, no telemetry, no analytics.
        </Text>
      </View>
    </ScrollView>
  );
}

function HeroChip({ label }: { label: string }) {
  return (
    <View style={styles.heroChip}>
      <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: spacing(4), gap: spacing(3.5), overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  heroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroChip: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing(6), marginBottom: spacing(2), paddingHorizontal: spacing(1) },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupTitle: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  groupRule: { flex: 1, height: StyleSheet.hairlineWidth },
  footer: { flexDirection: 'row', gap: 8, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing(3.5), marginTop: spacing(6) },
});
