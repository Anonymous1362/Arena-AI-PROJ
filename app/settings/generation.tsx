import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, spacing } from '@/src/theme';
import { useSettingsStore } from '@/src/store/settings';
import { AppHeader } from '@/src/components/AppHeader';
import { Button, Card, Chip, SectionHeader, Stepper, TextField } from '@/src/components/ui';

const TEMP_PRESETS = [
  { label: 'Precise', value: 0.2, icon: 'checkmark-circle-outline' as const },
  { label: 'Balanced', value: 0.7, icon: 'scale-outline' as const },
  { label: 'Creative', value: 1.0, icon: 'color-wand-outline' as const },
];

export default function GenerationSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const generation = useSettingsStore((s) => s.generation);
  const patch = useSettingsStore((s) => s.patchGeneration);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Generation" subtitle="How the AI writes" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          label="PERSONAL INSTRUCTIONS"
          hint="Extra instructions layered on top of the agent behavior."
          placeholder="You are a helpful assistant…"
          value={generation.systemPrompt}
          onChangeText={(t) => patch({ systemPrompt: t })}
          multiline
          style={{ textAlignVertical: 'top', minHeight: 90 }}
        />

        <SectionHeader title="Creativity" />
        <Card>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {TEMP_PRESETS.map((p) => (
              <Chip
                key={p.label}
                label={p.label}
                icon={p.icon}
                selected={Math.abs(generation.temperature - p.value) < 0.03}
                onPress={() => patch({ temperature: p.value })}
              />
            ))}
          </View>
          <Stepper
            label="Temperature"
            hint="Higher = more random & creative."
            value={generation.temperature}
            step={0.05}
            min={0}
            max={2}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patch({ temperature: v })}
          />
          <Stepper
            label="Top P"
            hint="Nucleus sampling cutoff."
            value={generation.topP}
            step={0.05}
            min={0.1}
            max={1}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patch({ topP: v })}
          />
        </Card>

        <SectionHeader title="Limits" />
        <Card>
          <Stepper
            label="Max reply tokens"
            hint="Hard cap per assistant reply."
            value={generation.maxTokens}
            step={128}
            min={128}
            max={8192}
            onChange={(v) => patch({ maxTokens: v })}
          />
        </Card>

        <Button
          label="Reset to defaults"
          variant="ghost"
          icon="refresh-outline"
          style={{ marginTop: spacing(4) }}
          onPress={() =>
            patch({
              temperature: 0.7,
              topP: 0.95,
              maxTokens: 4096,
              systemPrompt: '',
            })
          }
        />
      </ScrollView>
    </View>
  );
}
