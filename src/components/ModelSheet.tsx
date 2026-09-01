import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme, radius, spacing } from '@/src/theme';
import { Sheet } from '@/src/components/Sheet';
import { PressableScale } from '@/src/components/PressableScale';
import { useSettingsStore, type ActiveModel } from '@/src/store/settings';
import { listRemoteModels } from '@/src/ai/remote';
import { haptics } from '@/src/utils/haptics';
import { Platform } from 'react-native';

interface ModelSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the newly selected model (also updates the global default). */
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

export function ModelSheet({ visible, onClose, onPicked, current }: ModelSheetProps) {
  const { colors } = useTheme();
  const profiles = useSettingsStore((s) => s.profiles);
  const modelCache = useSettingsStore((s) => s.modelCache);
  const localModels = useSettingsStore((s) => s.localModels);
  const setActiveModel = useSettingsStore((s) => s.setActiveModel);
  const cacheModels = useSettingsStore((s) => s.cacheModels);

  const [loadingProfile, setLoadingProfile] = useState<string | null>(null);

  // Lazily fetch each profile's model list the first time the sheet opens.
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

  const Row = ({
    label,
    sub,
    icon,
    selected,
    onPress,
  }: {
    label: string;
    sub?: string;
    icon: keyof typeof Ionicons.glyphMap;
    selected: boolean;
    onPress: () => void;
  }) => (
    <PressableScale haptic="selection" scale={0.98} opacityOnPress={0.8} onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: spacing(2.6),
          paddingHorizontal: spacing(1),
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={16} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>
            {label}
          </Text>
          {sub ? (
            <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12, marginTop: 1 }}>
              {sub}
            </Text>
          ) : null}
        </View>
        <RadioDot on={selected} />
      </View>
    </PressableScale>
  );

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

  const isCurrentLocal = current?.kind === 'local' ? current.modelId : null;
  const isCurrentRemote = current?.kind === 'remote' ? `${current.profileId}::${current.model}` : null;

  return (
    <Sheet visible={visible} onClose={onClose} title="Choose a model" maxHeight="82%">
      <ScrollView keyboardShouldPersistTaps="handled" style={{ paddingHorizontal: spacing(4) }}>
        {Platform.OS !== 'web' ? (
          <>
            {sectionLabel('On-device · fully offline')}
            {localModels.length === 0 ? (
              <PressableScale haptic="light" onPress={() => { onClose(); router.push('/models'); }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    backgroundColor: colors.accentSoft,
                    borderRadius: radius.md,
                    padding: spacing(3),
                    marginBottom: spacing(1),
                  }}
                >
                  <Ionicons name="download-outline" size={18} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Download your first model</Text>
                    <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>
                      Small AI models that run 100% on this device — no internet needed.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </View>
              </PressableScale>
            ) : (
              localModels.map((m) => (
                <Row
                  key={m.id}
                  icon="phone-portrait-outline"
                  label={m.name}
                  sub={`${(m.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB · offline`}
                  selected={isCurrentLocal === m.id}
                  onPress={() => pick({ kind: 'local', modelId: m.id })}
                />
              ))
            )}
          </>
        ) : null}

        {sectionLabel('API providers')}
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
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Connect an API</Text>
                <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>
                  OpenAI, Groq, OpenRouter, Ollama, LM Studio — anything compatible.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </View>
          </PressableScale>
        ) : (
          profiles.map((p) => {
            const cached = modelCache[p.id]?.models ?? [];
            const models = cached.length ? cached : (p.suggestedModels ?? []);
            return (
              <View key={p.id}>
                {models.map((m) => (
                  <Row
                    key={`${p.id}::${m}`}
                    icon="cloud-outline"
                    label={m}
                    sub={p.name}
                    selected={isCurrentRemote === `${p.id}::${m}`}
                    onPress={() => pick({ kind: 'remote', profileId: p.id, model: m })}
                  />
                ))}
                {loadingProfile === p.id ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing(2) }}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={{ color: colors.textFaint, fontSize: 12.5 }}>Fetching models from {p.name}…</Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing(3), marginBottom: spacing(2) }}>
          <PressableScale haptic="light" style={{ flex: 1 }} onPress={() => { onClose(); router.push('/models'); }}>
            <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing(2.6), alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>Manage models</Text>
            </View>
          </PressableScale>
          <PressableScale haptic="light" style={{ flex: 1 }} onPress={() => { onClose(); router.push('/settings/api'); }}>
            <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing(2.6), alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>API settings</Text>
            </View>
          </PressableScale>
        </View>
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
