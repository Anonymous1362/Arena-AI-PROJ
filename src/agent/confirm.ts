import { create } from 'zustand';

/**
 * Pending tool-confirmation gate. When the agent wants to run a dangerous
 * tool (delete, etc.) and the user enabled confirmations, the loop parks the
 * request here; the chat UI shows a sheet and resolves it.
 */
export interface PendingConfirmation {
  id: string;
  toolName: string;
  /** Human summary of what will happen. */
  summary: string;
  /** Raw args preview (JSON). */
  argsPreview: string;
  resolve: (allow: boolean) => void;
}

interface ConfirmState {
  pending: PendingConfirmation | null;
  push: (p: PendingConfirmation) => void;
  answer: (allow: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  push: (p) => set({ pending: p }),
  answer: (allow) => {
    const cur = get().pending;
    if (cur) {
      cur.resolve(allow);
      set({ pending: null });
    }
  },
}));
