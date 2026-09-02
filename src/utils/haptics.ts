import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSettingsStore } from '@/src/store/settings';

/**
 * Central haptics facade. Respects the user's haptics preference and
 * degrades to a no-op on platforms without vibration support (web).
 *
 * Android coalesces haptic requests asynchronously, so two calls fired in
 * quick succession (e.g. a press-in "light" plus an onPress "success") can
 * both be delivered as separate vibrations ~30–80 ms apart — that's the
 * “double buzz” bug. A tiny dedupe window collapses bursts into a single
 * vibration while still letting deliberate, spaced-out feedback through.
 */
let lastFireAt = 0;
const DEDUPE_MS = 110;

function shouldFire(): boolean {
  if (!useSettingsStore.getState().appearance.hapticsEnabled) return false;
  if (Platform.OS === 'web') return false;
  const now = Date.now();
  if (now - lastFireAt < DEDUPE_MS) return false;
  lastFireAt = now;
  return true;
}

function impact(style: Haptics.ImpactFeedbackStyle) {
  if (!shouldFire()) return;
  Haptics.impactAsync(style).catch(() => {});
}

export const haptics = {
  light: () => impact(Haptics.ImpactFeedbackStyle.Light),
  medium: () => impact(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => impact(Haptics.ImpactFeedbackStyle.Heavy),
  selection: () => {
    if (!shouldFire()) return;
    Haptics.selectionAsync().catch(() => {});
  },
  success: () => {
    if (!shouldFire()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    if (!shouldFire()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error: () => {
    if (!shouldFire()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};

