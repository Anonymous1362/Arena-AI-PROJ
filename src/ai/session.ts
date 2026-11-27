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

interface ActiveGeneration {
  abort: AbortController;
  profileId: string;
  assistantId: string;
  /** A provider that never begins/continues a response must not spin forever. */
  idleTimeout?: ReturnType<typeof setTimeout>;
}

const active = new Map<string, ActiveGeneration>();
/** Long enough for a cold remote request, short enough to prevent “typing…” for minutes. */
const GENERATION_IDLE_TIMEOUT_MS = 75_000;
const GENERATION_TIMEOUT_ERROR = 'No response from this model for 75 seconds. Tap Retry, or choose a different model.';

/**
 * End the visible turn immediately. Native HTTP abort can take time to settle
 * after a provider has already buffered a response; Stop must never look like
 * it was ignored while that promise unwinds in the background.
 */
export function stopGeneration(convId: string): void {
  const generation = active.get(convId);
  if (!generation) return;
  if (generation.idleTimeout) clearTimeout(generation.idleTimeout);
  generation.abort.abort();
  active.delete(convId);

  const message = useChatsStore
    .getState()
    .conversations.find((conversation) => conversation.id === convId)
    ?.messages.find((item) => item.id === generation.assistantId);
  if (message && !message.done) {
    useChatsStore.getState().updateMessage(convId, generation.assistantId, {
      done: true,
      error: message.content ? undefined : 'Stopped before any output.',
    });
  }
  useStreamingStore.getState().end(convId);
  useChatsStore.getState().touchConversation(convId);
}

/** Cancel every in-flight provider request before destructive data changes. */
export function stopAllGenerations(): void {
  for (const convId of [...active.keys()]) stopGeneration(convId);
}

/** Stop in-flight work before changing or removing its provider credentials. */
export function stopGenerationsForProfile(profileId: string): void {
  for (const [convId, activeGeneration] of [...active]) {
    if (activeGeneration.profileId === profileId) stopGeneration(convId);
  }
}

/* -------------------------------- the session -------------------------------- */

export interface SendOptions {
  regenerate?: boolean;
  /**
   * Regenerate a specific assistant reply. That reply and every turn after it
   * are removed only once the send has passed validation, so a missing model
   * or provider cannot destroy saved answers.
   */
  regenerateFromId?: string;
  editMessageId?: string;
  text?: string;
  /** Image attachments for vision models (API engines). */
  attachments?: MessageAttachment[];
  /**
   * Fired once the turn has started. The returned promise settles only when
   * the whole turn ends, so callers that need to clear a draft at send time
   * use this instead of awaiting the promise.
   */
  onAccepted?: () => void;
}

