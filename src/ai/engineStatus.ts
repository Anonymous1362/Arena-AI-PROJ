import { create } from 'zustand';

/**
 * Live engine status surfaced in the chat UI (e.g. "Loading model…" while
 * llama.cpp initializes — that can take several seconds on first send).
 */
export type EngineStatusKind = 'idle' | 'loading' | 'ready' | 'error';

interface EngineStatusState {
  status: EngineStatusKind;
  detail?: string;
  set: (status: EngineStatusKind, detail?: string) => void;
}

export const useEngineStatus = create<EngineStatusState>((set) => ({
  status: 'idle',
  detail: undefined,
  set: (status, detail) => set({ status, detail }),
}));
