import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';

export function AppHeader({
  title,
  subtitle,
  onBack,
  right,
  large,
  transparent,
  tint,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  large?: boolean;
  transparent?: boolean;
  /** Section identity colour — gives each settings screen its own hue. */
  tint?: string;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View>
      <View
        style={[
          styles.bar,
          {
            paddingTop: insets.top + 6,
            borderBottomColor: colors.border,
            backgroundColor: transparent
              ? 'transparent'
              : scheme === 'dark'
                ? 'rgba(9,9,12,0.72)'
                : 'rgba(246,246,249,0.8)',
          },
        ]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={50} tint={scheme} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={styles.row}>
          <View style={{ width: 68, alignItems: 'flex-start' }}>
            {onBack ? (
              <PressableScale haptic="light" onPress={onBack} scale={0.9}>
                <View style={[styles.backBtn, { backgroundColor: tint ? `${tint}1A` : colors.surface2 }]}>
                  <Ionicons name="chevron-back" size={22} color={tint ?? colors.text} />
                </View>
              </PressableScale>
            ) : null}
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              style={{
                color: colors.text,
                fontSize: large ? 18 : 16.5,
                fontWeight: '800',
                letterSpacing: -0.2,
              }}
            >
              {title}
            </Text>
            {tint ? <View style={[styles.tintBar, { backgroundColor: tint }]} /> : null}
            {subtitle ? (
              <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12, marginTop: 1 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View style={{ width: 68, alignItems: 'flex-end', paddingRight: spacing(2) }}>{right}</View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: spacing(3),
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tintBar: { width: 26, height: 3, borderRadius: 2, marginTop: 4, opacity: 0.9 },
});
