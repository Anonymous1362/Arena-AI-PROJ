import type { ActiveModel } from '@/src/store/settings';
import { useSettingsStore, type SettingsState } from '@/src/store/settings';
import type { EngineRequest, EngineResult, RemoteTarget, WireMessage } from '@/src/ai/types';
import { streamRemoteChat } from '@/src/ai/remote';
import { contextWindowFor } from '@/src/ai/catalog';
import { estimateTokens } from '@/src/utils/format';

export class NoEngineError extends Error {
  constructor() {
    super('No model selected — connect an API in Settings → Providers.');
    this.name = 'NoEngineError';
  }
}

/** Resolve the active model into a remote target, or throw a friendly error. */
export function resolveRemoteTarget(state: SettingsState, model: ActiveModel): RemoteTarget {
  const profileId = model?.profileId ?? state.activeProfileId;
  const profile = state.profiles.find((p) => p.id === profileId) ?? state.profiles[0];
  if (!profile) throw new NoEngineError();
  if (!profile.baseUrl?.trim()) {
    throw new Error(`“${profile.name}” has no base URL — edit it in Settings → Providers.`);
  }
  const modelName = model?.model ?? '';
  if (!modelName) throw new NoEngineError();
  return { baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: modelName, headers: profile.headers };
}

/** Effective context window for the active model, honouring the user override. */
export function effectiveWindow(model: ActiveModel, state: SettingsState = useSettingsStore.getState()): number {
  const override = state.context?.windowOverride ?? 0;
  if (override > 0) return override;
  return contextWindowFor(model?.model ?? '');
}

/**
 * Keep the prompt inside the real window: always keep the system prompt,
 * reserve room for the reply, then pack messages newest-first until the budget
 * is exhausted. Older models were hard-coded to 32K — now the budget follows
 * the model (1M for Gemini 3.x, 200K for Claude 4, …).
 */
export function buildWireMessages(
  history: { role: WireMessage['role']; content: string }[],
  systemPrompt: string,
  maxTokens: number,
  contextWindow = 131_072
): WireMessage[] {
  // Leave room for the reply, for tool schemas and for a safety margin.
  const reserve = Math.max(2048, maxTokens) + 2048;
  const budget = Math.max(4096, Math.min(contextWindow - reserve, 900_000));

  const kept: WireMessage[] = [];
  let used = estimateTokens(systemPrompt);

  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === 'system') continue;
    const t = estimateTokens(m.content);
    if (used + t > budget && kept.length > 0) break;
    used += t;
    kept.unshift({ role: m.role, content: m.content });
  }

  if (systemPrompt.trim()) {
    return [{ role: 'system', content: systemPrompt.trim() }, ...kept];
  }
  return kept;
}

/** Plain (non-agent) streaming completion. The agent loop wraps this. */
export async function runGeneration(req: EngineRequest): Promise<EngineResult> {
  const state = useSettingsStore.getState();
  const target = resolveRemoteTarget(state, state.activeModel);
  return streamRemoteChat(target, req);
}

export function describeModel(model: ActiveModel): string {
  const state = useSettingsStore.getState();
  if (!model) return 'No model';
  const profile = state.profiles.find((p) => p.id === model.profileId);
  return model.model || profile?.name || 'Remote model';
}
