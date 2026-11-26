/**
 * Transport checks for provider base URLs.
 *
 * Plain HTTP is legitimate for a model running on the same machine or LAN
 * (Ollama, LM Studio, llama.cpp). It is never legitimate for a public host:
 * the API key travels in a header that anyone on the path can read.
 */

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|10\.0\.2\.2|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.local)$/i;

export function hostOf(url: string): string {
  try {
    const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return (url ?? '').replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
  }
}

/** True for `http://` URLs that are not loopback/LAN. */
export function isInsecureRemote(url: string | undefined | null): boolean {
  if (!url) return false;
  if (!/^http:\/\//i.test(url.trim())) return false;
  return !PRIVATE_HOST.test(hostOf(url));
}

/** True when the URL is a loopback or private-network address. */
export function isLocalHost(url: string | undefined | null): boolean {
  if (!url) return false;
  return PRIVATE_HOST.test(hostOf(url));
}
