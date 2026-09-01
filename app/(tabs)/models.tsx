import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { useSettingsStore, type ActiveModel } from '@/src/store/settings';
import { LOCAL_CATALOG, type CatalogModel } from '@/src/ai/local/catalog';
import {
  cancelDownload,
  deleteModelFile,
  downloadModelFile,
  DownloadCancelled,
  freeDiskBytes,
} from '@/src/ai/local/fs';
import { PROVIDER_PRESETS } from '@/src/ai/remote';
import { ModelSheet } from '@/src/components/ModelSheet';
import { PressableScale } from '@/src/components/PressableScale';
import { Banner, Button, Card, Chip, SectionHeader, TextField } from '@/src/components/ui';
import { Sheet } from '@/src/components/Sheet';
import { haptics } from '@/src/utils/haptics';
import { formatBytes } from '@/src/utils/format';

interface DownloadState {
  received: number;
  total: number;
}

function ProgressTrack({ fraction, color, track }: { fraction: number; color: string; track: string }) {
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(fraction * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

export default function ModelsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const localModels = useSettingsStore((s) => s.localModels);
  const addLocalModel = useSettingsStore((s) => s.addLocalModel);
  const removeLocalModel = useSettingsStore((s) => s.removeLocalModel);
  const activeModel = useSettingsStore((s) => s.activeModel);
  const setActiveModel = useSettingsStore((s) => s.setActiveModel);

  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [free, setFree] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [customBusy, setCustomBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNative = Platform.OS !== 'web';

  useEffect(() => {
    if (!isNative) return;
    freeDiskBytes().then(setFree).catch(() => setFree(null));
  }, [isNative, localModels.length]);

  const downloadedById = useCallback((id: string) => localModels.find((m) => m.id === id), [localModels]);

  const startDownload = useCallback(
    async (model: { id: string; name: string; url: string; sizeBytes: number }, label: string) => {
      setError(null);
      if (free !== null && Number.isFinite(free) && free < model.sizeBytes * 1.15) {
        setError(`Not enough free space for ${label} (${formatBytes(model.sizeBytes)} needed).`);
        return;
      }
      haptics.medium();
      setDownloads((d) => ({ ...d, [model.id]: { received: 0, total: model.sizeBytes } }));
      try {
        const { fileUri, size } = await downloadModelFile(model.id, model.url, (p) => {
          setDownloads((d) => ({ ...d, [model.id]: { received: p.received, total: p.total || model.sizeBytes } }));
        });
        addLocalModel({ id: model.id, name: label, fileUri, sizeBytes: size, url: model.url, downloadedAt: Date.now() });
        haptics.success();
        Alert.alert('Model ready', `${label} was downloaded and set as the active model. It now works fully offline.`, [
          { text: 'Chat now', onPress: () => router.push('/') },
          { text: 'OK' },
        ]);
        setActiveModel({ kind: 'local', modelId: model.id });
      } catch (e) {
        if (e instanceof DownloadCancelled) {
          haptics.light();
        } else {
          setError(`Download failed: ${(e as Error).message}`);
          haptics.error();
        }
      } finally {
        setDownloads((d) => {
          const { [model.id]: _drop, ...rest } = d;
          return rest;
        });
      }
    },
    [addLocalModel, free, setActiveModel]
  );

  const confirmDelete = (id: string, name: string, fileUri: string) => {
    Alert.alert('Delete model?', `${name} will be removed from this device to free space.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          haptics.warning();
          deleteModelFile(fileUri).catch(() => {});
          removeLocalModel(id);
        },
      },
    ]);
  };

  const activeLabel = () => {
    const state = useSettingsStore.getState();
    if (!activeModel) return 'None selected';
    if (activeModel.kind === 'local') return state.localModels.find((m) => m.id === activeModel.modelId)?.name ?? 'On-device';
    return activeModel.model || 'API model';
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing(4), paddingTop: insets.top + spacing(4), paddingBottom: spacing(14) }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginBottom: spacing(1) }}>
          Models
        </Text>
        <Text style={{ color: colors.textSub, fontSize: 14, marginBottom: spacing(4) }}>
          Hybrid engine — run models entirely on this device, or connect any OpenAI-compatible API.
        </Text>

        {/* active engine */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={activeModel?.kind === 'local' ? 'hardware-chip' : activeModel ? 'cloud' : 'help-outline'} size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
                Active engine
              </Text>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 2 }}>
                {activeLabel()}
              </Text>
            </View>
            <PressableScale haptic="light" onPress={() => setPickerOpen(true)}>
              <View style={{ backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: spacing(3), paddingVertical: spacing(2) }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Change</Text>
              </View>
            </PressableScale>
          </View>
        </Card>

        {error ? <Banner kind="error" text={error} onClose={() => setError(null)} /> : null}

        {/* on-device */}
        {isNative ? (
          <>
            <SectionHeader title="On-device · offline" action={<Text style={{ color: colors.textFaint, fontSize: 11.5 }}>{free !== null && Number.isFinite(free) ? `${formatBytes(free)} free` : ''}</Text>} />
            {LOCAL_CATALOG.map((m) => {
              const rec = downloadedById(m.id);
              const dl = downloads[m.id];
              const fraction = dl && dl.total > 0 ? Math.min(1, dl.received / dl.total) : 0;
              return (
                <Card key={m.id} style={{ marginBottom: spacing(2.5) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing(3) }}>
                    <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="hardware-chip-outline" size={19} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ color: colors.text, fontSize: 15.5, fontWeight: '700' }}>{m.name}</Text>
                        {m.recommended ? (
                          <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 1.5 }}>
                            <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>RECOMMENDED</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 3 }}>{m.blurb}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing(2), flexWrap: 'wrap' }}>
                        <Chip label={m.params} />
                        <Chip label={m.quant} />
                        <Chip label={formatBytes(m.sizeBytes)} />
                        <Chip label={m.license} />
                      </View>

                      {dl ? (
                        <View style={{ marginTop: spacing(3) }}>
                          <ProgressTrack fraction={fraction} color={colors.accent} track={colors.surface3} />
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(1.5) }}>
                            <Text style={{ color: colors.textSub, fontSize: 12, fontVariant: ['tabular-nums'] as never }}>
                              {formatBytes(dl.received)} / {formatBytes(dl.total)}
                            </Text>
                            <PressableScale haptic="warning" onPress={() => cancelDownload(m.id)}>
                              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
                            </PressableScale>
                          </View>
                        </View>
                      ) : rec ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: spacing(3) }}>
                          <PressableScale
                            haptic="success"
                            onPress={() => setActiveModel({ kind: 'local', modelId: m.id })}
                            style={{ flex: 1 }}
                          >
                            <View
                              style={{
                                backgroundColor: activeModel?.kind === 'local' && activeModel.modelId === m.id ? colors.accentSoft : colors.surface2,
                                borderRadius: radius.md,
                                paddingVertical: spacing(2.2),
                                alignItems: 'center',
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor: activeModel?.kind === 'local' && activeModel.modelId === m.id ? colors.accent : colors.border,
                              }}
                            >
                              <Text style={{ color: activeModel?.kind === 'local' && activeModel.modelId === m.id ? colors.accent : colors.text, fontSize: 13, fontWeight: '700' }}>
                                {activeModel?.kind === 'local' && activeModel.modelId === m.id ? '✓ Active' : 'Use offline'}
                              </Text>
                            </View>
                          </PressableScale>
                          <PressableScale haptic="warning" onPress={() => confirmDelete(m.id, rec.name, rec.fileUri)}>
                            <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="trash-outline" size={17} color={colors.danger} />
                            </View>
                          </PressableScale>
                        </View>
                      ) : (
                        <View style={{ marginTop: spacing(3) }}>
                          <Button label={`Download · ${formatBytes(m.sizeBytes)}`} icon="download-outline" onPress={() => startDownload(m, m.name)} />
                        </View>
                      )}
                    </View>
                  </View>
                </Card>
              );
            })}

            {/* custom GGUF by URL */}
            <SectionHeader title="Bring your own GGUF" />
            <Card>
              <TextField
                label="Direct .gguf URL"
                hint="Any Hugging Face / self-hosted GGUF (chat-tuned instruct models work best)."
                placeholder="https://…/model-Q4_K_M.gguf"
                value={customUrl}
                onChangeText={setCustomUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                label="Download model"
                icon="cloud-download-outline"
                loading={customBusy}
                disabled={!/^https?:\/\//.test(customUrl.trim())}
                onPress={async () => {
                  const url = customUrl.trim();
                  const name = decodeURIComponent(url.split('/').pop() || 'model.gguf').replace(/\.gguf$/i, '');
                  const id = `custom_${Math.abs(hash(url)).toString(36)}`;
                  setCustomBusy(true);
                  await startDownload({ id, name, url, sizeBytes: 1.5 * 1024 * 1024 * 1024 }, name);
                  setCustomBusy(false);
                  setCustomUrl('');
                }}
              />
            </Card>
          </>
        ) : (
          <>
            <SectionHeader title="On-device · offline" />
            <Card>
              <View style={{ flexDirection: 'row', gap: spacing(3), alignItems: 'center' }}>
                <Ionicons name="hardware-chip-outline" size={22} color={colors.textFaint} />
                <Text style={{ color: colors.textSub, fontSize: 13.5, flex: 1 }}>
                  On-device GGUF models run in the native iOS & Android app. The web/PWA build connects to
                  OpenAI-compatible APIs instead.
                </Text>
              </View>
            </Card>
          </>
        )}

        {/* providers */}
        <SectionHeader title="API providers" />
        {PROVIDER_PRESETS.map((p) => (
          <PressableScale
            key={p.id}
            haptic="light"
            scale={0.98}
            onPress={() => router.push({ pathname: '/settings/api', params: { preset: p.id } })}
          >
            <Card style={{ marginBottom: spacing(2) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={p.localNetwork ? 'home-outline' : 'cloud-outline'} size={17} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{p.name}</Text>
                  <Text numberOfLines={2} style={{ color: colors.textSub, fontSize: 12.5, marginTop: 1 }}>
                    {p.note ?? p.baseUrl}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </View>
            </Card>
          </PressableScale>
        ))}

        <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing(3), lineHeight: 18 }}>
          Model files are downloaded from Hugging Face and stored on this device.{'\n'}
          GGUF quantization: Q4_K_M — quality/space sweet spot for phones.
        </Text>
      </ScrollView>

      <ModelSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} current={activeModel} />
    </View>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
