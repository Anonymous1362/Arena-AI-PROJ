import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, spacing } from '@/src/theme';
import { useSettingsStore } from '@/src/store/settings';
import { AppHeader } from '@/src/components/AppHeader';
import { Card, SectionHeader, Segmented, SwitchRow } from '@/src/components/ui';

export default function AppearanceSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const appearance = useSettingsStore((s) => s.appearance);
  const patchAppearance = useSettingsStore((s) => s.patchAppearance);
  const behavior = useSettingsStore((s) => s.behavior);
  const patchBehavior = useSettingsStore((s) => s.patchBehavior);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Appearance" subtitle="Make it yours" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}>
        <SectionHeader title="Theme" />
        <Card>
          <Segmented
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            value={appearance.theme}
            onChange={(v) => patchAppearance({ theme: v })}
          />
        </Card>

        <SectionHeader title="Reading" />
        <Card>
          <Segmented
            options={[
              { value: 's', label: 'Compact' },
              { value: 'm', label: 'Default' },
              { value: 'l', label: 'Large' },
            ]}
            value={appearance.messageTextSize}
            onChange={(v) => patchAppearance({ messageTextSize: v })}
          />
        </Card>

        <SectionHeader title="Feel" />
        <Card>
          <SwitchRow
            label="Haptics"
            hint="Subtle taps on send, selection & long-press."
            value={appearance.hapticsEnabled}
            onChange={(v) => patchAppearance({ hapticsEnabled: v })}
          />
          <SwitchRow
            label="Enter to send"
            hint="Web/PWA only: submit with the Enter key."
            value={behavior.sendOnEnter}
            onChange={(v) => patchBehavior({ sendOnEnter: v })}
          />
          <SwitchRow
            label="Auto-name chats"
            hint="Generate a short title from the first message."
            value={behavior.autoTitle}
            onChange={(v) => patchBehavior({ autoTitle: v })}
          />
        </Card>
      </ScrollView>
    </View>
  );
}
