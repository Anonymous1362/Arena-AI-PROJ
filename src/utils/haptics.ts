import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSettingsStore } from '@/src/store/settings';

let lastHapticAt = 0;
const MIN_HAPTIC_INTERVAL_MS = 70;

/**
 * Central haptics facade. Respects the user's haptics preference and keeps
 * rapid taps/gesture collisions from turning into a noisy Android vibration
 * queue. The UI remains responsive even when a device's haptic motor is slow.
 */
function canHaptic() {
  if (!useSettingsStore.getState().appearance.hapticsEnabled) return false;
  if (Platform.OS === 'web') return false;
  const now = Date.now();
  if (now - lastHapticAt < MIN_HAPTIC_INTERVAL_MS) return false;
  lastHapticAt = now;
  return true;
}

function impact(style: Haptics.ImpactFeedbackStyle) {
  if (!canHaptic()) return;
  Haptics.impactAsync(style).catch(() => {});
}

export const haptics = {
  light: () => impact(Haptics.ImpactFeedbackStyle.Light),
  medium: () => impact(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => impact(Haptics.ImpactFeedbackStyle.Heavy),
  selection: () => {
    if (!canHaptic()) return;
    Haptics.selectionAsync().catch(() => {});
  },
  success: () => {
    if (!canHaptic()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    if (!canHaptic()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error: () => {
    if (!canHaptic()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
