import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Text, View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing, SECTION_TINTS } from '@/src/theme';
import { Spring, Durations, Ease } from '@/src/theme/motion';
import { SettingsScaffold, TintSection } from '@/src/components/SettingsScaffold';
import { PressableScale } from '@/src/components/PressableScale';
import { Button, Segmented, SwitchRow } from '@/src/components/ui';
import { useSettingsStore, type HapticLevel, type MotionLevel } from '@/src/store/settings';
import { haptic } from '@/src/utils/haptics';

const TINT = SECTION_TINTS.motion;

/** Live preview: replays every curve the app uses, at the chosen level. */
function MotionPreview({ level }: { level: MotionLevel }) {
  const { colors } = useTheme();
  const ball = useSharedValue(0);
  const card = useSharedValue(0);
  const bar = useSharedValue(0);
  const [runId, setRunId] = useState(0);

  const reduced = level === 'reduced';
  const dur = reduced ? 1 : level === 'full' ? Durations.slow : Durations.normal;

  useEffect(() => {
    ball.set(0);
    card.set(0);
    bar.set(0);
    ball.set(withSpring(1, reduced ? { damping: 40, stiffness: 900, mass: 0.6 } : Spring.glide));
    card.set(withTiming(1, { duration: dur, easing: Ease.out }));
    bar.set(withRepeat(withTiming(1, { duration: dur * 2.4, easing: Ease.inOut }), 1, true));
  }, [ball, bar, card, dur, reduced, runId]);

  const ballStyle = useAnimatedStyle(() => ({ transform: [{ translateX: ball.get() * 190 }] }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: card.get(),
    transform: [{ translateY: (1 - card.get()) * 18 }, { scale: 0.94 + card.get() * 0.06 }],
  }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 0.15 + bar.get() * 0.85 }] }));

  return (
    <View>
      <View style={[styles.stage, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <View style={[styles.track, { backgroundColor: colors.surface3 }]}>
          <Animated.View style={[styles.ball, { backgroundColor: colors.accent }, ballStyle]} />
        </View>
        <Animated.View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardStyle]}>
          <Ionicons name="layers-outline" size={16} color={colors.accent} />
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 }}>Sheet entrance</Text>
          <View style={{ width: 74, height: 4, borderRadius: 2, backgroundColor: colors.surface3, overflow: 'hidden' }}>
            <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: colors.accent }, barStyle]} />
          </View>
        </Animated.View>
      </View>
      <Button label="Replay" variant="ghost" icon="play-outline" onPress={() => setRunId((n) => n + 1)} />
    </View>
  );
}

