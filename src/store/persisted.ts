/**
 * Rehydration guards for persisted stores.
 *
 * AsyncStorage can hand back a truncated, partial, or tampered record, and
 * Zustand's default merge spreads whatever it finds over the live state. A
 * missing or wrong-typed field then reaches render code — for example the
 * theme provider reads `appearance.theme` before the first screen paints —
 * and the app can no longer boot to a usable screen. Every store therefore
 * validates its persisted slice field by field and keeps the in-memory default
 * for anything unusable, while preserving every valid record.
 */
import type {
  ActiveModel,
  AgentScope,
  AppearanceSettings,
  BehaviorSettings,
  GenerationSettings,
  RemoteProfile,
  SettingsState,
} from '@/src/store/settings';
import type { ChatMessage, ChatsState, Conversation } from '@/src/store/chats';
import type { PromptsState, SavedPrompt } from '@/src/store/prompts';
import type { UsageEvent, UsageState } from '@/src/store/usage';
import type { WireMessage } from '@/src/ai/types';

type Rec = Record<string, unknown>;

export function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function count(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/* ------------------------------- shared bounds ------------------------------ */

/**
 * The Generation and Usage screens enforce these ranges through steppers. The
 * stores apply the same bounds, so a rehydrated, imported, or hand-edited value
 * cannot reach a provider request as e.g. `max_tokens: 10000000` (rejected) or
 * `max_tokens: 1` (a useless reply), and a corrupt usage limit cannot hide the
 * real rolling count behind a zero-width bar.
 */
export const GENERATION_BOUNDS = {
  temperature: { min: 0, max: 2 },
  topP: { min: 0, max: 1 },
  maxTokens: { min: 128, max: 8192 },
} as const;

export const USAGE_LIMIT_BOUNDS = {
  hour: { min: 5, max: 500 },
  day: { min: 25, max: 5000 },
} as const;

function clampNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? clamp(value, min, max) : min;
}

export function clampGeneration(generation: GenerationSettings): GenerationSettings {
  return {
    temperature: clampNumber(
      generation.temperature,
      GENERATION_BOUNDS.temperature.min,
      GENERATION_BOUNDS.temperature.max
    ),
    topP: clampNumber(generation.topP, GENERATION_BOUNDS.topP.min, GENERATION_BOUNDS.topP.max),
    maxTokens: Math.round(
      clampNumber(generation.maxTokens, GENERATION_BOUNDS.maxTokens.min, GENERATION_BOUNDS.maxTokens.max)
    ),
    systemPrompt: generation.systemPrompt,
  };
}

export function clampUsageLimits(limits: { hour: number; day: number }): { hour: number; day: number } {
  return {
    hour: Math.round(clampNumber(limits.hour, USAGE_LIMIT_BOUNDS.hour.min, USAGE_LIMIT_BOUNDS.hour.max)),
    day: Math.round(clampNumber(limits.day, USAGE_LIMIT_BOUNDS.day.min, USAGE_LIMIT_BOUNDS.day.max)),
  };
}

/* --------------------------------- settings -------------------------------- */

export function sanitizeActiveModel(value: unknown): ActiveModel {
  if (!isRecord(value) || value.kind !== 'remote') return null;
  const profileId = optionalText(value.profileId);
  const model = optionalText(value.model);
  return profileId && model ? { kind: 'remote', profileId, model } : null;
}

function sanitizeProfile(value: unknown, seen: Set<string>): RemoteProfile | null {
  if (!isRecord(value)) return null;
  const id = optionalText(value.id);
  const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl : null;
  if (!id || baseUrl === null || seen.has(id)) return null;
  seen.add(id);

  const headers = isRecord(value.headers)
    ? (Object.fromEntries(
        Object.entries(value.headers).filter(([, header]) => typeof header === 'string')
      ) as Record<string, string>)
    : undefined;
  const suggestedModels = textList(value.suggestedModels);
  return {
    id,
    name: text(value.name, 'Provider'),
    baseUrl,
    apiKey: text(value.apiKey, ''),
    ...(headers && Object.keys(headers).length ? { headers } : {}),
    ...(suggestedModels.length ? { suggestedModels } : {}),
  };
}

