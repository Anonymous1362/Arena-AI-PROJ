import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSettingsStore } from '@/src/store/settings';

let lastHapticAt = 0;
const MIN_NOTIFICATION_INTERVAL_MS = 280;

/**
 * Haptics are deliberately sparse. Android's motor queue can make per-tap
 * feedback feel like double/stuttered vibration and can hold up the UI on
 * lower-end devices. Copper reserves vibration for meaningful completion,
 * warning, and error events; ordinary touches get visual press feedback only.
 */
function canNotify() {
  if (!useSettingsStore.getState().appearance.hapticsEnabled) return false;
  if (Platform.OS === 'web') return false;
  const now = Date.now();
  if (now - lastHapticAt < MIN_NOTIFICATION_INTERVAL_MS) return false;
  lastHapticAt = now;
  return true;
}

function notification(type: Haptics.NotificationFeedbackType) {
  if (!canNotify()) return;
  Haptics.notificationAsync(type).catch(() => {});
}

export const haptics = {
  // Keep this API stable for every existing control, but avoid vibration for
  // routine taps, selection changes, opening sheets, and sending text.
  light: () => {},
  medium: () => {},
  heavy: () => {},
  selection: () => {},
  success: () => notification(Haptics.NotificationFeedbackType.Success),
  warning: () => notification(Haptics.NotificationFeedbackType.Warning),
  error: () => notification(Haptics.NotificationFeedbackType.Error),
};
