/**
 * On-device inference engine (native only).
 *
 * Wraps llama.rn (llama.cpp bindings). Models run 100% offline on-device:
 * no network, no server, no account. Only one model stays loaded at a time;
 * switching models releases the previous context.
 */
import { initLlama, releaseAllLlama } from 'llama.rn';
import type { EngineRequest, EngineResult } from '@/src/ai/types';
import type { LocalModelRecord } from '@/src/store/settings';
import { catalogById, fallbackChatTemplate } from '@/src/ai/local/catalog';
import { StreamAssembler } from '@/src/ai/assembler';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RawContext {
  completion: (params: any, callback?: (data: any) => void) => Promise<any>;
  stopCompletion: () => any;
  release?: () => Promise<void>;
  getFormattedChat?: (messages: any[], template?: string) => Promise<any>;
}

let loaded: { id: string; ctx: RawContext } | null = null;

export function isLocalSupported(): boolean {
  return true;
}

export function loadedModelId(): string | null {
  return loaded?.id ?? null;
}

export async function unloadLocal(): Promise<void> {
  if (!loaded) return;
  const ctx = loaded.ctx;
  loaded = null;
  try {
    await ctx.stopCompletion?.();
  } catch {
    /* noop */
  }
  try {
    await ctx.release?.();
  } catch {
    /* noop */
  }
}

/** Load a GGUF file into a llama.cpp context (swaps out any previous model). */
export async function ensureLocalModel(record: LocalModelRecord, contextSize: number): Promise<void> {
  if (loaded?.id === record.id) return;
  await unloadLocal();
  const ctx: RawContext = await initLlama({
    model: record.fileUri,
    n_ctx: Math.max(512, Math.min(16384, contextSize)),
    n_batch: 512,
    use_mlock: true,
  } as any);
  loaded = { id: record.id, ctx };
}

export function cancelLocal(): void {
  try {
    loaded?.ctx.stopCompletion?.();
  } catch {
    /* noop */
  }
}

async function buildPrompt(ctx: RawContext, messages: any[], family: any): Promise<string> {
  try {
    if (typeof ctx.getFormattedChat === 'function') {
      const out = await ctx.getFormattedChat(messages);
      if (typeof out === 'string' && out.length > 0) return out;
      if (out && typeof out?.prompt === 'string' && out.prompt.length > 0) return out.prompt;
    }
  } catch {
    /* fall through to manual template */
  }
  return fallbackChatTemplate(family)(messages);
}

/** Run a completion entirely on-device. */
export async function runLocal(
  record: LocalModelRecord,
  req: EngineRequest
): Promise<EngineResult> {
  if (loaded?.id !== record.id) {
    await ensureLocalModel(record, req.params.contextSize);
  }
  const ctx: RawContext = loaded!.ctx;
  const started = Date.now();
  const cat = catalogById(record.id);

  const prompt = await buildPrompt(ctx, req.messages, cat?.family ?? 'qwen');

  // Same reasoning-aware assembly as remote: splits <think>…</think> and
  // throttles UI updates so token streaming stays at 60/120fps.
  const assembler = new StreamAssembler({
    throttleMs: 80,
    onUpdate: (content, reasoning) => {
      req.handlers.onContent?.(content);
      if (reasoning) req.handlers.onReasoning?.(reasoning);
    },
  });

  const result = await ctx.completion({
    prompt,
    n_predict: req.params.maxTokens,
    temperature: req.params.temperature,
    top_p: req.params.topP,
    penalize_nl: false,
    stop: ['<|im_end|>', '<|eot_id|>', '<end_of_turn>', '<|end|>', '</s>'],
    onText: (token: { text?: string }) => {
      if (token?.text) assembler.feed(token.text);
    },
  });

  const final = assembler.flush();
  const raw: string = result?.text ?? '';
  // Prefer llama.cpp's own accumulated text when it diverges (e.g. stops).
  const content = raw && !final.content ? raw : final.content || raw;
  const tps: number | undefined = result?.timings?.predicted_per_second;

  const out: EngineResult = {
    content,
    reasoning: final.reasoning || undefined,
    tokensOut: result?.timings?.predicted_n ?? undefined,
    ms: Date.now() - started,
    tps: tps && Number.isFinite(tps) ? tps : undefined,
  };
  req.handlers.onContent?.(out.content);
  if (out.reasoning) req.handlers.onReasoning?.(out.reasoning);
  req.handlers.onDone?.(out);
  return out;
}