function sanitizeModelCache(
  value: unknown,
  profileIds: Set<string>
): SettingsState['modelCache'] {
  if (!isRecord(value)) return {};
  const cache: SettingsState['modelCache'] = {};
  for (const [profileId, entry] of Object.entries(value)) {
    if (!profileIds.has(profileId) || !isRecord(entry)) continue;
    const models = textList(entry.models);
    const fetchedAt = count(entry.fetchedAt, 0);
    if (!models.length || fetchedAt <= 0) continue;
    cache[profileId] = { models, fetchedAt };
  }
  return cache;
}

function sanitizeGeneration(value: unknown, base: GenerationSettings): GenerationSettings {
  if (!isRecord(value)) return base;
  return clampGeneration({
    temperature: count(value.temperature, base.temperature),
    topP: count(value.topP, base.topP),
    maxTokens: count(value.maxTokens, base.maxTokens),
    systemPrompt: text(value.systemPrompt, base.systemPrompt),
  });
}

function sanitizeAgentScope(value: unknown, base: AgentScope): AgentScope {
  if (!isRecord(value)) return base;
  return {
    enabled: flag(value.enabled, base.enabled),
    storageEnabled: flag(value.storageEnabled, base.storageEnabled),
    // Containment is a product rule, not a persisted preference.
    workspaceOnly: true,
    ...(optionalText(value.safTreeUri) ? { safTreeUri: optionalText(value.safTreeUri) } : {}),
    ...(optionalText(value.safRootLabel) ? { safRootLabel: optionalText(value.safRootLabel) } : {}),
    confirmDangerous: flag(value.confirmDangerous, base.confirmDangerous),
    autoReadAloud: flag(value.autoReadAloud, base.autoReadAloud),
  };
}

function sanitizeAppearance(value: unknown, base: AppearanceSettings): AppearanceSettings {
  if (!isRecord(value)) return base;
  const theme =
    value.theme === 'light' || value.theme === 'dark' || value.theme === 'system'
      ? value.theme
      : base.theme;
  const messageTextSize =
    value.messageTextSize === 's' || value.messageTextSize === 'm' || value.messageTextSize === 'l'
      ? value.messageTextSize
      : base.messageTextSize;
  return { theme, messageTextSize, hapticsEnabled: flag(value.hapticsEnabled, base.hapticsEnabled) };
}

function sanitizeBehavior(value: unknown, base: BehaviorSettings): BehaviorSettings {
  if (!isRecord(value)) return base;
  return {
    autoTitle: flag(value.autoTitle, base.autoTitle),
    sendOnEnter: flag(value.sendOnEnter, base.sendOnEnter),
    autoContinue: flag(value.autoContinue, base.autoContinue),
  };
}

export function mergeSettingsState(persisted: unknown, current: SettingsState): SettingsState {
  if (!isRecord(persisted)) return current;

  const seen = new Set<string>();
  const profiles = Array.isArray(persisted.profiles)
    ? persisted.profiles.flatMap((item): RemoteProfile[] => {
        const profile = sanitizeProfile(item, seen);
        return profile ? [profile] : [];
      })
    : [];

  const candidateModel = sanitizeActiveModel(persisted.activeModel);
  const activeModel = candidateModel && seen.has(candidateModel.profileId) ? candidateModel : null;
  const activeProfileId =
    typeof persisted.activeProfileId === 'string' && seen.has(persisted.activeProfileId)
      ? persisted.activeProfileId
      : profiles[0]?.id ?? null;

  return {
    ...current,
    profiles,
    activeProfileId,
    activeModel,
    modelCache: sanitizeModelCache(persisted.modelCache, seen),
    generation: sanitizeGeneration(persisted.generation, current.generation),
    agentScope: sanitizeAgentScope(persisted.agentScope, current.agentScope),
    appearance: sanitizeAppearance(persisted.appearance, current.appearance),
    behavior: sanitizeBehavior(persisted.behavior, current.behavior),
    onboarded: flag(persisted.onboarded, current.onboarded),
  };
}

/* ---------------------------------- chats ---------------------------------- */

function validRole(value: unknown): ChatMessage['role'] | null {
  return value === 'user' || value === 'assistant' || value === 'system' ? value : null;
}

