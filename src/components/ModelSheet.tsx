import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme, radius, spacing } from '@/src/theme';
import { Sheet } from '@/src/components/Sheet';
import { PressableScale } from '@/src/components/PressableScale';
import { useSettingsStore, selectActiveProfile, type ActiveModel, type RemoteProfile } from '@/src/store/settings';
import { describeCatalogModel, listRemoteModels, PROVIDER_PRESETS, type ModelCatalogGroup } from '@/src/ai/remote';
import { haptics } from '@/src/utils/haptics';
import { Platform } from 'react-native';

interface ModelSheetProps {
  visible: boolean;
  onClose: () => void;
  onPicked?: (model: ActiveModel) => void;
  current?: ActiveModel;
}

const GROUP_ORDER: ModelCatalogGroup[] = ['Fast & efficient', 'Pro', 'Reasoning', 'Other models'];

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

function AvailabilityBadge({ kind, label }: { kind: 'free' | 'paid' | 'varies' | 'local'; label: string }) {
  const { colors } = useTheme();
  const color = kind === 'free' ? colors.success : kind === 'local' ? colors.accent : kind === 'paid' ? colors.warning : colors.textFaint;
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: kind === 'varies' ? colors.surface3 : `${color}20`, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text numberOfLines={1} style={{ color, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.35 }}>
        {label}
      </Text>
    </View>
  );
}

function providerAvailability(profile: RemoteProfile): string {
  const source = `${profile.name} ${profile.baseUrl}`.toLowerCase();
  if (source.includes('generativelanguage.googleapis.com') || source.includes('gemini')) {
    return 'Gemini’s live list does not include price. Availability depends on this API key’s Google AI Studio quota.';
  }
  if (source.includes('openrouter')) return 'Free/premium status is model-specific; a :free suffix is labeled when the gateway reports it.';
  return 'Model capabilities and billing are owned by the selected provider.';
}

