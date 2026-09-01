/**
 * Streaming-capable fetch for native platforms.
 * expo/fetch exposes a WHATWG-style API with ReadableStream support over
 * the native networking stack — required for SSE token streaming.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetch: expoFetch } = require('expo/fetch') as { fetch: typeof globalThis.fetch };

export const streamFetch: typeof globalThis.fetch = expoFetch as typeof globalThis.fetch;
