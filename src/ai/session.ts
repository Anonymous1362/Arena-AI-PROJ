import { create } from 'zustand';
import type { ChatMessage, Conversation } from '@/src/store/chats';
import { useChatsStore } from '@/src/store/chats';
import { useSettingsStore } from '@/src/store/settings';
import { runGeneration, cancelLocal, describeModel } from '@/src/ai/engine';
import { streamRemoteChat } from '@/src/ai/remote';
import { resolveRemoteTarget, buildWireMessages } from '@/src/ai/engine';
import { haptics } from '@/src/utils/haptics';
import { truncate } from '@/src/utils/format';

/* ------------------------- ephemeral streaming state ------------------------- */

interface StreamingState {
  ids: Record<string, true>;
  start: (id: string) => void;
  end: (id: string) => void;
}

export const useStreamingStore = create<StreamingState>((set) => ({
  ids: {},
  start: (id) => set((s) => ({ ids: { ...s.ids, [id]: true } })),
  end: (id) =>
    set((s) => {
      const { [id]: _drop, ...rest } = s.ids;
      return { ids: rest };
    }),
}));

export function isConversationStreaming(convId: string): boolean {
  return !!useStreamingStore.getState().ids[convId];
}

/* ------------------------------ abort plumbing ------------------------------ */

const active = new Map<string, { abort: AbortController }>();

export function stopGeneration(convId: string): void {
  const handle = active.get(convId);
  if (!handle) return;
  cancelLocal();
  handle.abort.abort();
}

/* -------------------------------- the session -------------------------------- */

export interface SendOptions {
  /** Regenerate the last assistant reply from existing history. */
  regenerate?: boolean;
  /** Re-send from an edited user message: keeps messages up to & incl. it. */
  editMessageId?: string;
  /** New user text (required unless regenerate). */
  text?: string;
}

export async function sendMessage(convId: string, opts: SendOptions): Promise<void> {
  const chats = useChatsStore.getState();
  const settings = useSettingsStore.getState();

  if (isConversationStreaming(convId)) return;
  if (!opts.regenerate && !opts.text?.trim() && !opts.editMessageId) return;

  const conv = chats.conversations.find((c) => c.id === convId);
  if (!conv) return;

  const model = conv.model ?? settings.activeModel;
  if (!model) {
    throwNoModel(conv);
    return;
  }

  // 1) shape the message list
  if (opts.editMessageId) {
    chats.dropMessagesAfter(convId, opts.editMessageId);
    if (opts.text?.trim()) {
      chats.updateMessage(convId, opts.editMessageId, { content: opts.text.trim(), error: undefined });
    }
  } else if (opts.regenerate) {
    const last = conv.messages[conv.messages.length - 1];
    if (last?.role === 'assistant') chats.deleteMessage(convId, last.id);
  } else if (opts.text?.trim()) {
    chats.appendMessage(convId, { role: 'user', content: opts.text.trim(), done: true });
  }

  const assistant = chats.appendMessage(convId, {
    role: 'assistant',
    content: '',
    done: false,
  });

  const started = Date.now();
  useStreamingStore.getState().start(convId);
  const abort = new AbortController();
  active.set(convId, { abort });

  // 2) build request context
  const fresh = useChatsStore.getState().conversations.find((c) => c.id === convId);
  const history = (fresh?.messages ?? [])
    .filter((m) => m.id !== assistant.id && m.done !== false && !m.error)
    .map((m) => ({ role: m.role, content: m.content }));

  const wire = buildWireMessages(history, settings.generation.systemPrompt, settings.generation.contextSize, settings.generation.maxTokens);

  let lastPaint = 0;
  let contentBuf = '';
  let reasoningBuf = '';
  const paint = () => {
    // engines already throttle; this is a final safety net
    const now = Date.now();
    if (now - lastPaint < 50) return;
    lastPaint = now;
    useChatsStore.getState().updateMessage(convId, assistant.id, {
      content: contentBuf,
      reasoning: reasoningBuf || undefined,
    });
  };

  try {
    const result = await runGeneration({
      model,
      request: {
        messages: wire,
        params: settings.generation,
        signal: abort.signal,
        handlers: {
          onContent: (c) => {
            contentBuf = c;
            paint();
          },
          onReasoning: (r) => {
            reasoningBuf = r;
            paint();
          },
        },
      },
    });

    useChatsStore.getState().updateMessage(convId, assistant.id, {
      content: result.content,
      reasoning: result.reasoning,
      done: true,
      error: undefined,
      stats: {
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        ms: result.ms,
        tps: result.tps ?? (result.tokensOut && result.ms > 0 ? result.tokensOut / (result.ms / 1000) : undefined),
      },
    });
    haptics.light();
  } catch (e) {
    const err = e as Error;
    const aborted = abort.signal.aborted || err?.name === 'AbortError';
    const current = useChatsStore
      .getState()
      .conversations.find((c) => c.id === convId)
      ?.messages.find((m) => m.id === assistant.id);

    if (aborted) {
      useChatsStore.getState().updateMessage(convId, assistant.id, {
        content: current?.content ?? '',
        reasoning: current?.reasoning,
        done: true,
        error: current?.content ? undefined : 'Stopped before any output.',
      });
    } else {
      haptics.error();
      useChatsStore.getState().updateMessage(convId, assistant.id, {
        done: true,
        error: friendlyError(err),
      });
    }
  } finally {
    active.delete(convId);
    useStreamingStore.getState().end(convId);
    useChatsStore.getState().touchConversation(convId);
    maybeAutoTitle(convId, model);
  }
}

