/**
 * Secret redaction for anything the user (or a log) can see.
 *
 * Error strings from providers sometimes echo the request — including the
 * Authorization header or a `?key=` query parameter. Exported chat JSON can
 * contain a pasted key. Redact before either leaves the app.
 */

const PATTERNS: Array<[RegExp, string]> = [
  // OpenAI / Anthropic / OpenRouter style prefixes
  [/\b(sk|rk|pk|or)-[A-Za-z0-9_-]{8,}/g, '$1-[redacted]'],
  // GitHub personal access tokens
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, 'gh*_[redacted]'],
  // Google API keys
  [/\bAIza[0-9A-Za-z_-]{16,}/g, 'AIza[redacted]'],
  // Slack / Stripe-ish tokens
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, 'xox-[redacted]'],
  [/\bsk_live_[A-Za-z0-9]{10,}/g, 'sk_live_[redacted]'],
  // Authorization headers
  [/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, 'Bearer [redacted]'],
  // ?api_key=… / &token=… query parameters
  [/([?&](?:api[_-]?key|key|token|access_token)=)[^&\s"']+/gi, '$1[redacted]'],
];

export function redactSecrets(input: string): string {
  if (!input) return input;
  let out = input;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** Deep-redact strings inside an object destined for export or logs. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactSecrets(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(apiKey|token|authorization|password|secret)$/i.test(k)) {
        out[k] = v ? '[redacted]' : v;
      } else {
        out[k] = redactDeep(v);
      }
    }
    return out as unknown as T;
  }
  return value;
}
