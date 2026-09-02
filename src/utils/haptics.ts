import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSettingsStore, type HapticLevel } from '@/src/store/settings';

/**
 * Central haptics facade.
 *
 * Two problems this solves:
 *
 *  1. **"It vibrates on every click."** Haptics are now a *vocabulary* with a
 *     level gate (`off | subtle | standard | rich`). Routine taps are silent by
 *     default; only meaningful events (send, arrive, success, destructive,
 *     tab change) fire. The old boolean setting migrates into this.
 *
 *  2. **"Sometimes it double-buzzes."** Android fires `onPressIn` more than
 *     once for a single gesture when pressables are nested inside gesture
 *     handlers or when a re-render remounts the responder. Every event goes
 *     through a coalescing window here, so a duplicated call inside
 *     `MIN_GAP_MS` of the same kind is dropped instead of vibrating twice.
 */

export type HapticEvent =
  | 'tap'        // generic touch-down on an interactive control
  | 'press'      // deliberate primary action (send, save, new chat)
  | 'select'     // picking from a list / segmented control
  | 'toggle'     // switch flipped
  | 'navigate'   // tab change, sheet open, route push
  | 'send'       // message dispatched
  | 'arrive'     // agent finished a turn
  | 'success'
  | 'warning'
  | 'error';

/** Which levels allow which events. `rich` ⊃ `standard` ⊃ `subtle`. */
const LEVEL_EVENTS: Record<HapticLevel, ReadonlySet<HapticEvent>> = {
  off: new Set(),
  subtle: new Set<HapticEvent>(['press', 'send', 'arrive', 'success', 'warning', 'error']),
  standard: new Set<HapticEvent>([
    'press', 'select', 'toggle', 'navigate', 'send', 'arrive', 'success', 'warning', 'error',
  ]),
  rich: new Set<HapticEvent>([
    'tap', 'press', 'select', 'toggle', 'navigate', 'send', 'arrive', 'success', 'warning', 'error',
  ]),
};

/** Physical pattern per event. */
const PATTERN: Record<HapticEvent, () => Promise<void>> = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  press: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  select: () => Haptics.selectionAsync(),
  toggle: () => Haptics.selectionAsync(),
  navigate: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  send: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  arrive: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

/* ------------------------------ coalescing gate ----------------------------- */

/** Nothing at all fires twice inside this window — kills the Android double-buzz. */
const MIN_GAP_MS = 55;
/** Same event kind must be this far apart to be considered intentional. */
const SAME_KIND_GAP_MS = 150;

let lastAt = 0;
const lastKind: Partial<Record<HapticEvent, number>> = {};

function allowed(kind: HapticEvent, level: HapticLevel): boolean {
  if (Platform.OS === 'web') return false;
  if (!LEVEL_EVENTS[level]?.has(kind)) return false;
  const now = Date.now();
  if (now - lastAt < MIN_GAP_MS) return false;
  if (now - (lastKind[kind] ?? 0) < SAME_KIND_GAP_MS) return false;
  lastAt = now;
  lastKind[kind] = now;
  return true;
}

function level(): HapticLevel {
  const a = useSettingsStore.getState().appearance;
  // Defensive: older persisted state may only carry the legacy boolean.
  if (a.haptics) return a.haptics;
  return a.hapticsEnabled === false ? 'off' : 'standard';
}

/** Fire a semantic haptic. No-op when the level or the platform forbids it. */
export function haptic(kind: HapticEvent): void {
  if (!allowed(kind, level())) return;
  PATTERN[kind]().catch(() => {});
}

/**
 * Backwards-compatible facade. Existing call sites keep working, but they now
 * route through the same level + coalescing gate.
 */
export const haptics = {
  /** Generic touch-down. Silent unless haptics are set to "rich". */
  light: () => haptic('tap'),
  /** Deliberate primary action. */
  medium: () => haptic('press'),
  /** Semantic alias for `medium` — reads better at action call sites. */
  press: () => haptic('press'),
  tap: () => haptic('tap'),
  heavy: () => {
    if (!allowed('press', level())) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  selection: () => haptic('select'),
  toggle: () => haptic('toggle'),
  navigate: () => haptic('navigate'),
  send: () => haptic('send'),
  arrive: () => haptic('arrive'),
  success: () => haptic('success'),
  warning: () => haptic('warning'),
  error: () => haptic('error'),
};

export type HapticsFacade = typeof haptics;
