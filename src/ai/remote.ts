import { streamFetch } from '@/src/ai/net/fetch';
import type { RemoteTarget, EngineRequest, EngineResult, AccumulatedToolCall } from '@/src/ai/types';
import { StreamAssembler } from '@/src/ai/assembler';
import type { RemoteProfile } from '@/src/store/settings';
import {
  PROVIDER_PRESETS,
  chatCompletionsUrl,
  modelListUrls,
  modelsUrl,
  normalizeBase,
  cleanModelId,
  isChatModel,
  sortModelIds,
  thinkingFields,
  presetForBaseUrl,
  fallbackChainFor,
} from '@/src/ai/catalog';

/* Re-exported so existing imports (`@/src/ai/remote`) keep working. */
export { PROVIDER_PRESETS, chatCompletionsUrl, modelsUrl, normalizeBase };
export type { RemotePreset, Pricing, ApiStyle } from '@/src/ai/catalog';

/* --------------------------------- api errors -------------------------------- */

export class ApiError extends Error {
  status: number;
  /** Machine-readable provider code when the response carried one. */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function buildHeaders(target: Pick<RemoteTarget, 'apiKey' | 'headers' | 'baseUrl'>): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(target.headers ?? {}),
  };
  const key = target.apiKey?.trim();
  if (key) {
    h.Authorization = `Bearer ${key}`;
    // Google's native REST surface also accepts (and sometimes prefers) this.
    if (/generativelanguage\.googleapis\.com/i.test(target.baseUrl ?? '')) h['x-goog-api-key'] = key;
  }
  return h;
}

/** Turns a raw response into a helpful, actionable message. */
async function errorFromResponse(res: Response, url: string, model?: string): Promise<ApiError> {
  let detail = `${res.status} ${res.statusText || 'Request failed'}`;
  let code: string | undefined;
  try {
    const text = await res.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        detail = json?.error?.message ?? json?.message ?? json?.error ?? text;
        code = json?.error?.code ?? json?.error?.type ?? json?.code;
      } catch {
        detail = text.slice(0, 400);
      }
    }
  } catch {
    /* keep default */
  }
  if (typeof detail !== 'string') detail = JSON.stringify(detail);

  if (res.status === 401 || res.status === 403) {
    detail = `Auth failed (${res.status}). Check the API key — ${detail}`;
  } else if (res.status === 404) {
    const isModels = /\/models(\?|$)/.test(url);
    if (isModels) {
      detail = `Model list not found at ${url}. The base URL may be wrong — ${detail}`;
    } else if (model) {
      detail = `Model “${model}” was not found on this provider (${res.status}). Open the model picker and choose one from the live list. ${detail}`;
    } else {
      detail = `Not found (${res.status}). Check the base URL — ${detail}`;
    }
  } else if (res.status === 429) {
    detail = `Rate limited / quota exceeded (429). ${detail}`;
  } else if (res.status === 400) {
    detail = `The provider rejected the request (400). ${detail}`;
  }
  return new ApiError(res.status, detail, code);
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
      id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
      name: tc.name,
      arguments: tc.arguments || '{}',
      raw: { id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments || '{}' } },
    }))
    .filter((tc) => tc.name);
}

/* ---------------------------------- streaming -------------------------------- */

interface PostOptions {
  target: RemoteTarget;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}

