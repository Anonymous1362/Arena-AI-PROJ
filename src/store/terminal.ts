import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '@/src/utils/id';

/** A command the user typed into the Terminal tab (not agent tool runs). */
export interface TerminalEntry {
  id: string;
  cmd: string;
  output: string;
  ok: boolean;
  mode: 'native' | 'builtin';
  ts: number;
  ms: number;
}

const MAX_ENTRIES = 200;

interface TerminalState {
  entries: TerminalEntry[];
  addEntry: (e: Omit<TerminalEntry, 'id' | 'ts'>) => void;
  clear: () => void;
}

/** Manual command history for the Terminal tab. Persisted on-device. */
export const useTerminalStore = create<TerminalState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (e) =>
        set((s) => ({
          entries: [...s.entries, { ...e, id: uid('t'), ts: Date.now() }].slice(-MAX_ENTRIES),
        })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'copper/terminal/v1', storage: createJSONStorage(() => AsyncStorage) }
  )
);
