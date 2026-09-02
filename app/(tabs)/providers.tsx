import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useSettingsStore } from '@/src/store/settings';
import { PROVIDER_PRESETS, type Pricing } from '@/src/ai/remote';
import { useUsageStore, summarizeUsage } from '@/src/store/usage';
import { Gauge } from '@/src/components/Icons';
import { PressableScale } from '@/src/components/PressableScale';
import { Card, SectionHeader } from '@/src/components/ui';
import { Sheet } from '@/src/components/Sheet';

export default function ProvidersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const profiles = useSettingsStore((s) => s.profiles);
  const activeModel = useSettingsStore((s) => s.activeModel);

  const [presetSheet, setPresetSheet] = useState(false);

  const activeLabel = () => {
    if (!activeModel) return 'None selected';
    const p = profiles.find((x) => x.id === activeModel.profileId);
    return `${p?.name ?? 'provider'} · ${activeModel.model}`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing(4),
          paddingTop: insets.top + spacing(4),
          paddingBottom: spacing(14),
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginBottom: spacing(1) }}>
          Providers
        </Text>
        <Text style={{ color: colors.textSub, fontSize: 14, marginBottom: spacing(4) }}>
          One key each, stored only on this device. Everything OpenAI-compatible works.
        </Text>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cube" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
                Active model
              </Text>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 2 }}>
                {activeLabel()}
              </Text>
            </View>
          </View>
        </Card>

        <PressableScale haptic="light" scale={0.98} onPress={() => router.push('/settings/usage')}>
          <Card style={{ marginTop: spacing(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Gauge size={17} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>Live usage</Text>
                <UsageSummaryLine />
              </View>
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Details</Text>
            </View>
          </Card>
        </PressableScale>

        <SectionHeader title={`Your providers (${profiles.length})`} />
        {profiles.length === 0 ? (
          <Card>
            <Text style={{ color: colors.textSub, fontSize: 13.5, lineHeight: 20 }}>
              Nothing connected yet. Recommended first pick: Google Gemini (free API key) or OpenRouter
              (free models + everything else behind one key).
            </Text>
          </Card>
        ) : (
          profiles.map((p) => {
            const isDefault = p.id === useSettingsStore.getState().activeProfileId;
            return (
              <PressableScale
                key={p.id}
                haptic="light"
                scale={0.98}
                onPress={() => router.push({ pathname: '/settings/api', params: { edit: p.id } })}
              >
                <Card style={{ marginBottom: spacing(2) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="cloud" size={17} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{p.name}</Text>
                        {isDefault ? (
                          <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 1.5 }}>
                            <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>DEFAULT</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text numberOfLines={1} style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>
                        {p.baseUrl}
                      </Text>
                    </View>
                  </View>
                </Card>
              </PressableScale>
            );
          })
        )}

        <View style={{ marginTop: spacing(2) }}>
          <PressableScale haptic="medium" onPress={() => setPresetSheet(true)}>
            <View
              style={{
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.borderStrong,
                paddingVertical: spacing(3.4),
                alignItems: 'center',
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '700', marginTop: spacing(1.5), fontSize: 14 }}>
                Add a provider
              </Text>
            </View>
          </PressableScale>
        </View>

        <SectionHeader title="Capability notes" />
        <Card>
          {[
            ['hammer', 'Tool calling / agent mode', 'Claude, GPT-5/4.x, Gemini, Grok, DeepSeek, Qwen3 and most ≥7B instruct models.'],
            ['eye', 'Vision (image input)', 'Claude, GPT-4o/5, Gemini, Grok. Attach with the + button in chat.'],
            ['sparkles', 'Extended thinking', 'Claude & reasoning models stream their reasoning; steps render in the plan panel.'],
          ].map(([icon, title, body]) => (
            <View key={title} style={{ flexDirection: 'row', gap: 12, paddingVertical: spacing(2) }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={icon as never} size={15} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>{title}</Text>
                <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1, lineHeight: 18 }}>{body}</Text>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>

      <ProviderPresetSheet
        visible={presetSheet}
        onClose={() => setPresetSheet(false)}
        onPick={(id) => {
          setPresetSheet(false);
          router.push({ pathname: '/settings/api', params: { preset: id } });
        }}
      />
    </View>
  );
}

function ProviderPresetSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (presetId: string) => void;
}) {
  const { colors } = useTheme();
  const local = PROVIDER_PRESETS.filter((p) => p.pricing === 'local');
  const free = PROVIDER_PRESETS.filter((p) => p.pricing === 'free');
  const freemium = PROVIDER_PRESETS.filter((p) => p.pricing === 'freemium');
  const paid = PROVIDER_PRESETS.filter((p) => p.pricing === 'paid');

  const PriceBadge = ({ tier }: { tier: Pricing }) => {
    const tint =
      tier === 'free' ? colors.success : tier === 'freemium' ? colors.warning : tier === 'local' ? colors.accent : colors.textFaint;
    const label = tier === 'free' ? 'FREE TIER' : tier === 'freemium' ? 'FREE + PAID' : tier === 'local' ? 'YOUR MACHINE' : 'PAY AS YOU GO';
    return (
      <View style={{ backgroundColor: tier === 'paid' ? colors.surface2 : tint + '22', borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 }}>
        <Text style={{ color: tint, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 }}>{label}</Text>
      </View>
    );
  };

  const Row = ({ p }: { p: (typeof PROVIDER_PRESETS)[number] }) => (
    <PressableScale haptic="light" scale={0.98} onPress={() => onPick(p.id)}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing(3),
          paddingVertical: spacing(2.8),
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={p.localNetwork ? 'home-outline' : 'cloud-outline'} size={16} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{p.name}</Text>
            <PriceBadge tier={p.pricing} />
          </View>
          <Text numberOfLines={2} style={{ color: colors.textFaint, fontSize: 12, marginTop: 1 }}>
            {p.pricingNote ?? p.note ?? p.baseUrl}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </View>
    </PressableScale>
  );

  const Group = ({ title, items }: { title: string; items: typeof PROVIDER_PRESETS }) => (
    <>
      <Text style={{ color: colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: spacing(3.5), marginBottom: spacing(1) }}>
        {title}
      </Text>
      {items.map((p) => (
        <Row key={p.id} p={p} />
      ))}
    </>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Add a provider" maxHeight="78%">
      <ScrollView style={{ paddingHorizontal: spacing(4) }} keyboardShouldPersistTaps="handled">
        {free.length ? <Group title="Free tier" items={free} /> : null}
        {freemium.length ? <Group title="Free + paid" items={freemium} /> : null}
        {paid.length ? <Group title="Pay as you go" items={paid} /> : null}
        {local.length ? <Group title="On your network · free" items={local} /> : null}
        <View style={{ height: spacing(4) }} />
      </ScrollView>
    </Sheet>
  );
}

function UsageSummaryLine() {
  const { colors } = useTheme();
  const events = useUsageStore((s) => s.events);
  const limits = useUsageStore((s) => s.limits);
  const sum = summarizeUsage(events);
  return (
    <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>
      {sum.hourReq}/{limits.hour} per hour · {sum.dayReq}/{limits.day} per day · {fmt(sum.todayTokens)} tokens today
    </Text>
  );
}

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
