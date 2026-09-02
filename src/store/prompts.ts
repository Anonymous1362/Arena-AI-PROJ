/**
 * Prompt Library store — saves reusable system prompts the user can
 * insert into any chat or set as the per-chat system prompt override.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedPrompt {
  id: string;
  title: string;
  /** The full system-prompt text. */
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface PromptsState {
  prompts: SavedPrompt[];

  addPrompt: (title: string, body: string) => SavedPrompt;
  updatePrompt: (id: string, patch: { title?: string; body?: string }) => void;
  deletePrompt: (id: string) => void;
  reorderPrompts: (from: number, to: number) => void;
}

function uid() {
  return `pr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const usePromptsStore = create<PromptsState>()(
  persist(
    (set) => ({
      prompts: [],

      addPrompt: (title, body) => {
        const now = Date.now();
        const p: SavedPrompt = { id: uid(), title: title.trim() || 'Untitled', body, createdAt: now, updatedAt: now };
        set((s) => ({ prompts: [p, ...s.prompts] }));
        return p;
      },

      updatePrompt: (id, patch) =>
        set((s) => ({
          prompts: s.prompts.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...(patch.title !== undefined ? { title: patch.title.trim() || p.title } : {}),
                  ...(patch.body !== undefined ? { body: patch.body } : {}),
                  updatedAt: Date.now(),
                }
              : p
          ),
        })),

      deletePrompt: (id) => set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) })),

      reorderPrompts: (from, to) =>
        set((s) => {
          const arr = [...s.prompts];
          const [item] = arr.splice(from, 1);
          arr.splice(to, 0, item);
          return { prompts: arr };
        }),
    }),
    {
      name: 'copper/prompts/v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);