export async function sendMessage(convId: string, opts: SendOptions): Promise<boolean> {
  const chats = useChatsStore.getState();
  const settings = useSettingsStore.getState();

  if (isConversationStreaming(convId)) return false;
  if (!opts.regenerate && !opts.text?.trim() && !opts.editMessageId) return false;

  const conv = chats.conversations.find((c) => c.id === convId);
  if (!conv) return false;

  const model = conv.model ?? settings.activeModel;
  if (!model) {
    throwNoModel(conv);
    return false;
  }
  // A conversation can outlive a provider (or arrive from another device in a
  // backup). Route that state to the model picker before we add a user message
  // and a failed empty assistant bubble.
  if (!settings.profiles.some((profile) => profile.id === model.profileId)) {
    throwNoModel(conv);
    return false;
  }
  if (opts.regenerateFromId && !conv.messages.some((m) => m.id === opts.regenerateFromId)) {
    return false;
  }
  // Validate the selected provider before mutating persisted chat history.
  // Configuration errors should be recoverable without creating a phantom turn.
  const target = resolveRemoteTarget(settings, model);

  // 1) shape the message list
  if (opts.editMessageId) {
    chats.dropMessagesAfter(convId, opts.editMessageId);
    if (opts.text?.trim()) {
      chats.updateMessage(convId, opts.editMessageId, { content: opts.text.trim(), error: undefined });
    }
  } else if (opts.regenerateFromId) {
    // Truncate from the chosen reply so regenerating an older answer cannot
    // leave its following turns stranded in the transcript.
    chats.truncateFrom(convId, opts.regenerateFromId);
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
  const generation: ActiveGeneration = { abort, profileId: model.profileId, assistantId: assistant.id };
  active.set(convId, generation);
  const isCurrentGeneration = () => active.get(convId) === generation && !abort.signal.aborted;
  const timeoutGeneration = () => {
    if (active.get(convId) !== generation || abort.signal.aborted) return;
    // Native fetch cancellation can settle late. End the visible request first,
    // exactly like Stop, so a silent gateway cannot leave typing dots alive.
    abort.abort();
    active.delete(convId);
    haptics.error();
    useChatsStore.getState().updateMessage(convId, assistant.id, {
      done: true,
      error: GENERATION_TIMEOUT_ERROR,
    });
    useStreamingStore.getState().end(convId);
    useChatsStore.getState().touchConversation(convId);
  };
  const noteProviderActivity = () => {
    if (!isCurrentGeneration()) return;
    if (generation.idleTimeout) clearTimeout(generation.idleTimeout);
    generation.idleTimeout = setTimeout(timeoutGeneration, GENERATION_IDLE_TIMEOUT_MS);
  };
  opts.onAccepted?.();

  // 2) build the request
  const fresh = useChatsStore.getState().conversations.find((c) => c.id === convId);
  const msgs = fresh?.messages ?? [];
  const history = msgs.filter((m) => m.id !== assistant.id && m.done && !m.error && m.content);

  // Per-chat system prompt override wins over the global setting when set.
  const effectiveUserSystemPrompt =
    conv.systemPromptOverride !== undefined
      ? conv.systemPromptOverride
      : settings.generation.systemPrompt;
  const agentMode = settings.agentScope.enabled && model.kind === 'remote';

  // Standard chat must be standard chat. The long planning/tool system prompt
  // belongs only to explicitly enabled Agent mode; injecting it into a simple
  // Gemini conversation caused unnecessary hidden thinking and verbose turns.
  const storageRoot = currentRoot();
  const system = agentMode
    ? buildSystemPrompt({
        userSystemPrompt: effectiveUserSystemPrompt,
        scopeLabel:
          storageRoot.tier === 'granted'
            ? `user-granted storage root “${settings.agentScope.safRootLabel ?? storageRoot.rootLabel}”`
            : storageRoot.tier === 'unavailable'
              ? storageRoot.rootLabel
              : 'app sandbox',
        // Agent commands are deliberately the selected-workspace file shell;
        // only the separately permissioned Manual Terminal starts a native PTY.
        executorReal: false,
      })
    : effectiveUserSystemPrompt?.trim() ?? '';

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
        if (isCurrentGeneration()) {
          useChatsStore.getState().updateMessage(convId, assistant.id, {
            done: true,
            error: `Attachment failed: ${(e as Error).message}`,
          });
          active.delete(convId);
          useStreamingStore.getState().end(convId);
        }
        return true;
      }
    }
  }

  // 3) paint helpers
  let lastPaint = 0;
  const paintContent = (content: string) => {
    if (!isCurrentGeneration()) return;
    const now = Date.now();
    if (now - lastPaint < 60) return;
    lastPaint = now;
    useChatsStore.getState().updateMessage(convId, assistant.id, { content });
  };
  // Agent Mode streams provider reasoning too; without painting it the thinking
  // block stayed empty until the turn settled, and it was never stored at all.
  let lastReasoningPaint = 0;
  const paintReasoning = (reasoning: string) => {
    if (!isCurrentGeneration() || !reasoning) return;
    const now = Date.now();
    if (now - lastReasoningPaint < 60) return;
    lastReasoningPaint = now;
    useChatsStore.getState().updateMessage(convId, assistant.id, { reasoning });
  };
  const upsertToolEvent = (ev: unknown) => {
    if (!isCurrentGeneration()) return;
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
    if (!isCurrentGeneration()) return;
    useChatsStore.getState().updateMessage(convId, assistant.id, {
      planSteps: steps as ChatMessage['planSteps'],
    });
  };

  // Title generation is a second provider request. Only make it after this
  // turn completed successfully; an auth/network failure or user stop must not
  // trigger another hidden request against the same broken endpoint.
  let shouldAutoTitle = false;
  // Start only when network work is about to begin. Image conversion may take
  // a moment locally and should not consume the provider-response allowance.
  noteProviderActivity();

  try {
    if (agentMode) {
      await runAgentTurn({
        target,
        messages: wire,
        systemPrompt: system,
        temperature: settings.generation.temperature,
        topP: settings.generation.topP,
        maxTokens: settings.generation.maxTokens,
        autoContinue: settings.behavior.autoContinue,
        confirmDangerous: settings.agentScope.confirmDangerous,
        signal: abort.signal,
        callbacks: {
          onText: (text) => {
            noteProviderActivity();
            paintContent(text);
          },
          onReasoning: (reasoning) => {
            noteProviderActivity();
            paintReasoning(reasoning);
          },
          onPlan: (steps) => {
            noteProviderActivity();
            upsertPlan(steps);
          },
          onToolEvent: (event) => {
            noteProviderActivity();
            upsertToolEvent(event);
          },
          onDone: ({ text, reasoning, ms, transcriptTail, toolCallCount, tokensIn, tokensOut, stopReason }) => {
            if (!isCurrentGeneration()) return;
            if (generation.idleTimeout) clearTimeout(generation.idleTimeout);
            shouldAutoTitle = stopReason !== 'aborted';
            useChatsStore.getState().updateMessage(convId, assistant.id, {
              content: text,
              reasoning: reasoning || undefined,
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
            if (!isCurrentGeneration()) return;
            if (generation.idleTimeout) clearTimeout(generation.idleTimeout);
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
          onContent: (content) => {
            noteProviderActivity();
            paintContent(content);
          },
          // Reasoning-capable providers may stream this separately from text.
          // Paint it live so the collapsed thinking panel is real, not a fake
          // label, and retain it when the reply settles.
          onReasoning: (reasoning) => {
            noteProviderActivity();
            paintReasoning(reasoning);
          },
        },
      });
      if (!isCurrentGeneration()) return true;
      if (generation.idleTimeout) clearTimeout(generation.idleTimeout);
      shouldAutoTitle = true;
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
    // Stop may already have settled the visible turn and allowed the user to
    // send again. A late native fetch rejection must not overwrite that newer
    // conversation state.
    if (!isCurrentGeneration()) return true;
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
    // Do not let an older aborted request clear a newer request for the same
    // chat. This also makes Stop visually immediate and safe to follow by a
    // model switch + resend.
    if (active.get(convId) === generation) {
      if (generation.idleTimeout) clearTimeout(generation.idleTimeout);
      active.delete(convId);
      useStreamingStore.getState().end(convId);
      useChatsStore.getState().touchConversation(convId);
      if (shouldAutoTitle) void maybeAutoTitle(convId, model);
    }
  }
  return true;
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
    // The Usage screen counts every provider request, including auto-titles.
    // Without this the rolling window and per-provider totals silently missed
    // one request for each successfully titled conversation.
    if (model) {
      useUsageStore.getState().record({
        profileId: model.profileId,
        model: model.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
    }
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
