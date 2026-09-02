import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/src/store/settings';
import { useChatsStore } from '@/src/store/chats';

/**
 * True once the persisted stores have rehydrated from AsyncStorage.
 *
 * Without this, first paint sees an empty conversation list and would create a
 * throwaway draft on every cold start.
 */
export function useHydrated(): boolean {
  const [ready, setReady] = useState(() => {
    try {
      return !!useSettingsStore.persist?.hasHydrated?.() && !!useChatsStore.persist?.hasHydrated?.();
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (ready) return;
    let done = false;
    const check = () => {
      if (done) return;
      try {
        const ok = !!useSettingsStore.persist?.hasHydrated?.() && !!useChatsStore.persist?.hasHydrated?.();
        if (ok) {
          done = true;
          setReady(true);
        }
      } catch {
        done = true;
        setReady(true);
      }
    };
    const unsubs = [
      useSettingsStore.persist?.onFinishHydration?.(check),
      useChatsStore.persist?.onFinishHydration?.(check),
    ].filter(Boolean) as (() => void)[];
    const tick = setInterval(check, 60);
    check();
    return () => {
      unsubs.forEach((u) => u());
      clearInterval(tick);
    };
  }, [ready]);

  return ready;
}
