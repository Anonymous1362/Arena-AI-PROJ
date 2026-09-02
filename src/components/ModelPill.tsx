import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChevronDown } from '@/src/components/Icons';
import { useTheme, radius, spacing } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';
import type { ActiveModel } from '@/src/store/settings';
import { useSettingsStore } from '@/src/store/settings';

function resolveLabel(model: ActiveModel): { label: string; icon: keyof typeof Ionicons.glyphMap } {
  const state = useSettingsStore.getState();
  if (!model) return { label: 'Pick a model', icon: 'help-circle-outline' };
  const profile = state.profiles.find((p) => p.id === model.profileId);
  return { label: model.model || profile?.name || 'API', icon: 'cloud-outline' };
}

/** Compact engine selector shown in headers. */
export function ModelPill({ model, onPress }: { model: ActiveModel; onPress: () => void }) {
  const { colors } = useTheme();
  const { label, icon } = resolveLabel(model);
  return (
    <PressableScale haptic="selection" onPress={onPress} scale={0.95}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.surface2,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name={icon} size={13} color={colors.accent} />
        <Text numberOfLines={1} style={{ color: colors.textSub, fontSize: 12.5, fontWeight: '700', maxWidth: 170 }}>
          {label}
        </Text>
        <ChevronDown size={13} color={colors.textFaint} strokeWidth={2.2} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(2.6),
    paddingVertical: spacing(1.4),
    maxWidth: 240,
  },
});
