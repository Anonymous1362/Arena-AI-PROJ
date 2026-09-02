import type { Role } from '@/src/store/chats';
import type { ThinkingLevel } from '@/src/store/settings';

export interface WireMessage {
  role: Role;
  content: string;
  /** OpenAI tool-calling fields (assistant messages / tool results). */
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
}

export interface EngineHandlers {
  /** Called with the accumulated plain answer so far (throttled). */
  onContent?: (content: string) => void;
  /** Called with accumulated reasoning so far (throttled). May never fire. */
  onReasoning?: (reasoning: string) => void;
  /** A model failed (404/429/503) and the request moved to a fallback model. */
  onModelFallback?: (model: string, status: number) => void;
  onDone?: (result: EngineResult) => void;
  onError?: (err: Error) => void;
}

export interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
  /** Raw OpenAI-format object, for echoing back into the transcript. */
  raw: unknown;
}

export interface EngineResult {
  content: string;
  reasoning?: string;
  tokensIn?: number;
  tokensOut?: number;
  ms: number;
  /** Tokens/sec (best-effort; usage-derived). */
  tps?: number;
  /** Tool calls requested by the model (agent loop). */
  toolCalls?: AccumulatedToolCall[];
  /** Provider finish_reason of the final chunk (stop | length | tool_calls …). */
  finishReason?: string;
}

/**
 * Wire-level generation parameters. `GenerationSettings` is assignable to this;
 * the extra fields are optional so lightweight calls (auto-titling, summaries)
 * don't have to carry the whole settings object.
 */
export interface EngineParams {
  temperature: number;
  topP: number;
  maxTokens: number;
  /** Reasoning / thinking level, mapped per provider by `catalog.thinkingFields`. */
  thinking?: ThinkingLevel;
  /** Ask the provider to stream thought summaries into the thinking panel. */
  showThinking?: boolean;
  systemPrompt?: string;
}

export interface EngineRequest {
  messages: WireMessage[];
  params: EngineParams;
  signal?: AbortSignal;
  handlers: EngineHandlers;
  /** OpenAI-format tools array (agent mode). */
  tools?: unknown[];
}

export interface RemoteTarget {
  baseUrl: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
}

/* ------------------------------ agent structures ----------------------------- */

export interface PlanStep {
  id: string;
  label: string;
  state: 'pending' | 'active' | 'done';
  /** Wall-clock ms when the step became active / finished — lets the UI bind
   *  tool events (commands, file writes) to the step that produced them. */
  startedAt?: number;
  doneAt?: number;
}

export interface ToolEvent {
  id: string;
  kind: 'command' | 'tool';
  title: string;
  detail: string;
  output: string;
  ok: boolean;
  running: boolean;
  ts: number;
}

export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}
