import { create } from 'zustand';
import type { ChatMessage, Conversation, MessageAttachment } from '@/src/store/chats';
import { useChatsStore } from '@/src/store/chats';
import { useSettingsStore } from '@/src/store/settings';
import { resolveRemoteTarget, buildWireMessages, describeModel } from '@/src/ai/engine';
import { streamRemoteChat } from '@/src/ai/remote';
import type { WireMessage } from '@/src/ai/types';
import { runAgentTurn } from '@/src/agent/loop';
import { buildSystemPrompt } from '@/src/agent/prompts';
import { currentRoot } from '@/src/agent/fs';
import { imageDataUrlForApi } from '@/src/utils/image';
import { haptics } from '@/src/utils/haptics';
import { useUsageStore } from '@/src/store/usage';
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
  active.get(convId)?.abort.abort();
}

/* -------------------------------- the session -------------------------------- */

export interface SendOptions {
  regenerate?: boolean;
  editMessageId?: string;
  text?: string;
  /** Image attachments for vision models (API engines). */
  attachments?: MessageAttachment[];
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
  } else if (opts.text?.trim() || opts.attachments?.length) {
    chats.appendMessage(convId, {
      role: 'user',
      content: opts.text?.trim() ?? '',
      done: true,
      attachments: opts.attachments?.length ? opts.attachments : undefined,
    });
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

  // 2) build the request
  const fresh = useChatsStore.getState().conversations.find((c) => c.id === convId);
  const msgs = fresh?.messages ?? [];
  const history = msgs.filter((m) => m.id !== assistant.id && m.done && !m.error && m.content);

  const system = buildSystemPrompt({
    userSystemPrompt: settings.generation.systemPrompt,
    scopeLabel:
      settings.agentScope.storageEnabled && settings.agentScope.safRootLabel
        ? `user-granted storage root “${settings.agentScope.safRootLabel}”`
        : currentRoot().tier === 'granted'
          ? 'user-granted storage root'
          : 'app sandbox',
    executorReal: false,
  });

  let wire: WireMessage[] = buildWireMessages(
    history.map((m) => ({ role: m.role, content: m.content })),
    system,
    settings.generation.maxTokens
  );

  // replay the last agent transcript tail (tool calls/results) for continuity
  const lastAgentMsg = [...msgs]
    .reverse()
    .find((m) => m.role === 'assistant' && m.done && m.transcriptTail?.length);
  if (lastAgentMsg?.transcriptTail) {
    const tail = lastAgentMsg.transcriptTail as WireMessage[];
    // splice tail after its assistant message position: replace the plain
    // assistant entry in `wire` with the full tail.
    const idx = wire.findIndex((w) => w.role === 'assistant' && w.content === lastAgentMsg.content);
    if (idx !== -1) wire = [...wire.slice(0, idx), ...tail, ...wire.slice(idx + 1)];
  }

  // vision: attach images to the newest user message
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  if (lastUser?.attachments?.length) {
    const wireUser = [...wire].reverse().find((w) => w.role === 'user');
    if (wireUser) {
      try {
        const parts: unknown[] = [{ type: 'text', text: wireUser.content || 'Describe the image.' }];
        for (const att of lastUser.attachments.slice(0, 4)) {
          const dataUrl = await imageDataUrlForApi(att.uri, att.mime);
          parts.push({ type: 'image_url', image_url: { url: dataUrl } });
        }
        wireUser.content = parts as unknown as string;
      } catch (e) {
        useChatsStore.getState().updateMessage(convId, assistant.id, {
          done: true,
          error: `Attachment failed: ${(e as Error).message}`,
        });
        active.delete(convId);
        useStreamingStore.getState().end(convId);
        return;
      }
    }
  }

  // 3) paint helpers
  let lastPaint = 0;
  const paintContent = (content: string) => {
    const now = Date.now();
    if (now - lastPaint < 60) return;
    lastPaint = now;
    useChatsStore.getState().updateMessage(convId, assistant.id, { content });
  };
  const upsertToolEvent = (ev: unknown) => {
    const cur = useChatsStore
      .getState()
      .conversations.find((c) => c.id === convId)
      ?.messages.find((m) => m.id === assistant.id);
    const events = [...(cur?.toolEvents ?? [])];
    const i = events.findIndex((x) => x.id === (ev as { id: string }).id);
    if (i === -1) events.push(ev as ChatMessage['toolEvents'] extends (infer T)[] | undefined ? T : never);
    else events[i] = ev as (typeof events)[number];
    useChatsStore.getState().updateMessage(convId, assistant.id, { toolEvents: events });
  };
  const upsertPlan = (steps: unknown) => {
    useChatsStore.getState().updateMessage(convId, assistant.id, {
      planSteps: steps as ChatMessage['planSteps'],
    });
  };

  const agentMode = settings.agentScope.enabled && model.kind === 'remote';

  try {
    const target = resolveRemoteTarget(settings, model);

    if (agentMode) {
      await runAgentTurn({
        target,
        messages: wire,
        systemPrompt: system,
        temperature: settings.generation.temperature,
        topP: settings.generation.topP,
        maxTokens: settings.generation.maxTokens,
        autoContinue: settings.behavior.autoContinue,
        signal: abort.signal,
        callbacks: {
          onText: paintContent,
          onPlan: upsertPlan,
          onToolEvent: upsertToolEvent,
          onDone: ({ text, ms, transcriptTail, toolCallCount, tokensIn, tokensOut }) => {
            useChatsStore.getState().updateMessage(convId, assistant.id, {
              content: text,
              done: true,
              error: undefined,
              transcriptTail: transcriptTail.slice(-24),
              stats: {
                ms,
                tokensIn,
                tokensOut,
                tps: tokensOut && ms > 0 ? tokensOut / (ms / 1000) : undefined,
              },
            });
            useUsageStore.getState().record({ profileId: model.profileId, model: model.model, tokensIn, tokensOut });
            haptics.light();
          },
          onError: (err) => {
            haptics.error();
            useChatsStore.getState().updateMessage(convId, assistant.id, {
              done: true,
              error: friendlyError(err),
            });
          },
        },
      });
    } else {
      const result = await streamRemoteChat(target, {
        messages: wire,
        params: settings.generation,
        signal: abort.signal,
        handlers: {
          onContent: paintContent,
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
          tps: result.tps,
        },
      });
      useUsageStore.getState().record({
        profileId: model.profileId,
        model: model.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
      haptics.light();
    }
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
  const raw = err?.message ?? 'Something went wrong.';
  const m = raw.toLowerCase();
  if (m.includes('401') || m.includes('unauthorized')) return 'API key rejected (401). Check the key in Settings → Providers.';
  if (m.includes('402') || m.includes('insufficient') || m.includes('credit')) return 'This endpoint says you’re out of credits (402). Top up or switch provider.';
  if (m.includes('403') || m.includes('forbidden')) return 'Access denied (403). Your key may not have access to this model.';
  if (m.includes('404') || m.includes('not found')) return 'Not found (404). Check the base URL and the model name.';
  if (m.includes('429') || m.includes('rate limit') || m.includes('quota')) return 'Rate limited or quota exceeded (429). Wait a moment or check your plan.';
  if (m.includes('502') || m.includes('503') || m.includes('bad gateway') || m.includes('server error')) return 'The provider had a server error. Try again shortly.';
  if (m.includes('timed out') || m.includes('timeout')) return 'The server took too long to respond. Try again, or pick a faster model.';
  if (m.includes('network') || m.includes('connect') || m.includes('dns') || m.includes('resolve')) return 'Network error. Check internet/DNS — for LAN servers (Ollama, LM Studio), verify the IP, port and same Wi-Fi.';
  return raw;
}

async function maybeAutoTitle(convId: string, model: Conversation['model']): Promise<void> {
  const settings = useSettingsStore.getState();
  const conv = useChatsStore.getState().conversations.find((c) => c.id === convId);
  if (!conv || !settings.behavior.autoTitle) return;
  if (conv.title !== 'New chat') return;
  const firstUser = conv.messages.find((m) => m.role === 'user');
  if (!firstUser) return;

  try {
    const target = resolveRemoteTarget(settings, model);
    const result = await streamRemoteChat(target, {
      messages: [
        { role: 'system', content: 'Create a short conversation title (3–6 words). Reply with the title only, no quotes, no punctuation at the end.' },
        { role: 'user', content: truncate(firstUser.content || 'image conversation', 500) },
      ],
      params: { temperature: 0.3, topP: 0.9, maxTokens: 24, systemPrompt: '' },
      handlers: {},
    });
    const title = result.content.trim().replace(/^["'“”]+|["'“”.]+$/g, '');
    if (title) useChatsStore.getState().renameConversation(convId, truncate(title, 48));
  } catch {
    useChatsStore.getState().renameConversation(convId, truncate(firstUser.content || 'New chat', 38));
  }
}

export function activeModelLabel(conv: Conversation): string {
  return describeModel(conv.model);
}

export type { ChatMessage };
