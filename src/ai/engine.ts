import type { ActiveModel } from '@/src/store/settings';
import { useSettingsStore, type SettingsState } from '@/src/store/settings';
import type { EngineRequest, EngineResult, RemoteTarget, WireMessage } from '@/src/ai/types';
import { streamRemoteChat } from '@/src/ai/remote';
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

/**
 * Keep the prompt within a sane budget: always keep the system prompt,
 * then pack messages newest-first until the token budget is exhausted.
 */
export function buildWireMessages(
  history: { role: WireMessage['role']; content: string }[],
  systemPrompt: string,
  maxTokens: number
): WireMessage[] {
  const budget = Math.max(2048, 32768 - maxTokens - 512);
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
