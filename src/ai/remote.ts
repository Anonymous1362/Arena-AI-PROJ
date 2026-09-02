import { streamFetch } from '@/src/ai/net/fetch';
import type { RemoteTarget, EngineRequest, EngineResult, AccumulatedToolCall } from '@/src/ai/types';
import { StreamAssembler } from '@/src/ai/assembler';
import type { RemoteProfile } from '@/src/store/settings';

/* ------------------------------ provider presets ----------------------------- */

export type Pricing = 'free' | 'freemium' | 'paid' | 'local';

export interface RemotePreset {
  id: string;
  name: string;
  baseUrl: string;
  keyUrl?: string;
  note?: string;
  noKey?: boolean;
  localNetwork?: boolean;
  /** Free tier / freemium / pay-as-you-go / runs-on-your-machine. */
  pricing: Pricing;
  pricingNote?: string;
  /** Model ids shown as quick picks in the model panel. */
  suggestedModels?: string[];
  /** Which capabilities this provider/preset family is known to support. */
  caps?: ('tools' | 'vision' | 'reasoning')[];
}

export const PROVIDER_PRESETS: RemotePreset[] = [
  {
    pricing: 'paid',
    pricingNote: 'Pay per token. No free tier.',
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Claude models via the native Messages-compatible gateway (OpenAI-compatible base).',
    suggestedModels: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    caps: ['tools', 'vision', 'reasoning'],
  },
  {
    pricing: 'paid',
    pricingNote: 'Pay per token.',
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    suggestedModels: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini'],
    caps: ['tools', 'vision', 'reasoning'],
  },
  {
    pricing: 'free',
    pricingNote: 'Generous free tier at AI Studio — best first pick.',
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    note: 'Gemini via Google’s official OpenAI-compatible endpoint. 2.5/3.x models reason by default; thinking appears in the “Thought” panel.',
    suggestedModels: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-3.1-pro-preview',
    ],
    caps: ['tools', 'vision', 'reasoning'],
  },
  {
    pricing: 'free',
    pricingNote: 'Free tier with generous rate limits, very fast.',
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Very fast inference, generous free tier.',
    suggestedModels: ['llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'meta-llama/llama-4-scout-17b-16e-instruct'],
    caps: ['tools'],
  },
  {
    pricing: 'freemium',
    pricingNote: 'Free models available; premium models pay-per-token.',
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Hundreds of models behind one key, incl. free tiers. Great for xAI/Grok & Claude too.',
    suggestedModels: [
      'anthropic/claude-sonnet-4.5',
      'openai/gpt-5-mini',
      'google/gemini-2.5-flash',
      'x-ai/grok-4',
      'deepseek/deepseek-chat-v3.1',
    ],
    caps: ['tools', 'vision', 'reasoning'],
  },
  {
    pricing: 'paid',
    pricingNote: 'Trial credits for new accounts, then pay-per-token.',
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    suggestedModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-7B-Instruct-Turbo'],
    caps: ['tools'],
  },
  {
    pricing: 'freemium',
    pricingNote: 'Free tier on La Plateforme with rate limits.',
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    suggestedModels: ['mistral-large-latest', 'mistral-small-latest'],
    caps: ['tools'],
  },
  {
    pricing: 'paid',
    pricingNote: 'Very cheap per token.',
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    caps: ['tools', 'reasoning'],
  },
  {
    pricing: 'paid',
    pricingNote: 'Pay per token; trial credits vary.',
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    suggestedModels: ['grok-4', 'grok-4-mini', 'grok-4-fast', 'grok-3'],
    caps: ['tools', 'vision'],
  },
  {
    pricing: 'free',
    pricingNote: 'Free API tier, extremely fast inference.',
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyUrl: 'https://cloud.cerebras.ai',
    note: 'Wafer-scale speed. Free tier with high rate limits.',
    suggestedModels: ['llama-3.3-70b', 'qwen-3-32b', 'gpt-oss-120b'],
    caps: ['tools'],
  },
  {
    pricing: 'local',
    pricingNote: 'Free — runs on your own computer.',
    id: 'ollama',
    name: 'Ollama (your computer)',
    baseUrl: 'http://localhost:11434/v1',
    noKey: true,
    localNetwork: true,
    note: 'Models running on your own computer. Enable OLLAMA_HOST=0.0.0.0 and use your PC’s LAN IP on mobile.',
    suggestedModels: ['qwen3', 'llama3.2', 'mistral'],
    caps: ['tools'],
  },
  {
    pricing: 'local',
    pricingNote: 'Free — runs on your own computer.',
    id: 'lmstudio',
    name: 'LM Studio (your computer)',
    baseUrl: 'http://192.168.1.10:1234/v1',
    noKey: true,
    localNetwork: true,
    note: 'Start the local server in LM Studio, then point this at your PC’s LAN IP.',
    caps: ['tools'],
  },
  {
    pricing: 'paid',
    id: 'custom',
    name: 'Custom / self-hosted',
    baseUrl: '',
    note: 'Any OpenAI-compatible endpoint: vLLM, LiteLLM, TGI, Gin…',
    caps: ['tools'],
  },
];

