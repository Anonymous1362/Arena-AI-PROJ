import { create } from 'zustand';

/**
 * One-line, auto-dismissing feedback. For "saved to /storage/…/Download/x.zip",
 * "all-files access confirmed", "copied" — the moments where a haptic alone
 * leaves the user wondering whether anything happened.
 */
export interface ToastState {
  text: string | null;
  kind: 'info' | 'success' | 'warn';
  seq: number;
  show: (text: string, kind?: ToastState['kind']) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  text: null,
  kind: 'info',
  seq: 0,
  show: (text, kind = 'info') => set({ text, kind, seq: get().seq + 1 }),
  hide: () => set({ text: null }),
}));

export const toast = (text: string, kind: ToastState['kind'] = 'info') => useToastStore.getState().show(text, kind);
