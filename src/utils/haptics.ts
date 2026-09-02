import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSettingsStore } from '@/src/store/settings';

/**
 * Central haptics facade. Respects the user's haptics preference and
 * degrades to a no-op on platforms without vibration support (web).
 */
function impact(style: Haptics.ImpactFeedbackStyle) {
  if (!useSettingsStore.getState().appearance.hapticsEnabled) return;
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(style).catch(() => {});
}

export const haptics = {
  light: () => impact(Haptics.ImpactFeedbackStyle.Light),
  medium: () => impact(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => impact(Haptics.ImpactFeedbackStyle.Heavy),
  selection: () => {
    if (!useSettingsStore.getState().appearance.hapticsEnabled) return;
    if (Platform.OS === 'web') return;
    Haptics.selectionAsync().catch(() => {});
  },
  success: () => {
    if (!useSettingsStore.getState().appearance.hapticsEnabled) return;
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    if (!useSettingsStore.getState().appearance.hapticsEnabled) return;
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error: () => {
    if (!useSettingsStore.getState().appearance.hapticsEnabled) return;
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
