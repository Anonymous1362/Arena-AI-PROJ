import { settleInterruptedMessage } from '@/src/store/persisted';
import type { ActiveModel } from '@/src/store/settings';
import type { PlanStep, ToolEvent, WireMessage } from '@/src/ai/types';
import type { ChatMessage, Conversation, GenStats, MessageAttachment, Role } from '@/src/store/chats';

type UnknownRecord = Record<string, unknown>;

export interface ConversationImportResult {
  conversations: Conversation[];
  skippedConversations: number;
  skippedMessages: number;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function validRole(value: unknown): Role | null {
  return value === 'user' || value === 'assistant' || value === 'system' ? value : null;
}

function sanitizeActiveModel(value: unknown): ActiveModel {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || value.kind !== 'remote') return null;
  const profileId = nonEmptyString(value.profileId);
  const model = nonEmptyString(value.model);
  return profileId && model ? { kind: 'remote', profileId, model } : null;
}

function sanitizeAttachments(value: unknown): MessageAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments = value.flatMap((item): MessageAttachment[] => {
    if (!isRecord(item) || item.kind !== 'image') return [];
    const uri = nonEmptyString(item.uri);
    if (!uri) return [];
    const mime = optionalString(item.mime);
    const name = optionalString(item.name);
    return [{ kind: 'image', uri, ...(mime ? { mime } : {}), ...(name ? { name } : {}) }];
  });
  return attachments.length ? attachments : undefined;
}

function sanitizeStats(value: unknown): GenStats | undefined {
  if (!isRecord(value)) return undefined;
  const ms = finiteNumber(value.ms);
  if (ms === undefined) return undefined;
  const tokensIn = finiteNumber(value.tokensIn);
  const tokensOut = finiteNumber(value.tokensOut);
  const tps = finiteNumber(value.tps);
  return {
    ms,
    ...(tokensIn === undefined ? {} : { tokensIn }),
    ...(tokensOut === undefined ? {} : { tokensOut }),
    ...(tps === undefined ? {} : { tps }),
  };
}

function sanitizePlanSteps(value: unknown): PlanStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.flatMap((item): PlanStep[] => {
    if (!isRecord(item)) return [];
    const id = nonEmptyString(item.id);
    const label = optionalString(item.label);
    const state = item.state;
    if (!id || label === undefined || (state !== 'pending' && state !== 'active' && state !== 'done')) return [];
    return [{ id, label, state }];
  });
  return steps.length ? steps : undefined;
}

function sanitizeToolEvents(value: unknown): ToolEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const events = value.flatMap((item): ToolEvent[] => {
    if (!isRecord(item)) return [];
    const id = nonEmptyString(item.id);
    const title = optionalString(item.title);
    const detail = optionalString(item.detail);
    const output = optionalString(item.output);
    const kind = item.kind;
    const ts = finiteNumber(item.ts);
    if (!id || title === undefined || detail === undefined || output === undefined || ts === undefined || (kind !== 'command' && kind !== 'tool') || typeof item.ok !== 'boolean' || typeof item.running !== 'boolean') return [];
    return [{ id, title, detail, output, kind, ts, ok: item.ok, running: item.running }];
  });
  return events.length ? events : undefined;
}

function sanitizeTranscriptTail(value: unknown): WireMessage[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const messages = value.flatMap((item): WireMessage[] => {
    if (!isRecord(item)) return [];
    const role = validRole(item.role);
    const content = optionalString(item.content);
    if (!role || content === undefined) return [];
    const toolCallId = optionalString(item.tool_call_id);
    const name = optionalString(item.name);
    // Raw provider tool-call payloads are intentionally not imported. A backup
    // must never inject an unreviewed tool call into a later agent continuation.
    return [{ role, content, ...(toolCallId ? { tool_call_id: toolCallId } : {}), ...(name ? { name } : {}) }];
  });
  return messages.length ? messages : undefined;
}

function sanitizeMessage(value: unknown, fallbackTime: number): ChatMessage | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const role = validRole(value.role);
  const content = optionalString(value.content);
  if (!id || !role || content === undefined) return null;

  const message: ChatMessage = {
    id,
    role,
    content,
    createdAt: finiteNumber(value.createdAt) ?? fallbackTime,
    done: typeof value.done === 'boolean' ? value.done : true,
  };
  const reasoning = optionalString(value.reasoning);
  const error = optionalString(value.error);
  const attachments = sanitizeAttachments(value.attachments);
  const stats = sanitizeStats(value.stats);
  const planSteps = sanitizePlanSteps(value.planSteps);
  const toolEvents = sanitizeToolEvents(value.toolEvents);
  const transcriptTail = sanitizeTranscriptTail(value.transcriptTail);
  if (reasoning !== undefined) message.reasoning = reasoning;
  if (error !== undefined) message.error = error;
  if (attachments) message.attachments = attachments;
  if (stats) message.stats = stats;
  if (planSteps) message.planSteps = planSteps;
  if (toolEvents) message.toolEvents = toolEvents;
  if (transcriptTail) message.transcriptTail = transcriptTail;
  // A backup can be exported while a reply is generating. Nothing will ever
  // finish that stream after the import, so it is settled instead of arriving
  // as a permanently in-flight message that no later request can use.
  return settleInterruptedMessage(message);
}

function sanitizeConversation(value: unknown, fallbackTime: number): { conversation: Conversation; skippedMessages: number } | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  if (!id || !Array.isArray(value.messages)) return null;

  let skippedMessages = 0;
  const messageIds = new Set<string>();
  const messages: ChatMessage[] = [];
  for (const message of value.messages) {
    const sanitized = sanitizeMessage(message, fallbackTime);
    if (!sanitized || messageIds.has(sanitized.id)) {
      skippedMessages += 1;
      continue;
    }
    messageIds.add(sanitized.id);
    messages.push(sanitized);
  }
  const createdAt = finiteNumber(value.createdAt) ?? messages[0]?.createdAt ?? fallbackTime;
  const updatedAt = finiteNumber(value.updatedAt) ?? messages.at(-1)?.createdAt ?? createdAt;
  const systemPromptOverride = optionalString(value.systemPromptOverride);

  return {
    conversation: {
      id,
      title: optionalString(value.title)?.trim() || 'Imported chat',
      createdAt,
      updatedAt,
      pinned: value.pinned === true,
      model: sanitizeActiveModel(value.model),
      messages,
      ...(systemPromptOverride?.trim() ? { systemPromptOverride } : {}),
    },
    skippedMessages,
  };
}

/**
 * Extracts a Copper conversation backup without trusting arbitrary JSON shape.
 * Invalid conversations/messages are skipped; the caller can report the exact
 * count rather than claiming that every array item was imported.
 */
export function sanitizeImportedConversations(value: unknown, now = Date.now()): ConversationImportResult | null {
  const candidates = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.conversations)
      ? value.conversations
      : isRecord(value) && isRecord(value.conversation)
        ? [value.conversation]
        : null;
  if (!candidates) return null;

  const ids = new Set<string>();
  let skippedConversations = 0;
  let skippedMessages = 0;
  const conversations: Conversation[] = [];
  for (const candidate of candidates) {
    const sanitized = sanitizeConversation(candidate, now);
    if (!sanitized || ids.has(sanitized.conversation.id)) {
      skippedConversations += 1;
      continue;
    }
    ids.add(sanitized.conversation.id);
    skippedMessages += sanitized.skippedMessages;
    conversations.push(sanitized.conversation);
  }
  return { conversations, skippedConversations, skippedMessages };
}
