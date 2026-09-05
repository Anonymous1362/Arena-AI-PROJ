import React, { useEffect } from 'react';
import { Platform, StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SystemUI from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@/src/theme';
import { initExternalStorage, setGrantedTree } from '@/src/agent/fs';
import { useSettingsStore } from '@/src/store/settings';

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

/**
 * Arms the persisted AI SAF workspace and discovers removable storage for the
 * picker as soon as the app starts. AI never falls back to app-private files
 * or an automatic external root; the Manual Terminal is separately permissioned.
 */
function StorageRootInitializer() {
  const storageEnabled = useSettingsStore((s) => s.agentScope.storageEnabled);
  const safTreeUri = useSettingsStore((s) => s.agentScope.safTreeUri);

  useEffect(() => {
    setGrantedTree(Platform.OS === 'android' && storageEnabled ? safTreeUri ?? null : null);
    void initExternalStorage();
  }, [safTreeUri, storageEnabled]);

  return null;
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
          <StorageRootInitializer />
          <ServiceWorkerRegistrar />
          <Routes />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
