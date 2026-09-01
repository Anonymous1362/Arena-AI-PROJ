import type { GenerationSettings } from '@/src/store/settings';
import type { Role } from '@/src/store/chats';

export interface WireMessage {
  role: Role;
  content: string;
}

export interface EngineHandlers {
  /** Called with the accumulated plain answer so far (throttled). */
  onContent?: (content: string) => void;
  /** Called with accumulated reasoning so far (throttled). May never fire. */
  onReasoning?: (reasoning: string) => void;
  onDone?: (result: EngineResult) => void;
  onError?: (err: Error) => void;
}

export interface EngineResult {
  content: string;
  reasoning?: string;
  tokensIn?: number;
  tokensOut?: number;
  ms: number;
  /** Tokens/sec (best-effort; llama.cpp timings or usage-derived). */
  tps?: number;
}

export interface EngineRequest {
  messages: WireMessage[];
  params: GenerationSettings;
  signal?: AbortSignal;
  handlers: EngineHandlers;
}

export interface RemoteTarget {
  baseUrl: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
}

export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}