/* -------------------------------- url plumbing ------------------------------- */

/**
 * Normalises any OpenAI-compatible base URL to a bare endpoint *root* (no
 * trailing slash, no /chat/completions or /models suffix).
 *
 * Recognised shapes:
 *   https://api.openai.com/v1            → versioned root
 *   https://api.groq.com/openai/v1       → versioned root
 *   https://api.anthropic.com/v1         → versioned root (OpenAI-compat layer)
 *   https://generativelanguage.googleapis.com/v1beta/openai  → Google OpenAI-compat root
 *   https://generativelanguage.googleapis.com/v1beta/open    → legacy Google root
 *   https://host.example.com             → unversioned host (gets /v1)
 */
function endpointRoot(baseUrl: string): string {
  let b = baseUrl.trim().replace(/\/+$/, '');
  b = b.replace(/\/chat\/completions$/, '').replace(/\/models$/, '');
  return b;
}

/** True when the root already carries its own API version / compat marker. */
function isVersionedRoot(b: string): boolean {
  if (!b) return false;
  // Google's OpenAI-compat endpoints: .../v1beta/open, .../v1beta/openai
  if (/\/v\d+beta\/openai?$/i.test(b)) return true;
  // Versioned OpenAI roots: /v1, /v1.5, /v2 …
  return /\/v\d+(\.\d+)?$/i.test(b);
}

export function chatCompletionsUrl(baseUrl: string): string {
  const b = endpointRoot(baseUrl);
  if (!b) return baseUrl;
  return isVersionedRoot(b) ? `${b}/chat/completions` : `${b}/v1/chat/completions`;
}

export function modelsUrl(baseUrl: string): string {
  const b = endpointRoot(baseUrl);
  if (!b) return baseUrl;
  return isVersionedRoot(b) ? `${b}/models` : `${b}/v1/models`;
}

function buildHeaders(target: Pick<RemoteTarget, 'apiKey' | 'headers'>): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(target.headers ?? {}),
  };
  if (target.apiKey && target.apiKey.trim()) h.Authorization = `Bearer ${target.apiKey.trim()}`;
  return h;
}

/* --------------------------------- api errors -------------------------------- */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  let detail = `${res.status} ${res.statusText || 'Request failed'}`;
  try {
    const text = await res.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        detail = json?.error?.message ?? json?.message ?? json?.error ?? text;
      } catch {
        detail = text.slice(0, 400);
      }
    }
  } catch {
    /* keep default */
  }
  if (res.status === 401) detail = `Unauthorized — check your API key. (${detail})`;
  if (res.status === 404) detail = `Not found — check the base URL. (${detail})`;
  if (res.status === 429) detail = `Rate limited / quota exceeded. (${detail})`;
  return new ApiError(res.status, detail);
}

/* ------------------------------ tool-call deltas ----------------------------- */

interface ToolCallAccum {
  id: string;
  name: string;
  arguments: string;
}

function mergeToolCallDelta(acc: Map<number, ToolCallAccum>, deltas: any[]): void {
  for (const d of deltas) {
    const idx = Number(d.index ?? 0);
    const cur = acc.get(idx) ?? { id: '', name: '', arguments: '' };
    if (d.id) cur.id = d.id;
    if (d.function?.name) cur.name = d.function.name;
    if (d.function?.arguments) cur.arguments += d.function.arguments;
    acc.set(idx, cur);
  }
}

function finalizeToolCalls(acc: Map<number, ToolCallAccum>): AccumulatedToolCall[] {
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, tc]) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments || '{}',
      raw: { id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments || '{}' } },
    }));
}

/* ---------------------------------- streaming -------------------------------- */

/**
 * Streams a chat completion from any OpenAI-compatible endpoint, with tool
 * calling. Falls back to a non-streaming request if the runtime cannot
 * provide a response body stream.
 */
