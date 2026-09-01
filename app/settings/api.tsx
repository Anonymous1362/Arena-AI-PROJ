import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useSettingsStore, type RemoteProfile } from '@/src/store/settings';
import { PROVIDER_PRESETS, testRemoteProfile } from '@/src/ai/remote';
import { AppHeader } from '@/src/components/AppHeader';
import { PressableScale } from '@/src/components/PressableScale';
import { Sheet } from '@/src/components/Sheet';
import { Banner, Button, Card, Chip, TextField } from '@/src/components/ui';
import { haptics } from '@/src/utils/haptics';

function Editor({
  existing,
  presetId,
  onDone,
}: {
  existing?: RemoteProfile | null;
  presetId?: string;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const preset = useMemo(() => PROVIDER_PRESETS.find((p) => p.id === presetId) ?? null, [presetId]);

  const [name, setName] = useState(existing?.name ?? preset?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? preset?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const addProfile = useSettingsStore((s) => s.addProfile);
  const updateProfile = useSettingsStore((s) => s.updateProfile);
  const removeProfile = useSettingsStore((s) => s.removeProfile);
  const setActiveProfile = useSettingsStore((s) => s.setActiveProfile);
  const setActiveModel = useSettingsStore((s) => s.setActiveModel);

  const save = () => {
    if (!name.trim() || !baseUrl.trim()) {
      setTestResult({ ok: false, msg: 'Name and base URL are required.' });
      return;
    }
    if (existing) {
      updateProfile(existing.id, { name: name.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
      haptics.success();
    } else {
      const id = addProfile({
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        suggestedModels: preset?.suggestedModels,
      });
      setActiveProfile(id);
    }
    onDone();
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testRemoteProfile({
      id: existing?.id ?? 'draft',
      name,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
    });
    setTestResult(res.ok ? { ok: true, msg: `Connected — ${res.models?.length ?? 0} models available.` } : { ok: false, msg: res.error ?? 'Connection failed.' });
    if (res.ok) haptics.success(); else haptics.error();
    setTesting(false);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: spacing(10) }} keyboardShouldPersistTaps="handled">
      {preset?.keyUrl ? (
        <Banner kind="info" text={`Get a key at ${preset.keyUrl}`} />
      ) : null}
      {preset?.note ? <Banner kind="info" text={preset.note} /> : null}

      <TextField label="Display name" placeholder="e.g. My OpenAI" value={name} onChangeText={setName} />
      <TextField
        label="Base URL"
        placeholder="https://api.example.com/v1"
        value={baseUrl}
        onChangeText={setBaseUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        hint="/v1 is appended automatically if missing."
      />
      <TextField
        label={preset?.noKey ? 'API key (optional)' : 'API key'}
        placeholder={preset?.noKey ? 'Not required for local servers' : 'sk-…'}
        value={apiKey}
        onChangeText={setApiKey}
        secure
        autoCapitalize="none"
        autoCorrect={false}
      />

      {preset?.suggestedModels?.length ? (
        <View style={{ marginBottom: spacing(4) }}>
          <Text style={{ color: colors.textSub, fontSize: 13, fontWeight: '600', marginBottom: spacing(2), letterSpacing: 0.3 }}>
            SUGGESTED MODELS
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>
            {preset.suggestedModels.map((m) => (
              <Chip key={m} label={m} icon="cube-outline" />
            ))}
          </View>
          <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: spacing(1.5) }}>
            Pick a model from the model sheet in chat — it also lists live models from /v1/models.
          </Text>
        </View>
      ) : null}

      {testResult ? <Banner kind={testResult.ok ? 'success' : 'error'} text={testResult.msg} /> : null}

      <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(2) }}>
        <Button label="Test" variant="secondary" icon="pulse-outline" loading={testing} onPress={test} style={{ flex: 1 }} />
        <Button label={existing ? 'Save' : 'Add'} icon="checkmark" onPress={save} style={{ flex: 1 }} />
      </View>

      {existing ? (
        <Button
          label="Delete provider"
          variant="danger"
          icon="trash-outline"
          style={{ marginTop: spacing(3) }}
          onPress={() => {
            Alert.alert('Delete provider?', `${existing.name} will be removed.`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  haptics.warning();
                  removeProfile(existing.id);
                  onDone();
                },
              },
            ]);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

export default function ApiSettingsScreen() {
  const params = useLocalSearchParams<{ preset?: string; edit?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const profiles = useSettingsStore((s) => s.profiles);
  const activeProfileId = useSettingsStore((s) => s.activeProfileId);
  const setActiveProfile = useSettingsStore((s) => s.setActiveProfile);
  const setActiveModel = useSettingsStore((s) => s.setActiveModel);

  const [editing, setEditing] = useState<RemoteProfile | null>(
    params.edit ? profiles.find((p) => p.id === params.edit) ?? null : null
  );
  const [creatingPreset, setCreatingPreset] = useState<string | null>(params.preset ?? null);
  const [presetSheet, setPresetSheet] = useState(false);

  const activePreset = PROVIDER_PRESETS.find((p) => p.id === (creatingPreset ?? ''));

  if (editing || creatingPreset) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppHeader
          title={editing ? 'Edit provider' : 'Add provider'}
          onBack={() => {
            setEditing(null);
            setCreatingPreset(null);
          }}
        />
        <Editor
          key={editing?.id ?? creatingPreset ?? 'new'}
          existing={editing}
          presetId={creatingPreset ?? undefined}
          onDone={() => {
            setEditing(null);
            setCreatingPreset(null);
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="API providers" subtitle="Your keys never leave this device" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}>
        {profiles.length === 0 ? (
          <Card>
            <Text style={{ color: colors.textSub, fontSize: 14, lineHeight: 20 }}>
              No providers yet. Add an OpenAI-compatible endpoint — cloud APIs with your own keys, or local
              servers on your network like Ollama and LM Studio.
            </Text>
          </Card>
        ) : (
          profiles.map((p) => {
            const active = p.id === activeProfileId;
            return (
              <Card key={p.id} style={{ marginBottom: spacing(2.5) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
                  <PressableScale
                    haptic="success"
                    onPress={() => {
                      setActiveProfile(p.id);
                      setActiveModel(null);
                    }}
                    scale={0.9}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 2,
                        borderColor: active ? colors.accent : colors.borderStrong,
                        backgroundColor: active ? colors.accent : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active ? <Ionicons name="checkmark" size={13} color={colors.onAccent} /> : null}
                    </View>
                  </PressableScale>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15.5, fontWeight: '700' }}>{p.name}</Text>
                    <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 1 }}>
                      {p.baseUrl}
                    </Text>
                  </View>
                  <PressableScale haptic="light" onPress={() => setEditing(p)} scale={0.9}>
                    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="pencil" size={16} color={colors.text} />
                    </View>
                  </PressableScale>
                </View>
              </Card>
            );
          })
        )}

        <Button label="Add provider" icon="add" onPress={() => setPresetSheet(true)} style={{ marginTop: spacing(2) }} />

        <Text style={{ color: colors.textFaint, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: spacing(4) }}>
          Works with anything speaking the OpenAI Chat Completions protocol:{'\n'}
          vLLM · LiteLLM · Jan · llama.cpp · TGI · Azure OpenAI gateways
        </Text>
      </ScrollView>

      <Sheet visible={presetSheet} onClose={() => setPresetSheet(false)} title="Choose a provider" maxHeight="70%">
        <ScrollView style={{ paddingHorizontal: spacing(4) }} keyboardShouldPersistTaps="handled">
          {PROVIDER_PRESETS.map((p) => (
            <PressableScale
              key={p.id}
              haptic="light"
              scale={0.98}
              onPress={() => {
                setPresetSheet(false);
                setCreatingPreset(p.id);
              }}
            >
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
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{p.name}</Text>
                  {p.note ? (
                    <Text numberOfLines={2} style={{ color: colors.textFaint, fontSize: 12, marginTop: 1 }}>
                      {p.note}
                    </Text>
                  ) : (
                    <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12, marginTop: 1 }}>
                      {p.baseUrl}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      </Sheet>
    </View>
  );
}
