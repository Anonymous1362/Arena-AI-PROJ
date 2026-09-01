/**
 * Web/PWA stub for the on-device engine.
 *
 * Browsers cannot load llama.rn (native module). The PWA stays fully usable
 * with remote OpenAI-compatible endpoints; see docs/BUILD-AND-INSTALL.md for
 * the roadmap to WASM/WebGPU on-device inference (wllama / WebLLM).
 */
import { EngineUnavailableError } from '@/src/ai/types';
import type { EngineRequest, EngineResult } from '@/src/ai/types';
import type { LocalModelRecord } from '@/src/store/settings';

export function isLocalSupported(): boolean {
  return false;
}

export function loadedModelId(): string | null {
  return null;
}

export async function unloadLocal(): Promise<void> {
  /* noop */
}

export async function ensureLocalModel(): Promise<void> {
  throw new EngineUnavailableError(
    'On-device models are available in the iOS & Android app. On the web, connect an OpenAI-compatible API instead.'
  );
}

export function cancelLocal(): void {
  /* noop */
}

export function setupLifecycle(): void {
  /* noop on web */
}

export async function runLocal(_record: LocalModelRecord, _req: EngineRequest): Promise<EngineResult> {
  throw new EngineUnavailableError(
    'On-device models are available in the iOS & Android app. On the web, connect an OpenAI-compatible API instead.'
  );
}