async function postChat({ target, body, signal }: PostOptions): Promise<Response> {
  return streamFetch(chatCompletionsUrl(target.baseUrl), {
    method: 'POST',
    headers: buildHeaders(target),
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * Streams a chat completion from any OpenAI-compatible endpoint, with tool
 * calling and provider-native thinking control.
 *
 * Resilience: if a provider rejects an optional vendor extension (Gemini's
 * `extra_body` thinking config, `reasoning_effort` on models that don't
 * reason), we strip it and retry once so the request still succeeds.
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

  const p = req.params;
  const base: Record<string, unknown> = {
    model: target.model,
    messages: req.messages,
    stream: true,
    temperature: p.temperature,
    top_p: p.topP,
    max_tokens: p.maxTokens,
  };
  if (req.tools?.length) {
    base.tools = req.tools;
    base.tool_choice = 'auto';
  }
  const thinking = thinkingFields(target.model, p.thinking ?? 'auto', {
    includeThoughts: p.showThinking !== false,
  });

  let body: Record<string, unknown> = { ...base, ...thinking };
  let res = await postChat({ target, body, signal: req.signal });

  // ---- automatic model failover (404 retired model, 429 rate limit, 503) ----
  if (res.status === 404 || res.status === 429 || res.status === 503) {
    for (const next of fallbackChainFor(target.baseUrl, target.model)) {
      req.handlers.onModelFallback?.(next, res.status);
      body = { ...base, model: next, ...thinking };
      res = await postChat({ target: { ...target, model: next }, body, signal: req.signal });
      if (res.status !== 404 && res.status !== 429 && res.status !== 503) break;
    }
  }

  // Vendor-extension rejection → drop the extras and try again.
  if (res.status === 400 && Object.keys(thinking).length) {
    const text = await res.clone().text().catch(() => '');
    const mentionsExtras = /(extra_body|reasoning_effort|thinking|unsupported|unknown|invalid)/i.test(text);
    if (mentionsExtras) {
      body = { ...base };
      res = await postChat({ target, body, signal: req.signal });
    }
  }
  // A 404 on the completion URL usually means the base URL shape is wrong.
  if (res.status === 404 && !/\/chat\/completions$/.test(chatCompletionsUrl(target.baseUrl))) {
    /* nothing sensible to retry — surface the error below */
  }

  if (!res.ok) throw await errorFromResponse(res, chatCompletionsUrl(target.baseUrl), target.model);

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
  let streamError: ApiError | null = null;
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
    if (json?.error) {
      streamError = new ApiError(0, json.error?.message ?? 'Stream error', json.error?.code);
      return;
    }
    if (json?.usage) usage = json.usage;
    const choice = json?.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const delta = choice?.delta ?? {};
    // Reasoning / thought summaries arrive under several keys depending on the
    // provider — Gemini (include_thoughts), DeepSeek, Groq, OpenAI o-series.
    const thought =
      delta.reasoning_content ??
      delta.reasoning ??
      (delta.thought_summary && typeof delta.thought_summary === 'string' ? delta.thought_summary : undefined) ??
      (Array.isArray(delta.thoughts)
        ? delta.thoughts.map((t: any) => t?.text ?? '').join('') || undefined
        : undefined);
    if (thought) assembler.feedReasoning(thought);
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

  if (streamError) throw streamError;

  const final = assembler.flush();
  const approxTokens = Math.ceil(final.content.length / 4);
  const toolCalls = finalizeToolCalls(toolAcc);
  const tokensOut =
    usage?.completion_tokens ??
    usage?.output_tokens ??
    (sawDone || final.content ? approxTokens : 0);
  const tokensIn = usage?.prompt_tokens ?? usage?.input_tokens;

  const result: EngineResult = {
    content: final.content,
    reasoning: final.reasoning || undefined,
    tokensIn,
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
  const content: string = typeof msg.content === 'string' ? msg.content : '';
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
  const tokensOut = json?.usage?.completion_tokens ?? json?.usage?.output_tokens;
  const result: EngineResult = {
    content,
    reasoning: reasoning || undefined,
    tokensIn: json?.usage?.prompt_tokens ?? json?.usage?.input_tokens,
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
  /** Which URL actually answered (useful for debugging a wrong base URL). */
  url?: string;
}

/**
 * Lists models from a profile. Tries every plausible `/models` URL for the base
 * and understands both shapes:
 *  - OpenAI:      `{ data: [{ id }] }`
 *  - Gemini REST: `{ models: [{ name: "models/gemini-3.7-flash" }] }`
 */
export async function listRemoteModels(profile: RemoteProfile): Promise<ListModelsResult> {
  const base = normalizeBase(profile.baseUrl ?? '');
  if (!base) return { models: [], error: 'No base URL configured.' };

  const urls = modelListUrls(profile.baseUrl);
  let lastError = '';
  for (const url of urls) {
    try {
      const res = await streamFetch(url, { method: 'GET', headers: buildHeaders({ ...profile, baseUrl: base }) });
      if (!res.ok) {
        const e = await errorFromResponse(res, url);
        lastError = e.message;
        // 401/403 will not improve on the next URL — stop early with a clear message.
        if (e.status === 401 || e.status === 403) return { models: [], error: e.message, url };
        continue;
      }
      const json: any = await res.json();
      const raw = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.models)
          ? json.models
          : Array.isArray(json)
            ? json
            : [];
      const models = sortModelIds(
        raw
          .map((m: any) => (typeof m === 'string' ? m : m?.id ?? m?.name))
          .filter((id: unknown): id is string => typeof id === 'string')
          .map(cleanModelId)
          .filter((id: string) => id && isChatModel(id))
      );
      if (models.length) return { models, url };
      lastError = `Endpoint returned no models (${url}).`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  // Nothing answered. Give the user the curated list for a known provider so a
  // transient /models failure doesn't leave the picker empty.
  const preset = presetForBaseUrl(base);
  if (preset?.suggestedModels?.length) {
    return { models: [...preset.suggestedModels], error: lastError || undefined, url: urls[0] };
  }
  return { models: [], error: lastError || 'Could not reach the model list.', url: urls[0] };
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