function sanitizeTranscriptTail(value: unknown): WireMessage[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tail = value.filter(
    (entry): entry is WireMessage =>
      isRecord(entry) &&
      (entry.role === 'user' ||
        entry.role === 'assistant' ||
        entry.role === 'system' ||
        entry.role === 'tool') &&
      typeof entry.content === 'string'
  );
  // Raw provider objects are preserved for agent continuation; only the
  // envelope is validated so a malformed entry cannot reach the request.
  return tail.length ? (tail as WireMessage[]) : undefined;
}

/** Shown when a stored reply was cut off before any text arrived. */
export const INTERRUPTED_REPLY_ERROR = 'Reply interrupted — tap Retry to ask again.';

/**
 * A message can be stored while it is still streaming: the app was killed
 * mid-reply, or a backup was exported during a turn. The stream that was going
 * to finish it is gone, so a persisted `done: false` would never settle — the
 * partial reply stayed out of every later request's history because history is
 * built from completed messages, and an empty bubble showed "…" with no Retry.
 * Settle it the way Stop would have: keep any partial text, and give an empty
 * assistant bubble an error so the ordinary Retry action is offered.
 */
export function settleInterruptedMessage(message: ChatMessage): ChatMessage {
  if (message.done) return message;
  if (message.content.trim() || message.reasoning?.trim() || message.error) {
    return { ...message, done: true };
  }
  if (message.role !== 'assistant') return { ...message, done: true };
  return { ...message, done: true, error: INTERRUPTED_REPLY_ERROR };
}

function sanitizeStoredMessage(value: unknown, fallbackTime: number): ChatMessage | null {
  if (!isRecord(value)) return null;
  const id = optionalText(value.id);
  const role = validRole(value.role);
  if (!id || !role || typeof value.content !== 'string') return null;

  const message: ChatMessage = {
    id,
    role,
    content: value.content,
    createdAt: count(value.createdAt, fallbackTime),
    done: flag(value.done, true),
  };
  const reasoning = optionalText(value.reasoning);
  const error = optionalText(value.error);
  if (reasoning !== undefined) message.reasoning = reasoning;
  if (error !== undefined) message.error = error;

  if (Array.isArray(value.attachments)) {
    const attachments = value.attachments.filter(
      (item): item is ChatMessage['attachments'] extends (infer T)[] | undefined ? T : never =>
        isRecord(item) && item.kind === 'image' && typeof item.uri === 'string' && !!item.uri
    );
    if (attachments.length) message.attachments = attachments;
  }
  if (isRecord(value.stats) && typeof value.stats.ms === 'number') {
    const stats = value.stats;
    message.stats = {
      ms: count(stats.ms, 0),
      ...(typeof stats.tokensIn === 'number' ? { tokensIn: stats.tokensIn } : {}),
      ...(typeof stats.tokensOut === 'number' ? { tokensOut: stats.tokensOut } : {}),
      ...(typeof stats.tps === 'number' ? { tps: stats.tps } : {}),
    };
  }
  if (Array.isArray(value.planSteps)) {
    const planSteps = value.planSteps.filter(
      (step): step is NonNullable<ChatMessage['planSteps']>[number] =>
        isRecord(step) &&
        typeof step.id === 'string' &&
        typeof step.label === 'string' &&
        (step.state === 'pending' || step.state === 'active' || step.state === 'done')
    );
    if (planSteps.length) message.planSteps = planSteps;
  }
  if (Array.isArray(value.toolEvents)) {
    const toolEvents = value.toolEvents.filter(
      (event): event is NonNullable<ChatMessage['toolEvents']>[number] =>
        isRecord(event) &&
        typeof event.id === 'string' &&
        typeof event.title === 'string' &&
        typeof event.detail === 'string' &&
        typeof event.output === 'string' &&
        typeof event.ts === 'number' &&
        (event.kind === 'command' || event.kind === 'tool') &&
        typeof event.ok === 'boolean' &&
        typeof event.running === 'boolean'
    );
    if (toolEvents.length) message.toolEvents = toolEvents;
  }
  const transcriptTail = sanitizeTranscriptTail(value.transcriptTail);
  if (transcriptTail) message.transcriptTail = transcriptTail;
  // Nothing is streaming after a relaunch, so a stored half-finished reply is
  // settled here rather than kept permanently in flight.
  return settleInterruptedMessage(message);
}

