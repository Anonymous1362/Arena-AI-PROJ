import type { GenerationSettings } from '@/src/store/settings';
import type { Role } from '@/src/store/chats';

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

export interface EngineRequest {
  messages: WireMessage[];
  params: GenerationSettings;
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
