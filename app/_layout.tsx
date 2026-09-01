import React, { useEffect } from 'react';
import { Platform, StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SystemUI from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@/src/theme';

function Routes() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <SystemUI.StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animationDuration: 240,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="settings/api" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings/agent" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings/generation" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings/appearance" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings/data" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings/about" options={{ presentation: 'modal' }} />
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
          <Routes />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
