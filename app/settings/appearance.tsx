import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing, SECTION_TINTS, ACCENTS } from '@/src/theme';
import { SettingsScaffold, TintSection } from '@/src/components/SettingsScaffold';
import { PressableScale } from '@/src/components/PressableScale';
import { Segmented, SwitchRow } from '@/src/components/ui';
import { useSettingsStore, type AccentId } from '@/src/store/settings';
import { haptic } from '@/src/utils/haptics';

const TINT = SECTION_TINTS.appearance;

export default function AppearanceSettingsScreen() {
  const { colors, scheme } = useTheme();
  const appearance = useSettingsStore((s) => s.appearance);
  const patchAppearance = useSettingsStore((s) => s.patchAppearance);
  const behavior = useSettingsStore((s) => s.behavior);
  const patchBehavior = useSettingsStore((s) => s.patchBehavior);

  return (
    <SettingsScaffold
      title="Appearance"
      subtitle="Theme & colour"
      tint={TINT}
      icon="color-palette-outline"
      intro="Six accent families over the same warm ivory / charcoal neutrals, so every screen keeps its identity without turning into a rainbow."
    >
      <TintSection title="Accent" tint={TINT} icon="brush-outline">
        <View style={styles.accentGrid}>
          {ACCENTS.map((a) => {
            const active = a.id === appearance.accent;
            const swatch = a[scheme].accent;
            return (
              <PressableScale
                key={a.id}
                haptic="select"
                scale={0.94}
                onPress={() => {
                  patchAppearance({ accent: a.id as AccentId });
                  setTimeout(() => haptic('success'), 60);
                }}
              >
                <View style={[styles.accentCard, { borderColor: active ? swatch : colors.border, backgroundColor: active ? `${swatch}14` : colors.surface2 }]}>
                  <View style={[styles.swatch, { backgroundColor: swatch }]}>
                    {active ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
                  </View>
                  <Text style={{ color: active ? swatch : colors.textSub, fontSize: 12.5, fontWeight: '800', marginTop: 7 }}>
                    {a.name}
                  </Text>
                  <View style={styles.swatchRow}>
                    <View style={[styles.mini, { backgroundColor: a[scheme].bubble[0] }]} />
                    <View style={[styles.mini, { backgroundColor: a[scheme].bubble[1] }]} />
                    <View style={[styles.mini, { backgroundColor: a[scheme].accent2 }]} />
                  </View>
                </View>
              </PressableScale>
            );
          })}
        </View>
        <Text style={{ color: colors.textFaint, fontSize: 11.5, marginTop: spacing(3), lineHeight: 16 }}>
          Accent drives buttons, the active tab, user bubbles, the tab pill and the section tints across Settings.
        </Text>
      </TintSection>

      <TintSection title="Theme" tint={SECTION_TINTS.models} icon="moon-outline">
        <Segmented
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={appearance.theme}
          onChange={(v) => {
            haptic('select');
            patchAppearance({ theme: v });
          }}
        />
        <View style={styles.previewRow}>
          {(['light', 'dark'] as const).map((s) => (
            <View key={s} style={[styles.preview, { backgroundColor: s === 'light' ? '#F0EEE6' : '#191817', borderColor: colors.border }]}>
              <View style={[styles.previewLine, { backgroundColor: s === 'light' ? 'rgba(31,30,27,0.14)' : 'rgba(240,238,230,0.16)', width: '80%' }]} />
              <View style={[styles.previewLine, { backgroundColor: s === 'light' ? 'rgba(31,30,27,0.10)' : 'rgba(240,238,230,0.10)', width: '55%' }]} />
              <View style={[styles.previewBubble, { backgroundColor: colors.accent }]} />
            </View>
          ))}
        </View>
      </TintSection>

      <TintSection title="Reading" tint={SECTION_TINTS.context} icon="text-outline">
        <Segmented
          options={[
            { value: 's', label: 'Compact' },
            { value: 'm', label: 'Default' },
            { value: 'l', label: 'Large' },
          ]}
          value={appearance.messageTextSize}
          onChange={(v) => patchAppearance({ messageTextSize: v })}
        />
        <View style={[styles.sample, { backgroundColor: colors.surface2 }]}>
          <Text
            style={{
              color: colors.text,
              fontSize: appearance.messageTextSize === 's' ? 14 : appearance.messageTextSize === 'l' ? 17 : 15.5,
              lineHeight: appearance.messageTextSize === 's' ? 20 : appearance.messageTextSize === 'l' ? 25 : 22.5,
            }}
          >
            The agent read three files, ran the test suite, and fixed the failing assertion in auth.spec.ts.
          </Text>
        </View>
      </TintSection>

      <TintSection title="Chat tab" tint={SECTION_TINTS.agent} icon="chatbubbles-outline">
        <SwitchRow
          label="Open straight into a chat"
          hint="The Chat tab shows a live conversation; history lives in the left drawer. Turn off for a list-first tab."
          value={behavior.chatTabIsChat}
          onChange={(v) => patchBehavior({ chatTabIsChat: v })}
        />
        <SwitchRow
          label="Auto-name chats"
          hint="Generate a short title from the first message."
          value={behavior.autoTitle}
          onChange={(v) => patchBehavior({ autoTitle: v })}
        />
      </TintSection>
    </SettingsScaffold>
  );
}

const styles = StyleSheet.create({
  accentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5) },
  accentCard: {
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(2),
  },
  swatch: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swatchRow: { flexDirection: 'row', gap: 4, marginTop: 7 },
  mini: { width: 12, height: 5, borderRadius: 3 },
  previewRow: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(3) },
  preview: { flex: 1, height: 74, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing(3), gap: 6 },
  previewLine: { height: 6, borderRadius: 3 },
  previewBubble: { width: 44, height: 16, borderRadius: 8, alignSelf: 'flex-end', marginTop: 4 },
  sample: { borderRadius: radius.md, padding: spacing(3.5), marginTop: spacing(3) },
});