function sanitizeStoredConversation(value: unknown, seen: Set<string>): Conversation | null {
  if (!isRecord(value)) return null;
  const id = optionalText(value.id);
  if (!id || seen.has(id) || !Array.isArray(value.messages)) return null;
  seen.add(id);

  const messageIds = new Set<string>();
  const messages: ChatMessage[] = [];
  for (const item of value.messages) {
    const message = sanitizeStoredMessage(item, Date.now());
    if (!message || messageIds.has(message.id)) continue;
    messageIds.add(message.id);
    messages.push(message);
  }
  const createdAt = count(value.createdAt, messages[0]?.createdAt ?? Date.now());
  const updatedAt = count(value.updatedAt, messages.at(-1)?.createdAt ?? createdAt);
  const systemPromptOverride = optionalText(value.systemPromptOverride);
  return {
    id,
    title: text(value.title, 'New chat'),
    createdAt,
    updatedAt,
    pinned: flag(value.pinned, false),
    model: sanitizeActiveModel(value.model),
    messages,
    ...(systemPromptOverride ? { systemPromptOverride } : {}),
  };
}

export function mergeChatsState(persisted: unknown, current: ChatsState): ChatsState {
  if (!isRecord(persisted) || !Array.isArray(persisted.conversations)) return current;
  const seen = new Set<string>();
  const conversations = persisted.conversations.flatMap((item): Conversation[] => {
    const conversation = sanitizeStoredConversation(item, seen);
    return conversation ? [conversation] : [];
  });
  return { ...current, conversations };
}

/* --------------------------------- prompts --------------------------------- */

function sanitizePrompt(value: unknown, seen: Set<string>): SavedPrompt | null {
  if (!isRecord(value)) return null;
  const id = optionalText(value.id);
  if (!id || seen.has(id) || typeof value.body !== 'string') return null;
  seen.add(id);
  const createdAt = count(value.createdAt, Date.now());
  return {
    id,
    title: text(value.title, 'Untitled'),
    body: value.body,
    createdAt,
    updatedAt: count(value.updatedAt, createdAt),
  };
}

export function mergePromptsState(persisted: unknown, current: PromptsState): PromptsState {
  if (!isRecord(persisted) || !Array.isArray(persisted.prompts)) return current;
  const seen = new Set<string>();
  const prompts = persisted.prompts.flatMap((item): SavedPrompt[] => {
    const prompt = sanitizePrompt(item, seen);
    return prompt ? [prompt] : [];
  });
  return { ...current, prompts };
}

/* ---------------------------------- usage ---------------------------------- */

const MAX_USAGE_EVENTS = 500;

function sanitizeUsageEvent(value: unknown): UsageEvent | null {
  if (!isRecord(value)) return null;
  const t = count(value.t, NaN);
  const profileId = optionalText(value.p);
  const model = optionalText(value.m);
  if (!Number.isFinite(t) || !profileId || !model) return null;
  return {
    t,
    p: profileId,
    m: model,
    tin: Math.max(0, count(value.tin, 0)),
    tout: Math.max(0, count(value.tout, 0)),
  };
}

export function mergeUsageState(persisted: unknown, current: UsageState): UsageState {
  if (!isRecord(persisted)) return current;

  const events = Array.isArray(persisted.events)
    ? persisted.events
        .flatMap((item): UsageEvent[] => {
          const event = sanitizeUsageEvent(item);
          return event ? [event] : [];
        })
        .slice(-MAX_USAGE_EVENTS)
    : current.events;

  const totals = isRecord(persisted.totals)
    ? {
        requests: Math.max(0, count(persisted.totals.requests, current.totals.requests)),
        tokensIn: Math.max(0, count(persisted.totals.tokensIn, current.totals.tokensIn)),
        tokensOut: Math.max(0, count(persisted.totals.tokensOut, current.totals.tokensOut)),
      }
    : current.totals;

  const limits = isRecord(persisted.limits)
    ? clampUsageLimits({
        hour: count(persisted.limits.hour, current.limits.hour),
        day: count(persisted.limits.day, current.limits.day),
      })
    : current.limits;

  return { ...current, events, totals, limits };
}