function throwNoModel(conv: Conversation): void {
  // Nudge the user from the UI layer: the conversation screen listens to this.
  noModelRequests.add(conv.id);
  noModelListeners.forEach((fn) => fn(conv.id));
}

/** UI hook: fires when a send was attempted with no model configured. */
const noModelRequests = new Set<string>();
const noModelListeners = new Set<(convId: string) => void>();
export function onNoModel(cb: (convId: string) => void): () => void {
  noModelListeners.add(cb);
  return () => noModelListeners.delete(cb);
}
export function consumeNoModel(convId: string): boolean {
  const had = noModelRequests.has(convId);
  noModelRequests.delete(convId);
  return had;
}

/* --------------------------------- helpers ---------------------------------- */

function friendlyError(err: Error): string {
  const msg = err?.message ?? 'Something went wrong.';
  if (msg.includes('Network request failed') || msg.includes('fetch') || msg.includes('connect')) {
    return 'Couldn’t reach the server. Check your connection, base URL, and that the server allows this device.';
  }
  return msg;
}

async function maybeAutoTitle(convId: string, model: Conversation['model']): Promise<void> {
  const settings = useSettingsStore.getState();
  const conv = useChatsStore.getState().conversations.find((c) => c.id === convId);
  if (!conv || !settings.behavior.autoTitle) return;
  if (conv.title !== 'New chat') return;
  const firstUser = conv.messages.find((m) => m.role === 'user');
  if (!firstUser) return;

  // Local models: truncation is instant and offline-friendly.
  if (model?.kind !== 'remote') {
    useChatsStore.getState().renameConversation(convId, truncate(firstUser.content, 38));
    return;
  }

  // Remote models: ask for a proper title (fire-and-forget).
  try {
    const target = resolveRemoteTarget(settings, model);
    const result = await streamRemoteChat(target, {
      messages: [
        { role: 'system', content: 'Create a short conversation title (3–6 words). Reply with the title only, no quotes, no punctuation at the end.' },
        { role: 'user', content: truncate(firstUser.content, 500) },
      ],
      params: { temperature: 0.3, topP: 0.9, maxTokens: 24, contextSize: 2048, systemPrompt: '' },
      handlers: {},
    });
    const title = result.content.trim().replace(/^["'“”]+|["'“”.]+$/g, '');
    if (title) useChatsStore.getState().renameConversation(convId, truncate(title, 48));
  } catch {
    useChatsStore.getState().renameConversation(convId, truncate(firstUser.content, 38));
  }
}

export function activeModelLabel(conv: Conversation): string {
  return describeModel(conv.model);
}

export type { ChatMessage };
