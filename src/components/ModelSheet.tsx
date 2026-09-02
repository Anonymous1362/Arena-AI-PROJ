import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme, radius, spacing } from '@/src/theme';
import { Sheet } from '@/src/components/Sheet';
import { PressableScale } from '@/src/components/PressableScale';
import { useSettingsStore, selectActiveProfile, type ActiveModel } from '@/src/store/settings';
import { listRemoteModels, PROVIDER_PRESETS } from '@/src/ai/remote';
import { haptics } from '@/src/utils/haptics';
import { Platform } from 'react-native';

interface ModelSheetProps {
  visible: boolean;
  onClose: () => void;
  onPicked?: (model: ActiveModel) => void;
  current?: ActiveModel;
}

function RadioDot({ on }: { on: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.radio,
        { borderColor: on ? colors.accent : colors.borderStrong, backgroundColor: on ? colors.accent : 'transparent' },
      ]}
    />
  );
}

/**
 * Category model panel: providers first (grouped), then every cached model
 * per provider with the active one ticked. "Manage" shortcuts at the bottom.
 */
export function ModelSheet({ visible, onClose, onPicked, current }: ModelSheetProps) {
  const { colors } = useTheme();
  const profiles = useSettingsStore((s) => s.profiles);
  const modelCache = useSettingsStore((s) => s.modelCache);
  const setActiveModel = useSettingsStore((s) => s.setActiveModel);
  const cacheModels = useSettingsStore((s) => s.cacheModels);

  const [loadingProfile, setLoadingProfile] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      for (const p of profiles) {
        if (cancelled) return;
        if (modelCache[p.id]?.models?.length) continue;
        if (!p.baseUrl) continue;
        setLoadingProfile(p.id);
        const res = await listRemoteModels(p);
        if (cancelled) return;
        if (res.models.length) cacheModels(p.id, res.models);
        setLoadingProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, profiles.length]);

  const pick = useCallback(
    (m: ActiveModel) => {
      haptics.success();
      setActiveModel(m);
      onPicked?.(m);
      onClose();
    },
    [onClose, onPicked, setActiveModel]
  );

  const capsIcon = (profileId: string): keyof typeof Ionicons.glyphMap => {
    const preset = PROVIDER_PRESETS.find((x) => x.baseUrl === profiles.find((p) => p.id === profileId)?.baseUrl);
    if (preset?.caps?.includes('reasoning')) return 'sparkles';
    if (preset?.caps?.includes('tools')) return 'hammer-outline';
    return 'cloud-outline';
  };

  const sectionLabel = (text: string) => (
    <Text
      style={{
        color: colors.textFaint,
        fontSize: 11.5,
        fontWeight: '700',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        marginTop: spacing(4),
        marginBottom: spacing(1),
        paddingHorizontal: spacing(1),
      }}
    >
      {text}
    </Text>
  );

  const isCurrent = (profileId: string, model: string) =>
    current?.kind === 'remote' && current.profileId === profileId && current.model === model;

  const active = selectActiveProfile(useSettingsStore.getState());

  return (
    <Sheet visible={visible} onClose={onClose} title="Models" maxHeight="82%">
      <ScrollView keyboardShouldPersistTaps="handled" style={{ paddingHorizontal: spacing(4) }}>
        {profiles.length === 0 ? (
          <PressableScale haptic="light" onPress={() => { onClose(); router.push('/settings/api'); }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: colors.surface2,
                borderRadius: radius.md,
                padding: spacing(3),
                marginBottom: spacing(1),
              }}
            >
              <Ionicons name="key-outline" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Connect a provider</Text>
                <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>
                  Gemini’s free tier, OpenRouter, Groq, OpenAI, Claude, Ollama — your keys, stored on-device.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </View>
          </PressableScale>
        ) : (
          <>
            {sectionLabel('Providers')}
            {profiles.map((p) => (
              <View key={p.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing(1), paddingTop: spacing(2), paddingBottom: spacing(1) }}>
                  <Ionicons name={capsIcon(p.id) as never} size={13} color={colors.textFaint} />
                  <Text style={{ color: colors.textSub, fontSize: 12.5, fontWeight: '700', flex: 1 }}>{p.name}</Text>
                  {p.id === useSettingsStore.getState().activeProfileId ? (
                    <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: colors.accent, fontSize: 10.5, fontWeight: '800' }}>DEFAULT</Text>
                    </View>
                  ) : null}
                </View>
                {(modelCache[p.id]?.models?.length ? modelCache[p.id].models.slice(0, 60) : (p.suggestedModels ?? [])).map((m) => (
                  <PressableScale key={`${p.id}::${m}`} haptic="selection" scale={0.98} opacityOnPress={0.8} onPress={() => pick({ kind: 'remote', profileId: p.id, model: m })}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: spacing(2.4),
                        paddingHorizontal: spacing(1),
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <Ionicons name="cube-outline" size={15} color={isCurrent(p.id, m) ? colors.accent : colors.textFaint} />
                      <Text
                        numberOfLines={1}
                        style={{
                          color: isCurrent(p.id, m) ? colors.accent : colors.text,
                          fontSize: 14.5,
                          fontWeight: isCurrent(p.id, m) ? '700' : '500',
                          flex: 1,
                        }}
                      >
                        {m}
                      </Text>
                      <RadioDot on={isCurrent(p.id, m)} />
                    </View>
                  </PressableScale>
                ))}
                {loadingProfile === p.id ? (
                  <Text style={{ color: colors.textFaint, fontSize: 12, padding: spacing(2) }}>Fetching models…</Text>
                ) : null}
              </View>
            ))}
          </>
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing(3), marginBottom: spacing(2) }}>
          <PressableScale haptic="light" style={{ flex: 1 }} onPress={() => { onClose(); router.push('/providers'); }}>
            <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing(2.6), alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>Manage providers</Text>
            </View>
          </PressableScale>
          <PressableScale haptic="light" style={{ flex: 1 }} onPress={() => { onClose(); router.push('/settings/agent'); }}>
            <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing(2.6), alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>Agent & storage</Text>
            </View>
          </PressableScale>
        </View>

        {Platform.OS === 'web' || !active ? null : (
          <Text style={{ color: colors.textFaint, fontSize: 11.5, textAlign: 'center', marginBottom: spacing(3), paddingHorizontal: spacing(2) }}>
            Tool calling requires a tool-capable model (Claude, GPT, Gemini, Grok, DeepSeek…).
          </Text>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
});
