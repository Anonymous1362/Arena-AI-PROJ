import type { ActiveModel } from '@/src/store/settings';
import { useSettingsStore, type SettingsState } from '@/src/store/settings';
import type { EngineRequest, EngineResult, RemoteTarget, WireMessage } from '@/src/ai/types';
import { streamRemoteChat, validateRemoteBaseUrl } from '@/src/ai/remote';
import { estimateTokens } from '@/src/utils/format';

export class NoEngineError extends Error {
  constructor() {
    super('No model selected — connect an API in Settings → Providers.');
    this.name = 'NoEngineError';
  }
}

/** Resolve the active model into a remote target, or throw a friendly error. */
export function resolveRemoteTarget(state: SettingsState, model: ActiveModel): RemoteTarget {
  const modelName = typeof model?.model === 'string' ? model.model.trim() : '';
  const profileId = typeof model?.profileId === 'string' ? model.profileId : '';
  if (!modelName || !profileId) throw new NoEngineError();

  // A conversation records the provider that supplied its selected model. Do
  // not silently send an imported or stale conversation through an unrelated
  // first provider just because that original profile no longer exists.
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) {
    throw new Error(
      `The provider for “${modelName}” is no longer configured. Pick a model or add its provider in Settings → Providers.`
    );
  }
  const endpoint = validateRemoteBaseUrl(profile.baseUrl ?? '');
  if (!endpoint.ok) {
    throw new Error(`“${profile.name}” has an invalid base URL — ${endpoint.error} Edit it in Settings → Providers.`);
  }
  return { baseUrl: endpoint.baseUrl, apiKey: profile.apiKey, model: modelName, headers: profile.headers };
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
