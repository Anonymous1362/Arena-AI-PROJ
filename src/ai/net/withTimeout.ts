/**
 * Fetch with a deadline.
 *
 * Node-style fetch has no default timeout: a provider that accepts the socket
 * and then never answers leaves the UI "thinking" forever with no way to tell
 * a slow model from a dead connection. We abort if the request has not produced
 * response headers within `timeoutMs`, and surface a distinct error so the
 * session layer can say "timed out" instead of "network error".
 */
import { streamFetch } from '@/src/ai/net/fetch';

export class RequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

/** Time allowed before response headers arrive (models can be slow to start). */
export const CHAT_TIMEOUT_MS = 120_000;
/** Model listing / connectivity tests should fail fast. */
export const MODEL_TIMEOUT_MS = 20_000;

function joinSignals(signals: AbortSignal[]): AbortSignal {
  const withAny = AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal };
  if (typeof withAny.any === 'function') return withAny.any(signals);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

export async function streamFetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit & { signal?: AbortSignal } = {},
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const signal = init.signal ? joinSignals([init.signal, controller.signal]) : controller.signal;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await streamFetch(input as never, { ...init, signal } as never);
  } catch (err) {
    if (timedOut && !init.signal?.aborted) {
      throw new RequestTimeoutError(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s. The provider did not respond.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
