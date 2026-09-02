import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing } from '@/src/theme';
import { isReducedMotion } from '@/src/theme/motion';
import { AppHeader } from '@/src/components/AppHeader';
import { Card } from '@/src/components/ui';

/**
 * Shared chrome for every settings screen: tinted header, safe scroll padding,
 * staggered section entrance and a consistent "identity tile" so no two
 * sections look like the same grey card.
 */
export function SettingsScaffold({
  title,
  subtitle,
  tint,
  icon,
  intro,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  tint: string;
  icon: keyof typeof Ionicons.glyphMap;
  intro?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduced = isReducedMotion();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={title} subtitle={subtitle} tint={tint} onBack={() => router.back()} right={right} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(10) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(260).delay(20)}>
          <View style={[styles.hero, { backgroundColor: `${tint}14`, borderColor: `${tint}33` }]}>
            <View style={[styles.heroIcon, { backgroundColor: `${tint}26` }]}>
              <Ionicons name={icon} size={22} color={tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 }}>{title}</Text>
              {intro ? <Text style={{ color: colors.textSub, fontSize: 12.5, marginTop: 3, lineHeight: 18 }}>{intro}</Text> : null}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(300).delay(90)}>{children}</Animated.View>
      </ScrollView>
    </View>
  );
}

/** A section card with a coloured heading strip. */
export function TintSection({
  title,
  tint,
  icon,
  note,
  children,
  style,
}: {
  title: string;
  tint: string;
  icon?: keyof typeof Ionicons.glyphMap;
  note?: string;
  children: React.ReactNode;
  style?: object;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: spacing(5) }}>
      <View style={styles.sectionRow}>
        {icon ? (
          <View style={[styles.sectionDot, { backgroundColor: `${tint}22` }]}>
            <Ionicons name={icon} size={13} color={tint} />
          </View>
        ) : (
          <View style={[styles.sectionDot, { backgroundColor: tint }]} />
        )}
        <Text style={[styles.sectionTitle, { color: colors.textSub }]}>{title}</Text>
        {note ? <Text style={{ color: colors.textFaint, fontSize: 11.5 }}>{note}</Text> : null}
      </View>
      <Card style={[{ borderLeftWidth: 2.5, borderLeftColor: tint }, style]}>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing(4),
    marginTop: spacing(3),
  },
  heroIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing(1), marginBottom: spacing(2) },
  sectionDot: { width: 20, height: 20, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', flex: 1 },
});