/** A model chooser that is informative without making up account-specific prices. */
export function ModelSheet({ visible, onClose, onPicked, current }: ModelSheetProps) {
  const { colors } = useTheme();
  const profiles = useSettingsStore((s) => s.profiles);
  const modelCache = useSettingsStore((s) => s.modelCache);
  const setActiveModel = useSettingsStore((s) => s.setActiveModel);
  const cacheModels = useSettingsStore((s) => s.cacheModels);
  const updateProfile = useSettingsStore((s) => s.updateProfile);

  const [loadingProfile, setLoadingProfile] = useState<string | null>(null);
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({});
  const [customModels, setCustomModels] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');

  const profileKey = profiles.map((p) => `${p.id}:${p.baseUrl}`).join('|');

  const discoverModels = useCallback(
    async (profile: RemoteProfile) => {
      if (!profile.baseUrl) return;
      setLoadingProfile(profile.id);
      setModelErrors((state) => {
        const next = { ...state };
        delete next[profile.id];
        return next;
      });
      const res = await listRemoteModels(profile);
      setLoadingProfile((state) => (state === profile.id ? null : state));
      if (res.models.length) {
        cacheModels(profile.id, res.models);
        return;
      }
      setModelErrors((state) => ({
        ...state,
        [profile.id]: res.error ?? 'This endpoint did not list any models.',
      }));
    },
    [cacheModels]
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      for (const profile of profiles) {
        if (cancelled || modelCache[profile.id]?.models?.length || !profile.baseUrl) continue;
        await discoverModels(profile);
        if (cancelled) return;
      }
    })();
    return () => { cancelled = true; };
    // modelCache deliberately does not trigger another fetch after caching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, profileKey]);

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const pick = useCallback(
    (model: ActiveModel) => {
      haptics.success();
      setActiveModel(model);
      onPicked?.(model);
      onClose();
    },
    [onClose, onPicked, setActiveModel]
  );

  const useCustomModel = useCallback(
    (profileId: string) => {
      const model = customModels[profileId]?.trim();
      if (!model) return;
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) return;
      updateProfile(profileId, { suggestedModels: [...new Set([...(profile.suggestedModels ?? []), model])] });
      setCustomModels((state) => ({ ...state, [profileId]: '' }));
      pick({ kind: 'remote', profileId, model });
    },
    [customModels, pick, profiles, updateProfile]
  );

  const isCurrent = (profileId: string, model: string) =>
    current?.kind === 'remote' && current.profileId === profileId && current.model === model;

  const active = selectActiveProfile(useSettingsStore.getState());
  const normalizedQuery = query.trim().toLowerCase();

  const sectionLabel = (text: string) => (
    <Text style={{ color: colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginTop: spacing(3.5), marginBottom: spacing(1), paddingHorizontal: spacing(1) }}>
      {text}
    </Text>
  );

  const renderModel = (profile: RemoteProfile, model: string) => {
    const info = describeCatalogModel(profile, model);
    const selected = isCurrent(profile.id, model);
    return (
      <PressableScale key={`${profile.id}::${model}`} haptic="none" scale={0.985} opacityOnPress={0.82} onPress={() => pick({ kind: 'remote', profileId: profile.id, model })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: spacing(2.2), paddingHorizontal: spacing(1), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <Ionicons name={info.group === 'Reasoning' ? 'sparkles-outline' : info.group === 'Fast & efficient' ? 'flash-outline' : 'cube-outline'} size={15} color={selected ? colors.accent : colors.textFaint} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: selected ? colors.accent : colors.text, fontSize: 14.5, fontWeight: selected ? '700' : '600' }}>
              {model}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11.5, marginTop: 2 }}>{info.capability}</Text>
          </View>
          <AvailabilityBadge kind={info.availabilityKind} label={info.availability} />
          <RadioDot on={selected} />
        </View>
      </PressableScale>
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Choose a model" maxHeight="88%">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing(4), paddingBottom: spacing(4) }}>
        {profiles.length === 0 ? (
          <PressableScale haptic="none" onPress={() => { onClose(); router.push('/settings/api'); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing(3), marginTop: spacing(2) }}>
              <Ionicons name="key-outline" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Connect a provider</Text>
                <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>Gemini, OpenRouter, Groq, OpenAI, or a local OpenAI-compatible server.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </View>
          </PressableScale>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing(2), backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: spacing(3) }}>
              <Ionicons name="search" size={15} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search models"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: spacing(2.3) }}
              />
              {query ? <PressableScale haptic="none" onPress={() => setQuery('')}><Ionicons name="close-circle" size={16} color={colors.textFaint} /></PressableScale> : null}
            </View>

            {profiles.map((profile) => {
              const models = [...new Set([...(profile.suggestedModels ?? []), ...(modelCache[profile.id]?.models ?? [])])]
                .filter((model) => !normalizedQuery || model.toLowerCase().includes(normalizedQuery));
              const grouped = GROUP_ORDER.map((group) => ({
                group,
                models: models.filter((model) => describeCatalogModel(profile, model).group === group),
              })).filter((entry) => entry.models.length);

              return (
                <View key={profile.id}>
                  {sectionLabel(profile.name)}
                  <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing(2.5), marginBottom: spacing(1.5) }}>
                    <Text style={{ color: colors.accent, fontSize: 12.5, fontWeight: '800' }}>{models.length ? `${models.length} available models` : 'Discovering models'}</Text>
                    <Text style={{ color: colors.textSub, fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>{providerAvailability(profile)}</Text>
                  </View>

                  {grouped.map(({ group, models: entries }) => (
                    <View key={group}>
                      <Text style={{ color: colors.textSub, fontSize: 11.5, fontWeight: '800', marginTop: spacing(2), marginBottom: spacing(0.5), paddingHorizontal: spacing(1) }}>
                        {group.toUpperCase()} · {entries.length}
                      </Text>
                      {entries.map((model) => renderModel(profile, model))}
                    </View>
                  ))}

                  {loadingProfile === profile.id ? <Text style={{ color: colors.textFaint, fontSize: 12, paddingVertical: spacing(2) }}>Refreshing model list…</Text> : null}
                  {modelErrors[profile.id] ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: spacing(2), paddingHorizontal: spacing(1) }}>
                      <Ionicons name="warning-outline" size={14} color={colors.danger} style={{ marginTop: 1 }} />
                      <Text style={{ flex: 1, color: colors.danger, fontSize: 12, lineHeight: 16 }}>{modelErrors[profile.id]}</Text>
                      <PressableScale haptic="none" scale={0.94} onPress={() => discoverModels(profile)}><Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>Retry</Text></PressableScale>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing(2.5), paddingHorizontal: spacing(1) }}>
                    <TextInput
                      value={customModels[profile.id] ?? ''}
                      onChangeText={(text) => setCustomModels((state) => ({ ...state, [profile.id]: text }))}
                      onSubmitEditing={() => useCustomModel(profile.id)}
                      placeholder="Enter a model ID manually"
                      placeholderTextColor={colors.textFaint}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      style={{ flex: 1, color: colors.text, fontSize: 13.5, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: spacing(2.5), paddingVertical: spacing(2) }}
                    />
                    <PressableScale haptic="none" disabled={!customModels[profile.id]?.trim()} onPress={() => useCustomModel(profile.id)} style={{ opacity: customModels[profile.id]?.trim() ? 1 : 0.45 }}>
                      <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(2.2) }}><Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Use</Text></View>
                    </PressableScale>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing(4) }}>
          <PressableScale haptic="none" style={{ flex: 1 }} onPress={() => { onClose(); router.push('/providers'); }}>
            <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing(2.6), alignItems: 'center' }}><Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>Manage providers</Text></View>
          </PressableScale>
          <PressableScale haptic="none" style={{ flex: 1 }} onPress={() => { onClose(); router.push('/settings/agent'); }}>
            <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing(2.6), alignItems: 'center' }}><Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>Agent & storage</Text></View>
          </PressableScale>
        </View>
        {Platform.OS === 'web' || !active ? null : <Text style={{ color: colors.textFaint, fontSize: 11.5, textAlign: 'center', marginTop: spacing(3), paddingHorizontal: spacing(2) }}>Enable Agent mode only when you want tools and multi-step file work. Normal chat stays direct.</Text>}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
});
