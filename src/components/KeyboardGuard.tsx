import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { usePathname } from 'expo-router';
import { dismissKeyboardIfEnabled } from '@/src/utils/keyboard';

/**
 * Kills the "keyboard follows me everywhere" bug.
 *
 * Android keeps the IME attached to the window, so navigating from a chat to
 * Settings (or switching tabs) used to leave it floating over a screen with no
 * text field. This guard dismisses it on:
 *   - any route/tab change
 *   - the app going to the background
 *   - a screen losing focus (handled by the chat surface itself)
 *
 * It is opt-out via Settings → Interaction → "Dismiss keyboard on navigation".
 */
export function KeyboardGuard(): null {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dismissKeyboardIfEnabled();
  }, [pathname]);

  useEffect(() => {
    const onState = (next: AppStateStatus) => {
      if (next !== 'active') dismissKeyboardIfEnabled();
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, []);

  return null;
}
