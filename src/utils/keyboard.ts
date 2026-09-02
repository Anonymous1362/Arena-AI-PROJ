import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';
import { useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spring, isReducedMotion } from '@/src/theme/motion';
import { useSettingsStore } from '@/src/store/settings';

/**
 * Keyboard plumbing.
 *
 * Two Android bugs this exists to fix:
 *
 *  1. **The keyboard covered the composer and the whole app.** With
 *     `edgeToEdgeEnabled` the window no longer resizes for the IME, so
 *     `KeyboardAvoidingView behaviour="height"` fights the insets and either
 *     does nothing or collapses the screen. We measure the real keyboard frame
 *     from the native event, subtract the bottom safe-area inset (that space is
 *     already ours), and drive a UI-thread shared value so the composer glides
 *     up in step with the IME instead of jumping after it.
 *
 *  2. **The keyboard stayed up in Settings / other tabs.** `dismissKeyboard()`
 *     is wired to route changes, tab changes, sheet opens and app background —
 *     see `KeyboardDismissGuard`.
 */

/* ------------------------------ dismiss helpers ----------------------------- */

export function dismissKeyboard(): void {
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      const el = document.activeElement as HTMLElement | null;
      el?.blur?.();
    }
    return;
  }
  Keyboard.dismiss();
}

/** Dismiss unless the user explicitly opted out. */
export function dismissKeyboardIfEnabled(): void {
  if (useSettingsStore.getState().behavior.dismissKeyboardOnNavigate) dismissKeyboard();
}

/* ------------------------------- the inset hook ------------------------------ */

export interface KeyboardState {
  /** Pixels the UI must lift by. 0 when hidden. */
  height: number;
  visible: boolean;
  /** UI-thread animated value (px) — use in `useAnimatedStyle`. */
  shared: ReturnType<typeof useSharedValue<number>>;
  /** Progress 0→1, handy for fading a grab handle or shrinking the header. */
  progress: ReturnType<typeof useSharedValue<number>>;
}

export function useKeyboardInset(): KeyboardState {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState({ height: 0, visible: false });
  const shared = useSharedValue(0);
  const progress = useSharedValue(0);
  /** Window height captured while the keyboard was down, to detect auto-resize. */
  const baseHeight = useRef(Dimensions.get('window').height);
  const bottomInset = useRef(insets.bottom);
  bottomInset.current = insets.bottom;

  useEffect(() => {
    const reduced = isReducedMotion();
    const animate = (to: number) => {
      if (reduced) {
        shared.set(to);
        progress.set(to > 0 ? 1 : 0);
        return;
      }
      shared.set(withSpring(to, Spring.glide));
      progress.set(withTiming(to > 0 ? 1 : 0, { duration: 180 }));
    };

    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: { endCoordinates?: { height: number; screenY?: number } }) => {
      const kb = e?.endCoordinates?.height ?? 0;
      if (!kb) return;
      // If the OS already resized the window for the IME, lifting again would
      // double-count and shove the composer off-screen.
      const now = Dimensions.get('window').height;
      const resized = baseHeight.current - now > kb * 0.6;
      const lift = resized ? 0 : Math.max(0, kb - bottomInset.current);
      setState({ height: lift, visible: true });
      animate(lift);
    };

    const onHide = () => {
      baseHeight.current = Dimensions.get('window').height;
      setState({ height: 0, visible: false });
      animate(0);
    };

    const onChange = () => {
      baseHeight.current = Dimensions.get('window').height;
    };

    const subs = [
      Keyboard.addListener(showEvt, onShow),
      Keyboard.addListener(hideEvt, onHide),
      Dimensions.addEventListener('change', onChange),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [shared, progress]);

  return { height: state.height, visible: state.visible, shared, progress };
}

/* --------------------------- tab-bar auto-hide helper ------------------------ */

/**
 * True while the keyboard is up. Used to slide the tab bar out of the way so
 * the composer gets the whole screen (iOS-style).
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setVisible(true));
    const b = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return visible;
}
