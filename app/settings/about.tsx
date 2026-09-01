import React from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND, useTheme, radius, spacing } from '@/src/theme';
import { AppHeader } from '@/src/components/AppHeader';
import { Card } from '@/src/components/ui';
import { PressableScale } from '@/src/components/PressableScale';

export default function AboutScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="About" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}>
        <View style={{ alignItems: 'center', marginBottom: spacing(5) }}>
          <LinearGradient
            colors={[colors.userBubbleFrom, colors.userBubbleTo, colors.accent2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 84, height: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) }}
          >
            <Ionicons name="sparkles" size={34} color="#FFF" />
          </LinearGradient>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>{BRAND.name}</Text>
          <Text style={{ color: colors.textSub, fontSize: 13.5, marginTop: spacing(1) }}>{BRAND.tagline}</Text>
          <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: spacing(2) }}>
            Version {version} · React Native + Expo · llama.cpp
          </Text>
        </View>

        <Card>
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '700', marginBottom: spacing(2) }}>
            Inside the app
          </Text>
          {[
            ['hardware-chip-outline', 'On-device GGUF inference (llama.cpp)'],
            ['cloud-outline', 'Any OpenAI-compatible API, streaming'],
            ['sparkles-outline', 'Reasoning-model support (<think>)'],
            ['lock-closed', 'Zero telemetry, zero accounts'],
            ['document-outline', 'Markdown + copyable code blocks'],
          ].map(([icon, text]) => (
            <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
              <Ionicons name={icon as never} size={15} color={colors.accent} />
              <Text style={{ color: colors.textSub, fontSize: 13.5, flex: 1 }}>{text}</Text>
            </View>
          ))}
        </Card>

        <Card style={{ marginTop: spacing(4) }}>
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '700', marginBottom: spacing(2) }}>
            Open source
          </Text>
          <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 19 }}>
            Built with React Native, Expo, Reanimated, Gesture Handler, Zustand, llama.rn (llama.cpp by
            Georgi Gerganov & contributors), and the open-weight model community. Local model licenses are
            listed on each model card.
          </Text>
          <PressableScale
            haptic="light"
            onPress={() => Linking.openURL('https://github.com/Anonymous1362/Arena-AI-PROJ')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing(3) }}>
              <Ionicons name="logo-github" size={17} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Project repository</Text>
            </View>
          </PressableScale>
        </Card>

        <Text style={{ color: colors.textFaint, fontSize: 11.5, textAlign: 'center', marginTop: spacing(5), lineHeight: 17 }}>
          Made for people who want AI that respects them.{'\n'}Your device, your models, your data.
        </Text>
      </ScrollView>
    </View>
  );
}