export async function streamRemoteChat(target: RemoteTarget, req: EngineRequest): Promise<EngineResult> {
  const started = Date.now();
  const assembler = new StreamAssembler({
    throttleMs: 80,
    onUpdate: (content, reasoning) => {
      req.handlers.onContent?.(content);
      if (reasoning) req.handlers.onReasoning?.(reasoning);
    },
  });

  const body: Record<string, unknown> = {
    model: target.model,
    messages: req.messages,
    stream: true,
    temperature: req.params.temperature,
    top_p: req.params.topP,
    max_tokens: req.params.maxTokens,
  };
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = 'auto';
  }

  const res = await streamFetch(chatCompletionsUrl(target.baseUrl), {
    method: 'POST',
    headers: buildHeaders(target),
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!res.ok) throw await errorFromResponse(res);

  const anyRes = res as any;
  if (!anyRes.body || typeof anyRes.body.getReader !== 'function') {
    return nonStreamingResponse(req, await res.json(), started);
  }

  // ---- SSE streaming ----
  const reader = anyRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let usage: any = null;
  let sawDone = false;
  let finishReason: string | undefined;
  const toolAcc = new Map<number, ToolCallAccum>();

  const handleLine = (raw: string) => {
    const line = raw.trim();
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === '[DONE]') {
      sawDone = true;
      return;
    }
    let json: any;
    try {
      json = JSON.parse(payload);
    } catch {
      return; // tolerate keep-alives / malformed fragments
    }
    if (json?.error) throw new ApiError(0, json.error?.message ?? 'Stream error');
    if (json?.usage) usage = json.usage;
    const choice = json?.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const delta = choice?.delta ?? {};
    if (delta.reasoning_content) assembler.feed(delta.reasoning_content);
    else if (delta.reasoning) assembler.feed(delta.reasoning);
    if (delta.content) assembler.feed(delta.content);
    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
      mergeToolCallDelta(toolAcc, delta.tool_calls);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        handleLine(line);
      }
    }
    if (buf.trim()) handleLine(buf);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }

  const final = assembler.flush();
  const approxTokens = Math.ceil(final.content.length / 4);
  const toolCalls = finalizeToolCalls(toolAcc);
  const tokensOut = usage?.completion_tokens ?? (sawDone || final.content ? approxTokens : 0);

  const result: EngineResult = {
    content: final.content,
    reasoning: final.reasoning || undefined,
    tokensIn: usage?.prompt_tokens,
    tokensOut,
    ms: Date.now() - started,
    tps: tokensOut && Date.now() - started > 0 ? tokensOut / ((Date.now() - started) / 1000) : undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    finishReason,
  };
  req.handlers.onDone?.(result);
  return result;
}

function nonStreamingResponse(req: EngineRequest, json: any, started: number): EngineResult {
  const msg = json?.choices?.[0]?.message ?? {};
  const content: string = msg.content ?? '';
  const reasoning: string = msg.reasoning_content ?? msg.reasoning ?? '';
  req.handlers.onContent?.(content);
  if (reasoning) req.handlers.onReasoning?.(reasoning);
  const rawToolCalls: any[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  const toolCalls: AccumulatedToolCall[] = rawToolCalls.map((tc, i) => ({
    id: tc.id ?? `call_${i}`,
    name: tc.function?.name ?? '',
    arguments: tc.function?.arguments ?? '{}',
    raw: tc,
  }));
  const tokensOut = json?.usage?.completion_tokens;
  const result: EngineResult = {
    content,
    reasoning: reasoning || undefined,
    tokensIn: json?.usage?.prompt_tokens,
    tokensOut,
    ms: Date.now() - started,
    tps: tokensOut ? tokensOut / ((Date.now() - started) / 1000) : undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    finishReason: json?.choices?.[0]?.finish_reason,
  };
  req.handlers.onDone?.(result);
  return result;
}

/* ------------------------------- models listing ------------------------------ */

export interface ListModelsResult {
  models: string[];
  error?: string;
}

export async function listRemoteModels(profile: RemoteProfile): Promise<ListModelsResult> {
  if (!profile.baseUrl?.trim()) return { models: [], error: 'No base URL configured.' };
  try {
    const res = await streamFetch(modelsUrl(profile.baseUrl), {
      method: 'GET',
      headers: buildHeaders(profile),
    });
    if (!res.ok) throw await errorFromResponse(res);
    const json: any = await res.json();
    const data = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    const models = data
      .map((m: any) => (typeof m === 'string' ? m : m?.id))
      .filter((id: unknown): id is string => typeof id === 'string')
      .sort((a: string, b: string) => a.localeCompare(b));
    return { models };
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Quick connectivity test used by the API-settings screen. */
export async function testRemoteProfile(
  profile: RemoteProfile
): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  const res = await listRemoteModels(profile);
  if (res.models.length > 0) return { ok: true, models: res.models };
  if (res.error) return { ok: false, error: res.error };
  return { ok: false, error: 'Endpoint returned no models.' };
}
