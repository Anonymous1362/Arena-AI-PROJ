/**
 * Context accounting + auto-compaction.
 *
 * The meter prefers **provider-reported** prompt tokens (the only number that
 * is actually true) and falls back to a character estimate for text that has
 * not been sent yet. When usage crosses the configured threshold we do *not*
 * delete anything — we compress:
 *
 *   1. Ask the model for a structured **Project Summary State**.
 *   2. Store it on the conversation and mark a cut point (`compactedBefore`).
 *   3. Keep the most recent turns verbatim as a "live tail" so the model still
 *      has exact wording for what just happened.
 *   4. Future requests send: system prompt + summary state + live tail.
 *
 * Older messages stay in the UI (and in exports) behind a "Context compacted"
 * divider, so nothing the user can see is ever silently destroyed. That is the
 * improvement over a naive "clear the log at 85%" rule.
 */
import { useChatsStore, type ChatMessage, type Conversation } from '@/src/store/chats';
import { useSettingsStore } from '@/src/store/settings';
import { resolveRemoteTarget } from '@/src/ai/engine';
import { streamRemoteChat } from '@/src/ai/remote';
import { contextWindowFor, formatContext } from '@/src/ai/catalog';
import { estimateTokens } from '@/src/utils/format';
import { haptics } from '@/src/utils/haptics';

/** Rough per-message protocol overhead (role, ids, separators). */
const PER_MESSAGE_OVERHEAD = 4;

export interface ContextUsage {
  used: number;
  window: number;
  pct: number;
  /** Where `used` came from: real provider accounting or our estimate. */
  source: 'provider' | 'estimate';
  label: string;
}

export function conversationTokens(conv: Conversation | undefined, systemPrompt = ''): number {
  if (!conv) return estimateTokens(systemPrompt);
  let total = estimateTokens(systemPrompt);
  for (const m of conv.messages) {
    total += estimateTokens(m.content) + estimateTokens(m.reasoning ?? '') + PER_MESSAGE_OVERHEAD;
    if (m.attachments?.length) total += 1200 * m.attachments.length; // images are token-heavy
    if (m.toolEvents?.length) {
      for (const ev of m.toolEvents) total += estimateTokens(ev.output) + estimateTokens(ev.detail);
    }
  }
  return total;
}

/**
 * Best current estimate of what the *next* request will cost.
 * Prefers the last provider-reported `prompt_tokens` and adds only what has
 * been appended since.
 */
export function contextUsageFor(conv: Conversation | undefined, systemPrompt = ''): ContextUsage {
  const settings = useSettingsStore.getState();
  const model = conv?.model ?? settings.activeModel;
  const modelName = model?.model ?? '';
  const window =
    settings.context.windowOverride > 0 ? settings.context.windowOverride : contextWindowFor(modelName);

  if (!conv) {
    const used = estimateTokens(systemPrompt);
    return { used, window, pct: window ? used / window : 0, source: 'estimate', label: `${formatContext(used)} / ${formatContext(window)}` };
  }

  const lastReported = [...conv.messages]
    .reverse()
    .find((m) => m.role === 'assistant' && typeof m.stats?.tokensIn === 'number');

  let used: number;
  let source: ContextUsage['source'] = 'estimate';
  if (lastReported?.stats?.tokensIn) {
    // Everything after the last provider report is not yet accounted for.
    const idx = conv.messages.findIndex((m) => m.id === lastReported.id);
    const tail = conv.messages.slice(idx + 1);
    const tailTokens = tail.reduce(
      (n, m) => n + estimateTokens(m.content) + estimateTokens(m.reasoning ?? '') + PER_MESSAGE_OVERHEAD,
      0
    );
    used = lastReported.stats.tokensIn + tailTokens;
    source = 'provider';
  } else {
    used = conversationTokens(conv, systemPrompt);
  }

  const pct = window > 0 ? Math.min(1.5, used / window) : 0;
  return { used, window, pct, source, label: `${formatContext(used)} / ${formatContext(window)}` };
}

/* -------------------------------- compaction -------------------------------- */

export const COMPACT_SYSTEM = `You are the memory keeper for a long-running coding agent session.
Produce a Project Summary State that lets a fresh session continue the work with zero loss of intent.
Be dense and factual. No preamble, no apology, no meta-commentary.`;

export const COMPACT_TEMPLATE = `Compress the conversation below into a **Project Summary State** using exactly these headings:

## Goal
One or two sentences: what the user is ultimately trying to build or fix.

## Stack & environment
Languages, frameworks, provider/model, sandbox or storage root, anything constraining the work.

## Done
Bullet list of concrete changes already made (files, functions, settings). Include exact identifiers.

## Current state
What works right now, what was last verified, and the last command or file touched.

## Open issues
Unresolved bugs, errors, TODOs, and any assumption that still needs checking.

## Next steps
The immediate next actions in priority order.

## Constraints & preferences
User rules that must survive (e.g. "no Termux", "must stay free", "always typecheck").

Conversation to compress:
<conversation>
{{TRANSCRIPT}}
</conversation>`;

