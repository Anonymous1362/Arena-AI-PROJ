/** Web build uses the browser's native fetch (full ReadableStream support). */
export const streamFetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args);
