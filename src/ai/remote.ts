import { streamFetch } from '@/src/ai/net/fetch';
import type { RemoteTarget, EngineRequest, EngineResult } from '@/src/ai/types';
import { StreamAssembler } from '@/src/ai/assembler';
import type { RemoteProfile } from '@/src/store/settings';

/* ------------------------------ provider presets ----------------------------- */

export interface RemotePreset {
  id: string;
  name: string;
  baseUrl: string;
  /** Where to get an API key, if applicable. */
  keyUrl?: string;
  note?: string;
  noKey?: boolean;
  /** Local-network servers need no key and usually no app-store account. */
  localNetwork?: boolean;
  suggestedModels?: string[];
}

export const PROVIDER_PRESETS: RemotePreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Very fast inference, generous free tier.',
    suggestedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen/qwen3-32b'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Hundreds of models behind one key, incl. free tiers.',
    suggestedModels: [
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-chat-v3.1',
      'qwen/qwen3-235b-a22b',
      'google/gemini-2.0-flash-001',
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    suggestedModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-7B-Instruct-Turbo'],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    suggestedModels: ['mistral-small-latest', 'open-mistral-nemo'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    noKey: true,
    localNetwork: true,
    note: 'Models running on your own computer. Enable OLLAMA_HOST=0.0.0.0 and use your PC’s LAN IP on mobile.',
    suggestedModels: ['llama3.2', 'qwen2.5', 'mistral'],
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    baseUrl: 'http://192.168.1.10:1234/v1',
    noKey: true,
    localNetwork: true,
    note: 'Start the local server in LM Studio, then point this at your PC’s LAN IP.',
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp server',
    baseUrl: 'http://192.168.1.10:8080/v1',
    noKey: true,
    localNetwork: true,
    note: 'llama-server --host 0.0.0.0 on any machine on your network.',
  },
  {
    id: 'custom',
    name: 'Custom / self-hosted',
    baseUrl: '',
    note: 'Any OpenAI-compatible endpoint: vLLM, TGI, LiteLLM, Jan, Gin…',
  },
];

/* -------------------------------- url plumbing ------------------------------- */

export function chatCompletionsUrl(baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '');
  if (b.endsWith('/chat/completions')) return b;
  if (/\/v\d+$/.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

export function modelsUrl(baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '');
  if (b.endsWith('/chat/completions')) return `${b.replace(/\/chat\/completions$/, '')}/models`;
  if (/\/v\d+$/.test(b)) return `${b}/models`;
  return `${b}/v1/models`;
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

/* ---------------------------------- streaming -------------------------------- */

interface SseDelta {
  content?: string | null;
  reasoning?: string | null;
}

function extractDelta(json: any): SseDelta {
  const d = json?.choices?.[0]?.delta ?? {};
  return {
    content: d.content ?? null,
    reasoning: d.reasoning_content ?? d.reasoning ?? null,
  };
}

/**
 * Streams a chat completion from any OpenAI-compatible endpoint.
 * Falls back to a non-streaming request transparently if the runtime
 * cannot provide a response body stream.
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

  const body = JSON.stringify({
    model: target.model,
    messages: req.messages,
    stream: true,
    temperature: req.params.temperature,
    top_p: req.params.topP,
    max_tokens: req.params.maxTokens,
  });

  const res = await streamFetch(chatCompletionsUrl(target.baseUrl), {
    method: 'POST',
    headers: buildHeaders(target),
    body,
    signal: req.signal,
  });

  if (!res.ok) throw await errorFromResponse(res);

  const anyRes = res as any;
  if (!anyRes.body || typeof anyRes.body.getReader !== 'function') {
    // ---- non-streaming fallback ----
    const json: any = await res.json();
    const msg = json?.choices?.[0]?.message ?? {};
    const content: string = msg.content ?? '';
    const reasoning: string = msg.reasoning_content ?? msg.reasoning ?? '';
    req.handlers.onContent?.(content);
    if (reasoning) req.handlers.onReasoning?.(reasoning);
    const result: EngineResult = {
      content,
      reasoning: reasoning || undefined,
      tokensIn: json?.usage?.prompt_tokens,
      tokensOut: json?.usage?.completion_tokens,
      ms: Date.now() - started,
    };
    req.handlers.onDone?.(result);
    return result;
  }

  // ---- SSE streaming ----
  const reader = anyRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let usage: any = null;
  let sawDone = false;

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
    const delta = extractDelta(json);
    if (delta.reasoning) assembler.feed(delta.reasoning);
    if (delta.content) assembler.feed(delta.content);
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
  const approxTokens = Math.ceil((final.content.length + final.reasoning.length) / 4);
  const result: EngineResult = {
    content: final.content,
    reasoning: final.reasoning || undefined,
    tokensIn: usage?.prompt_tokens,
    tokensOut: usage?.completion_tokens ?? (sawDone || final.content ? approxTokens : 0),
    ms: Date.now() - started,
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
