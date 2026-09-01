/**
 * Platform-agnostic streaming fetch.
 * Metro resolves './fetch' to fetch.native.ts (expo/fetch with ReadableStream
 * support) or fetch.web.ts (browser fetch); this declares the shared contract.
 */
export declare const streamFetch: typeof globalThis.fetch;
