import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SystemUI from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemeProvider, useTheme } from '@/src/theme';
import { Spring, Timing } from '@/src/theme/motion';
import { Asterisk } from '@/src/components/Icons';

// Keep the native splash up until our JS overlay has painted, so the switch
// between the two is invisible. No-op on web.
SplashScreen.preventAutoHideAsync().catch(() => {});

/* ------------------------------- splash overlay ----------------------------- */

function SplashOverlay() {
  const { colors } = useTheme();
  const [done, setDone] = useState(false);

  const logoScale = useSharedValue(0.5);
  const logoOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);
  const wordY = useSharedValue(14);
  const wordOpacity = useSharedValue(0);
  const tagY = useSharedValue(10);
  const tagOpacity = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const overlayScale = useSharedValue(1);

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // 1) Hide the native splash the moment this overlay is on screen.
    SplashScreen.hideAsync().catch(() => {});

    // 2) Orchestrated entrance — all on the UI thread.
    logoOpacity.set(withTiming(1, { duration: 60 }));
    logoScale.set(withSpring(1, Spring.bouncy));
    ringOpacity.set(withTiming(1, { duration: 120 }));
    ringScale.set(withSpring(1.9, { damping: 22, stiffness: 130, mass: 1 }));

    const wordTimer = setTimeout(() => {
      wordOpacity.set(Timing.normal(1));
      wordY.set(withSpring(0, Spring.gentle));
    }, 320);
    const tagTimer = setTimeout(() => {
      tagOpacity.set(Timing.normal(1));
      tagY.set(withSpring(0, Spring.gentle));
    }, 430);

    // 3) Dissolve out, then unmount so the app is fully interactive.
    const exitTimer = setTimeout(() => {
      overlayScale.set(withSpring(1.06, Spring.soft));
      overlayOpacity.set(
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.cubic) }, () => {
          runOnJS(setDone)(true);
        })
      );
    }, Platform.OS === 'web' ? 950 : 1250);

    return () => {
      clearTimeout(wordTimer);
      clearTimeout(tagTimer);
      clearTimeout(exitTimer);
    };
  }, [logoOpacity, logoScale, ringOpacity, ringScale, wordOpacity, wordY, tagOpacity, tagY, overlayOpacity, overlayScale]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.get(),
    transform: [{ scale: overlayScale.get() }],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.get(),
    transform: [{ scale: logoScale.get() }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.get(),
    transform: [{ scale: ringScale.get() }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.get(),
    transform: [{ translateY: wordY.get() }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagOpacity.get(),
    transform: [{ translateY: tagY.get() }],
  }));

  if (done) return null;

  return (
    <Animated.View
      pointerEvents="auto"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 9999 }, overlayStyle]}
    >
      {/* expanding ripple ring */}
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, ringStyle]}>
        <View style={[styles.ring, { borderColor: colors.accentSoft }]} />
      </Animated.View>

      {/* logo mark */}
      <Animated.View style={logoStyle}>
        <LinearGradient
          colors={[colors.userBubbleFrom, colors.userBubbleTo, colors.accent2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logo}
        >
          <Asterisk size={44} color="#FFFFFF" />
        </LinearGradient>
      </Animated.View>

      {/* wordmark + tagline */}
      <Animated.View style={[styles.words, wordStyle]}>
        <Animated.Text style={[styles.wordmark, { color: colors.text }]}>Copper</Animated.Text>
      </Animated.View>
      <Animated.View style={tagStyle}>
        <Animated.Text style={[styles.tagline, { color: colors.textFaint }]}>
          The agent that finishes the job.
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

/* ---------------------------------- routes --------------------------------- */

function Routes() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <SystemUI.StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
          animationDuration: 260,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="settings/api" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/agent" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/usage" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/generation" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/appearance" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings/data" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/about" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}

/** Registers the offline service worker on web (PWA install support). */
function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const t = setTimeout(() => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ServiceWorkerRegistrar />
          <View style={styles.fill}>
            <Routes />
            <SplashOverlay />
          </View>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    // soft elevation, mostly visible on the cream canvas
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  ring: {
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1.5,
  },
  words: { marginTop: 26 },
  wordmark: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' },
  tagline: { fontSize: 13.5, marginTop: 6, textAlign: 'center' },
});
