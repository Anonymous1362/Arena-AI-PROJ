import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '@/src/utils/id';
import type { ActiveModel } from '@/src/store/settings';
import type { PlanStep, ToolEvent, WireMessage } from '@/src/ai/types';

/* ---------------------------------- types ---------------------------------- */

export type Role = 'user' | 'assistant' | 'system';

export interface GenStats {
  tokensIn?: number;
  tokensOut?: number;
  ms: number;
  tps?: number;
}

export interface MessageAttachment {
  kind: 'image';
  /** local file:// uri or data: uri */
  uri: string;
  mime?: string;
  name?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** Model reasoning (e.g. <think> blocks from reasoning models). */
  reasoning?: string;
  /** Agent plan steps extracted from the turn. */
  planSteps?: PlanStep[];
  /** Tool/command executions performed while producing this message. */
  toolEvents?: ToolEvent[];
  /** Image attachments (vision models, API engines). */
  attachments?: MessageAttachment[];
  /** Raw assistant/tool transcript tail, replayed on the next turn. */
  transcriptTail?: WireMessage[];
  createdAt: number;
  done: boolean;
  stats?: GenStats;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  /** Engine snapshot used for this conversation; new messages default to it. */
  model: ActiveModel;
  messages: ChatMessage[];
  /**
   * Per-chat system prompt override. When set, this replaces the global
   * generation.systemPrompt for this conversation only.
   */
  systemPromptOverride?: string;
  /** Optional workspace used to group this conversation and its artifacts. */
  projectId?: string;
  /** Structured Project Summary State produced by a context compaction. */
  summary?: string;
  /** Message id everything up to (and including) is covered by `summary`. */
  compactedBefore?: string;
  summaryAt?: number;
  archivedCount?: number;
}

export interface CompactionPatch {
  summary: string;
  compactedBefore?: string;
  archivedCount?: number;
}

export interface ChatsState {
  conversations: Conversation[];

  createConversation: (model: ActiveModel, title?: string) => Conversation;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  togglePin: (id: string) => void;
  setConversationModel: (id: string, model: ActiveModel) => void;
  setConversationSystemPrompt: (id: string, prompt: string | undefined) => void;
  setConversationProject: (id: string, projectId: string | undefined) => void;
  applyCompaction: (id: string, patch: CompactionPatch) => void;
  clearCompaction: (id: string) => void;
  touchConversation: (id: string) => void;

  appendMessage: (convId: string, msg: Omit<ChatMessage, 'id' | 'createdAt'>) => ChatMessage;
  updateMessage: (convId: string, msgId: string, patch: Partial<ChatMessage>) => void;
  deleteMessage: (convId: string, msgId: string) => void;
  /** Remove every message strictly after `msgId` (for edit / regenerate flows). */
  dropMessagesAfter: (convId: string, msgId: string) => void;

  /**
   * Returns an existing untouched draft ("New chat", zero messages) or creates
   * one. The Chat tab uses this so it always has a real conversation to render
   * without piling up empty ones.
   */
  ensureDraftConversation: (model: ActiveModel) => Conversation;
  /** Drop zero-message drafts except `keepId`. */
  pruneEmptyDrafts: (keepId?: string | null) => void;

  clearAllChats: () => void;
  importConversations: (convs: Conversation[]) => void;
}

/* ---------------------------------- store ---------------------------------- */

export const useChatsStore = create<ChatsState>()(
  persist(
    (set, get) => ({
      conversations: [],

      createConversation: (model, title = 'New chat') => {
        const conv: Conversation = {
          id: uid('c'),
          title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          pinned: false,
          model,
          messages: [],
        };
        set((s) => ({ conversations: [conv, ...s.conversations] }));
        return conv;
      },

      deleteConversation: (id) =>
        set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) })),

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        })),

      togglePin: (id) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)),
        })),

      setConversationModel: (id, model) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, model } : c)),
        })),

      setConversationSystemPrompt: (id, prompt) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, systemPromptOverride: prompt } : c
          ),
        })),

      setConversationProject: (id, projectId) =>
        set((s) => ({
          conversations: s.conversations.map((c) => c.id === id ? { ...c, projectId, updatedAt: Date.now() } : c),
        })),

      applyCompaction: (id, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id
              ? {
                  ...c,
                  summary: patch.summary,
                  compactedBefore: patch.compactedBefore,
                  archivedCount: patch.archivedCount ?? c.archivedCount,
                  summaryAt: Date.now(),
                }
              : c
          ),
        })),

      clearCompaction: (id) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, summary: undefined, compactedBefore: undefined, archivedCount: undefined } : c
          ),
        })),

      touchConversation: (id) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, updatedAt: Date.now() } : c
          ),
        })),

      appendMessage: (convId, msg) => {
        const full: ChatMessage = { ...msg, id: uid('m'), createdAt: Date.now() };
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? { ...c, messages: [...c.messages, full], updatedAt: Date.now() }
              : c
          ),
        }));
        return full;
      },

      updateMessage: (convId, msgId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
                }
              : c
          ),
        })),

      deleteMessage: (convId, msgId) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, messages: c.messages.filter((m) => m.id !== msgId) } : c
          ),
        })),

      dropMessagesAfter: (convId, msgId) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== convId) return c;
            const idx = c.messages.findIndex((m) => m.id === msgId);
            return idx === -1 ? c : { ...c, messages: c.messages.slice(0, idx + 1) };
          }),
        })),

      ensureDraftConversation: (model) => {
        const existing = get().conversations.find(
          (c) => c.messages.length === 0 && !c.pinned && c.title === 'New chat'
        );
        if (existing) {
          if (model && JSON.stringify(existing.model) !== JSON.stringify(model)) {
            set((s) => ({
              conversations: s.conversations.map((c) => (c.id === existing.id ? { ...c, model } : c)),
            }));
          }
          return existing;
        }
        return get().createConversation(model);
      },

      pruneEmptyDrafts: (keepId) =>
        set((s) => ({
          conversations: s.conversations.filter(
            (c) => c.messages.length > 0 || c.pinned || c.id === keepId
          ),
        })),

      clearAllChats: () => set({ conversations: [] }),

      importConversations: (convs) =>
        set((s) => {
          const existing = new Set(s.conversations.map((c) => c.id));
          const fresh = convs.filter((c) => c && c.id && !existing.has(c.id));
          return { conversations: [...fresh, ...s.conversations] };
        }),
    }),
    {
      name: 'aurora/chats/v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);

/* -------------------------------- selectors -------------------------------- */

export function selectSortedConversations(convs: Conversation[]): Conversation[] {
  return [...convs].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export function findConversation(convs: Conversation[], id: string): Conversation | undefined {
  return convs.find((c) => c.id === id);
}