export default function MotionSettingsScreen() {
  const { colors } = useTheme();
  const appearance = useSettingsStore((s) => s.appearance);
  const patchAppearance = useSettingsStore((s) => s.patchAppearance);
  const behavior = useSettingsStore((s) => s.behavior);
  const patchBehavior = useSettingsStore((s) => s.patchBehavior);
  const [lastEvent, setLastEvent] = useState('—');

  const fire = useCallback((name: Parameters<typeof haptic>[0]) => {
    haptic(name);
    setLastEvent(name);
  }, []);

  const events: { name: Parameters<typeof haptic>[0]; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { name: 'tap', label: 'Tap', icon: 'hand-left-outline' },
    { name: 'press', label: 'Press', icon: 'radio-button-on-outline' },
    { name: 'select', label: 'Select', icon: 'checkmark-circle-outline' },
    { name: 'navigate', label: 'Navigate', icon: 'swap-horizontal-outline' },
    { name: 'send', label: 'Send', icon: 'arrow-up-circle-outline' },
    { name: 'success', label: 'Success', icon: 'sparkles-outline' },
    { name: 'warning', label: 'Warning', icon: 'warning-outline' },
    { name: 'error', label: 'Error', icon: 'alert-circle-outline' },
  ];

  return (
    <SettingsScaffold
      title="Motion & haptics"
      subtitle="Feel"
      tint={TINT}
      icon="pulse-outline"
      intro="Everything animates on the UI thread — transform and opacity only, so a 60 Hz phone still reads as butter. Turn it down here if your device struggles or you just prefer calm."
    >
      <TintSection title="Animation" tint={TINT} icon="sparkles-outline">
        <Segmented<MotionLevel>
          options={[
            { value: 'reduced', label: 'Reduced' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'full', label: 'Full' },
          ]}
          value={appearance.motion}
          onChange={(v) => {
            haptic('select');
            patchAppearance({ motion: v });
          }}
        />
        <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: spacing(2.5), lineHeight: 17 }}>
          {appearance.motion === 'reduced'
            ? 'No travel, no stagger — state changes instantly. Matches the OS “Remove animations” setting.'
            : appearance.motion === 'full'
              ? 'Full stagger, parallax and overshoot on sheets and cards.'
              : 'Default. Springs tuned critically damped: fast attack, no bounce.'}
        </Text>
        <View style={{ marginTop: spacing(3) }}>
          <MotionPreview level={appearance.motion} />
        </View>
      </TintSection>

      <TintSection title="Haptics" tint={SECTION_TINTS.agent} icon="phone-portrait-outline" note={`last: ${lastEvent}`}>
        <Segmented<HapticLevel>
          options={[
            { value: 'off', label: 'Off' },
            { value: 'subtle', label: 'Subtle' },
            { value: 'standard', label: 'Standard' },
            { value: 'rich', label: 'Rich' },
          ]}
          value={appearance.haptics}
          onChange={(v) => {
            patchAppearance({ haptics: v });
            if (v !== 'off') setTimeout(() => haptic('select'), 40);
          }}
        />
        <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: spacing(2.5), lineHeight: 17 }}>
          {appearance.haptics === 'off'
            ? 'Never vibrates.'
            : appearance.haptics === 'subtle'
              ? 'Only meaningful events: send, arrival, success, warning, destructive.'
              : appearance.haptics === 'standard'
                ? 'Adds selection, toggles and navigation. Routine taps stay silent — this is the default.'
                : 'Adds a tick on every touch-down. Closest to iOS system apps.'}
        </Text>

        <View style={styles.eventGrid}>
          {events.map((e) => (
            <PressableScale key={e.name} haptic="none" scale={0.94} onPress={() => fire(e.name)}>
              <View style={[styles.eventChip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <Ionicons name={e.icon} size={15} color={colors.accent} />
                <Text style={{ color: colors.textSub, fontSize: 11.5, fontWeight: '700' }}>{e.label}</Text>
              </View>
            </PressableScale>
          ))}
        </View>

        <View style={[styles.note, { backgroundColor: colors.surface3 }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textFaint} />
          <Text style={{ color: colors.textFaint, fontSize: 11.5, flex: 1, lineHeight: 16 }}>
            Duplicate events inside 55 ms are coalesced, so a control that fires twice (a nested pressable inside a
            gesture handler) can never buzz twice. Haptics are disabled on web — browsers have no reliable API.
          </Text>
        </View>
      </TintSection>

      <TintSection title="Launch" tint={SECTION_TINTS.appearance} icon="rocket-outline">
        <SwitchRow
          label="Animated splash"
          hint="Brand beat on cold start: mark springs in, wordmark staggers, layer lifts away."
          value={appearance.splashAnimation}
          onChange={(v) => patchAppearance({ splashAnimation: v })}
        />
      </TintSection>

      <TintSection title="Surfaces" tint={SECTION_TINTS.models} icon="color-filter-outline">
        <SwitchRow
          label="Rich surfaces"
          hint="Blur and translucency on iOS/macOS. Off on Android by default — solid translucency keeps scrolling silky there."
          value={appearance.richSurfaces}
          onChange={(v) => patchAppearance({ richSurfaces: v })}
        />
      </TintSection>

      <TintSection title="Keyboard" tint={SECTION_TINTS.shell} icon="keypad-outline">
        <SwitchRow
          label="Dismiss keyboard on navigation"
          hint="Leaving a chat, switching tabs or opening a sheet hides the keyboard instead of leaving it floating."
          value={behavior.dismissKeyboardOnNavigate}
          onChange={(v) => patchBehavior({ dismissKeyboardOnNavigate: v })}
        />
        <SwitchRow
          label="Auto-focus the composer"
          hint="Open the keyboard as soon as a chat appears."
          value={behavior.autoFocusComposer}
          onChange={(v) => patchBehavior({ autoFocusComposer: v })}
        />
        <SwitchRow
          label="Enter sends (web/PWA)"
          hint="On native, Enter always inserts a newline."
          value={behavior.sendOnEnter}
          onChange={(v) => patchBehavior({ sendOnEnter: v })}
        />
      </TintSection>

      <Text style={{ color: colors.textFaint, fontSize: 11.5, textAlign: 'center', marginTop: spacing(6), lineHeight: 17 }}>
        {Platform.OS === 'android'
          ? 'Android: the composer rides the real IME frame on the UI thread, so the keyboard can never cover it — with or without edge-to-edge.'
          : 'iOS: the composer follows keyboardWillShow, so it moves with the keyboard rather than after it.'}
      </Text>
    </SettingsScaffold>
  );
}

const styles = StyleSheet.create({
  stage: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing(4),
    gap: spacing(4),
    marginBottom: spacing(3),
  },
  track: { height: 34, borderRadius: 17, justifyContent: 'center', paddingHorizontal: 4 },
  ball: { width: 26, height: 26, borderRadius: 13 },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing(3),
  },
  eventGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginTop: spacing(3) },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
  note: { flexDirection: 'row', gap: 8, borderRadius: radius.md, padding: spacing(3), marginTop: spacing(3) },
});
