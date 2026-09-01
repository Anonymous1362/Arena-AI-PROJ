import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';

const SUGGESTIONS = [
  { icon: 'sparkles-outline' as const, text: 'Explain quantum computing like I’m five' },
  { icon: 'code-slash-outline' as const, text: 'Write a Python script to rename files by date' },
  { icon: 'create-outline' as const, text: 'Help me draft a polite deadline-extension email' },
  { icon: 'bulb-outline' as const, text: 'Brainstorm names for a coffee shop' },
];

export function EmptyState({ onPick, engineReady }: { onPick: (text: string) => void; engineReady: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.orbShadow}>
        <LinearGradient
          colors={[colors.userBubbleFrom, colors.userBubbleTo, colors.accent2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.orb}
        >
          <Ionicons name="sparkles" size={34} color="#FFFFFF" />
        </LinearGradient>
      </View>
      <Text style={[styles.headline, { color: colors.text }]}>How can I help?</Text>
      <Text style={[styles.sub, { color: colors.textSub }]}>
        {engineReady
          ? 'Pick a suggestion or just start typing.'
          : 'Choose an on-device model or connect an API to begin.'}
      </Text>
      <View style={{ alignSelf: 'stretch', gap: spacing(2), marginTop: spacing(6) }}>
        {SUGGESTIONS.map((s) => (
          <PressableScale key={s.text} haptic="light" scale={0.98} onPress={() => onPick(s.text)}>
            <View
              style={[
                styles.chip,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={[styles.chipIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name={s.icon} size={15} color={colors.accent} />
              </View>
              <Text numberOfLines={2} style={{ color: colors.textSub, fontSize: 13.5, flex: 1, fontWeight: '500' }}>
                {s.text}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
            </View>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(14),
  },
  orbShadow: {
    borderRadius: radius.full,
    marginBottom: spacing(5),
  },
  orb: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  sub: { fontSize: 14.5, marginTop: spacing(1.5), textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing(3),
  },
  chipIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