/** Messages kept verbatim after a compaction (the "live tail"). */
const LIVE_TAIL_MESSAGES = 6;

export interface CompactResult {
  ok: boolean;
  summary?: string;
  freed?: number;
  error?: string;
}

const compacting = new Set<string>();
export const isCompacting = (convId: string) => compacting.has(convId);

/**
 * Runs a compaction for a conversation. Idempotent per conversation — a second
 * concurrent call returns immediately so a burst of sends can't double-compact.
 */
export async function compactConversation(convId: string, opts: { manual?: boolean } = {}): Promise<CompactResult> {
  if (compacting.has(convId)) return { ok: false, error: 'Already compacting.' };
  const chats = useChatsStore.getState();
  const settings = useSettingsStore.getState();
  const conv = chats.conversations.find((c) => c.id === convId);
  if (!conv) return { ok: false, error: 'Conversation not found.' };
  if (conv.messages.length < LIVE_TAIL_MESSAGES + 2) {
    return { ok: false, error: 'Nothing worth compacting yet.' };
  }

  const model = conv.model ?? settings.activeModel;
  if (!model) return { ok: false, error: 'No model configured.' };

  compacting.add(convId);
  try {
    const cutIndex = Math.max(0, conv.messages.length - LIVE_TAIL_MESSAGES);
    const archived = conv.messages.slice(0, cutIndex);
    const transcript = archived
      .map((m) => `${m.role.toUpperCase()}: ${truncateFor(m.content, 4000)}`)
      .join('\n\n');
    const prompt = COMPACT_TEMPLATE.replace('{{TRANSCRIPT}}', truncateFor(transcript, 60_000));

    const before = contextUsageFor(conv, conv.systemPromptOverride ?? settings.generation.systemPrompt);
    const target = resolveRemoteTarget(settings, model);
    const result = await streamRemoteChat(target, {
      messages: [
        { role: 'system', content: COMPACT_SYSTEM },
        { role: 'user', content: prompt },
      ],
      params: {
        temperature: 0.2,
        topP: 0.9,
        maxTokens: Math.min(4096, settings.generation.maxTokens),
        thinking: 'low',
      },
      handlers: {},
    });

    const summary = result.content.trim();
    if (!summary) return { ok: false, error: 'The model returned an empty summary.' };

    const cutId = archived[archived.length - 1]?.id;
    useChatsStore.getState().applyCompaction(convId, {
      summary,
      compactedBefore: cutId,
      archivedCount: archived.length,
    });

    const fresh = useChatsStore.getState().conversations.find((c) => c.id === convId);
    const after = contextUsageFor(fresh, conv.systemPromptOverride ?? settings.generation.systemPrompt);
    haptics.success();
    return { ok: true, summary, freed: Math.max(0, before.used - after.used) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    compacting.delete(convId);
  }
}

/**
 * Called after every completed turn. Triggers a compaction when the window is
 * filling up and the user has auto-compact on.
 */
export function maybeAutoCompact(convId: string): void {
  const settings = useSettingsStore.getState();
  if (!settings.context.autoCompact) return;
  const conv = useChatsStore.getState().conversations.find((c) => c.id === convId);
  if (!conv) return;
  const usage = contextUsageFor(conv, conv.systemPromptOverride ?? settings.generation.systemPrompt);
  const threshold = Math.min(95, Math.max(40, settings.context.compactAtPct)) / 100;
  if (usage.pct < threshold) return;
  if (conv.messages.length < LIVE_TAIL_MESSAGES + 2) return;
  void compactConversation(convId);
}

function truncateFor(text: string, max: number): string {
  const t = text ?? '';
  if (t.length <= max) return t;
  return `${t.slice(0, Math.floor(max * 0.7))}\n…[truncated]…\n${t.slice(-Math.floor(max * 0.25))}`;
}

/** The block injected into the system prompt after a compaction. */
export function summaryBlock(conv: Conversation | undefined): string {
  if (!conv?.summary) return '';
  return `\n\n<project_summary_state>\n${conv.summary}\n</project_summary_state>\n\nThe conversation above was compacted to stay inside the context window. Everything before the compaction is summarised in that block; the messages you can see after it are verbatim. Trust the summary for history and the live messages for exact wording.`;
}

/** Messages that still go on the wire for a conversation. */
export function liveMessages(conv: Conversation): ChatMessage[] {
  if (!conv.compactedBefore) return conv.messages;
  const idx = conv.messages.findIndex((m) => m.id === conv.compactedBefore);
  if (idx === -1) return conv.messages;
  return conv.messages.slice(idx + 1);
}
