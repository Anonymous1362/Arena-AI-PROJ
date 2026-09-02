import React, { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SystemUI from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@/src/theme';
import { Durations } from '@/src/theme/motion';
import { SplashGate, holdNativeSplash } from '@/src/components/Splash';
import { KeyboardGuard } from '@/src/components/KeyboardGuard';
import { Toast } from '@/src/components/Toast';
import { setGrantedTree, setManagedBase, verifyManagedAccess } from '@/src/agent/fs';
import { useSettingsStore } from '@/src/store/settings';

// Hold the native splash until the animated JS splash is ready to take over.
holdNativeSplash();

function Routes() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <SystemUI.StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <KeyboardGuard />
      <StorageSync />
      <Toast />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
          animationDuration: Durations.smooth,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade', animationDuration: Durations.normal }} />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="settings/api" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/agent" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/models" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/motion" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/github" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/shell" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/usage" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/generation" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings/appearance" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
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
          <SplashGate>
            <ServiceWorkerRegistrar />
            <Routes />
          </SplashGate>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

/**
 * Keeps the file-system layer in step with persisted settings — on cold start
 * and whenever the user changes roots, without having to visit Settings first.
 */
function StorageSync(): null {
  const storageEnabled = useSettingsStore((s) => s.agentScope.storageEnabled);
  const safTreeUri = useSettingsStore((s) => s.agentScope.safTreeUri);
  const managedBase = useSettingsStore((s) => s.agentScope.managedBase);

  useEffect(() => {
    setGrantedTree(storageEnabled && Platform.OS === 'android' ? safTreeUri ?? null : null);
  }, [storageEnabled, safTreeUri]);

  useEffect(() => {
    setManagedBase(managedBase || null);
    if (managedBase) void verifyManagedAccess(managedBase);
  }, [managedBase]);

  return null;
}
