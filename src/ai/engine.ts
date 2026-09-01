import { Platform } from 'react-native';
import type { ActiveModel } from '@/src/store/settings';
import { useSettingsStore, type SettingsState } from '@/src/store/settings';
import type { EngineRequest, EngineResult, RemoteTarget, WireMessage } from '@/src/ai/types';
import { streamRemoteChat } from '@/src/ai/remote';
import { runLocal, cancelLocal, isLocalSupported, setupLifecycle } from '@/src/ai/local/LocalEngine';
import { estimateTokens } from '@/src/utils/format';

export { cancelLocal, isLocalSupported, setupLifecycle };

export class NoEngineError extends Error {
  constructor() {
    super('No model selected — pick an on-device model or connect an API in Settings.');
    this.name = 'NoEngineError';
  }
}

/** Resolve the active model into a remote target, or throw a friendly error. */
export function resolveRemoteTarget(state: SettingsState, model: ActiveModel): RemoteTarget {
  const profileId = model?.kind === 'remote' ? model.profileId : state.activeProfileId;
  const profile = state.profiles.find((p) => p.id === profileId) ?? state.profiles[0];
  if (!profile) throw new NoEngineError();
  if (!profile.baseUrl?.trim()) throw new Error(`“${profile.name}” has no base URL — edit it in Settings → API.`);
  const modelName = model?.kind === 'remote' ? model.model : '';
  if (!modelName) throw new NoEngineError();
  return { baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: modelName, headers: profile.headers };
}

export function resolveLocalRecord(state: SettingsState, model: ActiveModel) {
  const modelId = model?.kind === 'local' ? model.modelId : null;
  const record = modelId ? state.localModels.find((m) => m.id === modelId) : null;
  if (!record) throw new NoEngineError();
  return record;
}

/**
 * Keep the prompt within the loaded context: always keep the system prompt,
 * then pack messages newest-first until the token budget is exhausted.
 */
export function buildWireMessages(
  history: { role: WireMessage['role']; content: string }[],
  systemPrompt: string,
  contextSize: number,
  maxTokens: number
): WireMessage[] {
  const budget = Math.max(512, contextSize - maxTokens - 256);
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

/** Single entry point used by the session orchestrator. */
export async function runGeneration(opts: {
  model: ActiveModel;
  request: Omit<EngineRequest, 'handlers'> & { handlers: EngineRequest['handlers'] };
}): Promise<EngineResult> {
  const state = useSettingsStore.getState();
  const { model } = opts;
  const req = opts.request;

  if (model?.kind === 'local') {
    if (!isLocalSupported()) throw new Error('On-device models require the native app.');
    const record = resolveLocalRecord(state, model);
    return runLocal(record, req);
  }

  const target = resolveRemoteTarget(state, model);
  return streamRemoteChat(target, req);
}

export function describeModel(model: ActiveModel): string {
  const state = useSettingsStore.getState();
  if (!model) return 'No model';
  if (model.kind === 'local') {
    const rec = state.localModels.find((m) => m.id === model.modelId);
    return rec?.name ?? 'On-device model';
  }
  const profile = state.profiles.find((p) => p.id === model.profileId);
  return model.model || profile?.name || 'Remote model';
}
