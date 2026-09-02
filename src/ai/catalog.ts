/**
 * Provider + model catalog.
 *
 * Kept separate from the transport layer (`remote.ts`) so the list can be
 * refreshed without touching request plumbing. Every entry here is a *quick
 * pick* — the picker always merges in the live `/models` response from the
 * provider, which is the authoritative list for the user's key.
 *
 * Catalog refreshed against the official provider docs (September 2026).
 */

export type Pricing = 'free' | 'freemium' | 'paid' | 'local';

/** How the endpoint speaks. Only OpenAI-compatible transports are supported. */
export type ApiStyle = 'openai' | 'gemini-compat';

export interface ModelCard {
  id: string;
  label?: string;
  note?: string;
  badge?: 'new' | 'free' | 'fast' | 'reasoning' | 'local' | '1M';
}

export interface RemotePreset {
  id: string;
  name: string;
  baseUrl: string;
  keyUrl?: string;
  note?: string;
  noKey?: boolean;
  localNetwork?: boolean;
  pricing: Pricing;
  pricingNote?: string;
  apiStyle: ApiStyle;
  /** Models shown as quick picks in the model panel. */
  suggestedModels?: string[];
  cards?: ModelCard[];
  caps?: ('tools' | 'vision' | 'reasoning')[];
}

/* ---------------------------------- presets --------------------------------- */

export const PROVIDER_PRESETS: RemotePreset[] = [
  {
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Official OpenAI-compatible endpoint. Free tier with 1M-token context.',
    pricing: 'free',
    pricingNote: 'Generous free tier at AI Studio — best first pick.',
    apiStyle: 'gemini-compat',
    caps: ['tools', 'vision', 'reasoning'],
    cards: [
      { id: 'gemini-3.7-flash', note: 'Newest Flash · 1M context · thinking levels', badge: 'new' },
      { id: 'gemini-3.6-flash', note: 'Balanced Flash · 1M context', badge: 'free' },
      { id: 'gemini-3.5-flash', note: 'Agentic coding Flash · 1M context', badge: 'free' },
      { id: 'gemini-3.5-flash-lite', note: 'Cheapest · fastest · 1M context', badge: 'fast' },
      { id: 'gemini-3.1-pro-preview', note: 'Deepest reasoning · 1M context', badge: 'reasoning' },
      { id: 'gemini-3.1-flash-lite', note: 'High-volume workhorse', badge: 'fast' },
      { id: 'gemini-2.5-pro', note: 'Previous-gen Pro · thinking budget', badge: 'reasoning' },
      { id: 'gemini-2.5-flash', note: 'Previous-gen Flash · thinking budget', badge: 'free' },
      { id: 'gemini-2.5-flash-lite', note: 'Previous-gen lite · thinking off by default', badge: 'fast' },
      { id: 'gemini-flash-latest', note: 'Always points at the newest Flash', badge: 'new' },
      { id: 'gemini-flash-lite-latest', note: 'Always points at the newest Flash-Lite', badge: 'fast' },
      { id: 'gemini-pro-latest', note: 'Always points at the newest Pro', badge: 'reasoning' },
    ],
    suggestedModels: [
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-pro-preview',
      'gemini-2.5-flash',
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Claude via Anthropic’s OpenAI-compatible gateway.',
    pricing: 'paid',
    pricingNote: 'Pay per token. No free tier.',
    apiStyle: 'openai',
    caps: ['tools', 'vision', 'reasoning'],
    cards: [
      { id: 'claude-sonnet-5', note: 'Daily coding & agent work · 1M context', badge: 'new' },
      { id: 'claude-opus-5', note: 'Hardest long-horizon work · 1M context', badge: 'reasoning' },
      { id: 'claude-fable-5', note: 'Flagship · 1M context', badge: 'new' },
      { id: 'claude-haiku-4-5-20251001', note: 'Fastest & cheapest Claude', badge: 'fast' },
    ],
    suggestedModels: ['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5', 'claude-haiku-4-5-20251001'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    pricing: 'paid',
    pricingNote: 'Pay per token.',
    apiStyle: 'openai',
    caps: ['tools', 'vision', 'reasoning'],
    cards: [
      { id: 'gpt-5.6-terra', note: 'Practical default · ~1M context', badge: 'new' },
      { id: 'gpt-5.6-sol', note: 'Maximum-capability agent tier', badge: 'reasoning' },
      { id: 'gpt-5.6-luna', note: 'Volume tier · cheapest 5.6', badge: 'fast' },
      { id: 'gpt-5-mini', note: 'Previous gen mini', badge: 'fast' },
    ],
    suggestedModels: ['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5-mini'],
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Wafer-scale inference. Free tier, very fast.',
    pricing: 'free',
    pricingNote: 'Free tier with generous rate limits, very fast.',
    apiStyle: 'openai',
    caps: ['tools', 'reasoning'],
    cards: [
      { id: 'openai/gpt-oss-120b', note: 'Open-weight 120B · free', badge: 'free' },
      { id: 'moonshotai/kimi-k2-instruct', note: 'Long agent trajectories · free', badge: 'free' },
      { id: 'qwen/qwen3.6-27b', note: 'Qwen 3.6 · free', badge: 'free' },
      { id: 'groq/compound', note: 'Groq’s own compound agent model', badge: 'new' },
      { id: 'minimaxai/minimax-m2.7', note: 'Open-weight MiniMax', badge: 'free' },
      { id: 'llama-3.3-70b-versatile', note: 'Classic 70B workhorse', badge: 'fast' },
    ],
    suggestedModels: [
      'openai/gpt-oss-120b',
      'moonshotai/kimi-k2-instruct',
      'qwen/qwen3.6-27b',
      'groq/compound',
      'llama-3.3-70b-versatile',
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Hundreds of models behind one key, incl. `:free` variants.',
    pricing: 'freemium',
    pricingNote: 'Free models available; premium models pay-per-token.',
    apiStyle: 'openai',
    caps: ['tools', 'vision', 'reasoning'],
    cards: [
      { id: 'anthropic/claude-sonnet-5', badge: 'new' },
      { id: 'openai/gpt-5.6-luna', badge: 'fast' },
      { id: 'google/gemini-3.7-flash', badge: 'new' },
      { id: 'x-ai/grok-4-6', badge: 'reasoning' },
      { id: 'deepseek/deepseek-v4-flash', badge: 'free' },
      { id: 'z-ai/glm-5.2', note: 'Open-weight, 1M context', badge: 'free' },
    ],
    suggestedModels: [
      'anthropic/claude-sonnet-5',
      'openai/gpt-5.6-luna',
      'google/gemini-3.7-flash',
      'x-ai/grok-4-6',
      'deepseek/deepseek-v4-flash',
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    pricing: 'paid',
    pricingNote: 'Pay per token; trial credits vary.',
    apiStyle: 'openai',
    caps: ['tools', 'vision', 'reasoning'],
    cards: [
      { id: 'grok-4-6', note: 'Frontier Grok · 500K context', badge: 'new' },
      { id: 'grok-4-5', note: 'Previous flagship', badge: 'reasoning' },
      { id: 'grok-code-fast-1', note: 'Coding specialist, very fast', badge: 'fast' },
    ],
    suggestedModels: ['grok-4-6', 'grok-4-5', 'grok-code-fast-1'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: 'Cheapest frontier-class reasoning.',
    pricing: 'paid',
    pricingNote: 'Very cheap per token.',
    apiStyle: 'openai',
    caps: ['tools', 'reasoning'],
    cards: [
      { id: 'deepseek-chat', note: 'V4 chat · non-thinking', badge: 'fast' },
      { id: 'deepseek-reasoner', note: 'V4 reasoning chain', badge: 'reasoning' },
    ],
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    pricing: 'freemium',
    pricingNote: 'Free tier on La Plateforme with rate limits.',
    apiStyle: 'openai',
    caps: ['tools', 'vision'],
    cards: [
      { id: 'mistral-medium-latest', note: 'Medium 3.5 tier', badge: 'new' },
      { id: 'mistral-small-latest', note: 'Small 4 · Apache-2.0 family', badge: 'fast' },
      { id: 'mistral-large-latest', note: 'Largest hosted Mistral', badge: 'reasoning' },
    ],
    suggestedModels: ['mistral-medium-latest', 'mistral-small-latest', 'mistral-large-latest'],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyUrl: 'https://cloud.cerebras.ai',
    note: 'Wafer-scale speed. Free tier with high rate limits.',
    pricing: 'free',
    pricingNote: 'Free API tier, extremely fast inference.',
    apiStyle: 'openai',
    caps: ['tools'],
    cards: [
      { id: 'gpt-oss-120b', badge: 'free' },
      { id: 'qwen-3-235b-a22b-thinking-2507', badge: 'reasoning' },
      { id: 'llama-3.3-70b', badge: 'fast' },
    ],
    suggestedModels: ['gpt-oss-120b', 'llama-3.3-70b', 'qwen-3-235b-a22b-thinking-2507'],
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    pricing: 'paid',
    pricingNote: 'Trial credits for new accounts, then pay-per-token.',
    apiStyle: 'openai',
    caps: ['tools', 'vision'],
    suggestedModels: [
      'moonshotai/Kimi-K2-Instruct-0905',
      'meta-llama/Llama-4-Maverick-17B-128E-Instruct-Turbo',
      'Qwen/Qwen3-235B-A22B-Instruct-2507',
    ],
  },
  {
    id: 'zai',
    name: 'Z.ai (GLM)',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    keyUrl: 'https://z.ai',
    note: 'Open-weight GLM family, 1M context.',
    pricing: 'freemium',
    pricingNote: 'Cheap; open weights you can also self-host.',
    apiStyle: 'openai',
    caps: ['tools', 'vision', 'reasoning'],
    suggestedModels: ['glm-5.2', 'glm-4.6', 'glm-4.5-air'],
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.ai/v1',
    keyUrl: 'https://platform.moonshot.ai',
    pricing: 'freemium',
    pricingNote: 'Open-weight Kimi K3; hosted API is cheap.',
    apiStyle: 'openai',
    caps: ['tools', 'vision'],
    suggestedModels: ['kimi-k3-0731-preview', 'kimi-k2-0905-preview', 'moonshot-v1-auto'],
  },
  {
    id: 'ollama',
    name: 'Ollama (your computer)',
    baseUrl: 'http://localhost:11434/v1',
    noKey: true,
    localNetwork: true,
    note: 'Set OLLAMA_HOST=0.0.0.0 and use your PC’s LAN IP from the phone.',
    pricing: 'local',
    pricingNote: 'Free — runs on your own computer.',
    apiStyle: 'openai',
    caps: ['tools', 'vision'],
    suggestedModels: ['qwen3', 'gpt-oss:120b', 'llama3.2', 'gemma3', 'mistral'],
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (your computer)',
    baseUrl: 'http://192.168.1.10:1234/v1',
    noKey: true,
    localNetwork: true,
    note: 'Start the local server in LM Studio, then point this at your PC’s LAN IP.',
    pricing: 'local',
    pricingNote: 'Free — runs on your own computer.',
    apiStyle: 'openai',
    caps: ['tools'],
    suggestedModels: [],
  },
  {
    id: 'custom',
    name: 'Custom / self-hosted',
    baseUrl: '',
    note: 'Any OpenAI-compatible endpoint: vLLM, LiteLLM, TGI, Gin…',
    pricing: 'paid',
    apiStyle: 'openai',
    caps: ['tools'],
  },
];

export const presetForBaseUrl = (baseUrl: string): RemotePreset | undefined => {
  const b = normalizeBase(baseUrl);
  return PROVIDER_PRESETS.find((p) => p.baseUrl && normalizeBase(p.baseUrl) === b);
};

/* -------------------------------- url plumbing ------------------------------- */

export function normalizeBase(baseUrl: string): string {
  let b = (baseUrl ?? '').trim().replace(/\/+$/, '');
  // Heal the two Gemini base-URL mistakes that produced "404 model not found":
  // a truncated `/v1beta/open`, and a bare `/v1beta` with no `/openai` suffix.
  if (/generativelanguage\.googleapis\.com$/i.test(b.replace(/\/v1(beta)?$/i, ''))) {
    b = b.replace(/\/v1beta\/open$/i, '/v1beta/openai');
    if (/generativelanguage\.googleapis\.com\/v1(beta)?$/i.test(b)) b += '/openai';
  }
  return b;
}

const LOOKS_VERSIONED = /\/v\d+(\.\d+)?(beta|alpha)?$/i;

/** Splits a base URL into `{ root, hasVersion }`. */
function splitBase(baseUrl: string): { root: string; versioned: boolean; suffix: string } {
  const b = normalizeBase(baseUrl);
  if (b.endsWith('/chat/completions')) {
    const root = b.replace(/\/chat\/completions$/, '');
    return { root, versioned: LOOKS_VERSIONED.test(root), suffix: '' };
  }
  if (b.endsWith('/models')) {
    const root = b.replace(/\/models$/, '');
    return { root, versioned: LOOKS_VERSIONED.test(root), suffix: '' };
  }
  return { root: b, versioned: LOOKS_VERSIONED.test(b), suffix: '' };
}

/**
 * Absolute URL for chat completions. Handles `/v1`, `/v1beta/openai`,
 * `/api/paas/v4`, bare hosts and pre-joined `/chat/completions`.
 */
export function chatCompletionsUrl(baseUrl: string): string {
  const { root, versioned } = splitBase(baseUrl);
  if (root.endsWith('/chat/completions')) return root;
  if (versioned) return `${root}/chat/completions`;
  if (/\/openai$/i.test(root)) return `${root}/chat/completions`;
  if (root.endsWith('/api/paas/v4')) return `${root}/chat/completions`;
  return `${root}/v1/chat/completions`;
}

/** Candidate model-listing URLs, most likely first. The transport tries each. */
export function modelListUrls(baseUrl: string): string[] {
  const { root, versioned } = splitBase(baseUrl);
  const out: string[] = [];
  const push = (u: string) => {
    if (u && !out.includes(u)) out.push(u);
  };
  if (root.endsWith('/models')) push(root);
  if (versioned || /\/openai$/i.test(root) || root.endsWith('/api/paas/v4')) {
    push(`${root}/models`);
  } else {
    push(`${root}/v1/models`);
    push(`${root}/models`);
  }
  // Gemini also answers on the native REST surface.
  if (/generativelanguage\.googleapis\.com/i.test(root)) {
    push(root.replace(/\/openai$/i, '') + '/models');
  }
  return out;
}

/** Single canonical models URL (used for display / caching keys). */
export function modelsUrl(baseUrl: string): string {
  return modelListUrls(baseUrl)[0];
}

/* ------------------------------ model metadata ------------------------------ */

export type ThinkingKind =
  | 'gemini-level'   // Gemini 3.x → thinking_level
  | 'gemini-budget'  // Gemini 2.5 → thinking_budget
  | 'openai-effort'  // reasoning_effort
  | 'none';

export interface ModelMeta {
  contextWindow: number;
  maxOutput: number;
  thinking: ThinkingKind;
  /** Display family for grouping in the picker. */
  family: string;
  supportsVision: boolean;
}

interface Rule {
  match: RegExp;
  contextWindow: number;
  maxOutput: number;
  thinking: ThinkingKind;
  family: string;
  supportsVision?: boolean;
}

/** First match wins — order from most specific to most general. */
const RULES: Rule[] = [
  { match: /^gemini-3(\.|\d|-)/i, contextWindow: 1_048_576, maxOutput: 65_536, thinking: 'gemini-level', family: 'Gemini 3', supportsVision: true },
  { match: /^gemini-(pro|flash)-latest$/i, contextWindow: 1_048_576, maxOutput: 65_536, thinking: 'gemini-level', family: 'Gemini latest', supportsVision: true },
  { match: /^gemini-2\.5/i, contextWindow: 1_048_576, maxOutput: 65_536, thinking: 'gemini-budget', family: 'Gemini 2.5', supportsVision: true },
  { match: /^gemini/i, contextWindow: 1_048_576, maxOutput: 8_192, thinking: 'gemini-budget', family: 'Gemini', supportsVision: true },
  { match: /^(google\/)?gemma/i, contextWindow: 131_072, maxOutput: 8_192, thinking: 'none', family: 'Gemma', supportsVision: true },

  { match: /^claude-(fable|opus|sonnet)-5/i, contextWindow: 1_000_000, maxOutput: 64_000, thinking: 'none', family: 'Claude 5', supportsVision: true },
  { match: /^claude-(haiku|sonnet|opus)-4/i, contextWindow: 200_000, maxOutput: 64_000, thinking: 'none', family: 'Claude 4', supportsVision: true },
  { match: /^(anthropic\/)?claude/i, contextWindow: 200_000, maxOutput: 8_192, thinking: 'none', family: 'Claude', supportsVision: true },

  { match: /^gpt-5\.6/i, contextWindow: 1_048_576, maxOutput: 128_000, thinking: 'openai-effort', family: 'GPT-5.6', supportsVision: true },
  { match: /^gpt-5/i, contextWindow: 400_000, maxOutput: 128_000, thinking: 'openai-effort', family: 'GPT-5', supportsVision: true },
  { match: /^(openai\/)?gpt-oss/i, contextWindow: 131_072, maxOutput: 16_384, thinking: 'openai-effort', family: 'gpt-oss' },
  { match: /^gpt-4/i, contextWindow: 128_000, maxOutput: 16_384, thinking: 'none', family: 'GPT-4', supportsVision: true },
  { match: /^o\d/i, contextWindow: 200_000, maxOutput: 100_000, thinking: 'openai-effort', family: 'o-series' },

  { match: /^grok-4-6/i, contextWindow: 500_000, maxOutput: 64_000, thinking: 'none', family: 'Grok 4.6', supportsVision: true },
  { match: /^grok-code/i, contextWindow: 2_000_000, maxOutput: 32_000, thinking: 'none', family: 'Grok Code' },
  { match: /^grok/i, contextWindow: 256_000, maxOutput: 16_384, thinking: 'none', family: 'Grok', supportsVision: true },

  { match: /^deepseek-reasoner/i, contextWindow: 163_840, maxOutput: 64_000, thinking: 'none', family: 'DeepSeek R' },
  { match: /^deepseek/i, contextWindow: 163_840, maxOutput: 64_000, thinking: 'none', family: 'DeepSeek' },

  { match: /^(z-ai\/)?glm-5/i, contextWindow: 1_000_000, maxOutput: 96_000, thinking: 'none', family: 'GLM 5' },
  { match: /^(z-ai\/)?glm/i, contextWindow: 200_000, maxOutput: 64_000, thinking: 'none', family: 'GLM' },
  { match: /^kimi-k3/i, contextWindow: 262_144, maxOutput: 32_000, thinking: 'none', family: 'Kimi K3', supportsVision: true },
  { match: /^kimi/i, contextWindow: 262_144, maxOutput: 16_384, thinking: 'none', family: 'Kimi' },
  { match: /^minimax/i, contextWindow: 1_000_000, maxOutput: 32_000, thinking: 'none', family: 'MiniMax' },
  { match: /^qwen3(\.|\d)/i, contextWindow: 262_144, maxOutput: 32_768, thinking: 'none', family: 'Qwen 3', supportsVision: true },
  { match: /^qwen/i, contextWindow: 131_072, maxOutput: 8_192, thinking: 'none', family: 'Qwen', supportsVision: true },
  { match: /^mistral-medium/i, contextWindow: 256_000, maxOutput: 32_000, thinking: 'none', family: 'Mistral Medium', supportsVision: true },
  { match: /^mistral/i, contextWindow: 131_072, maxOutput: 16_384, thinking: 'none', family: 'Mistral', supportsVision: true },
  { match: /^llama-4/i, contextWindow: 131_072, maxOutput: 8_192, thinking: 'none', family: 'Llama 4', supportsVision: true },
  { match: /^llama/i, contextWindow: 131_072, maxOutput: 8_192, thinking: 'none', family: 'Llama', supportsVision: true },
];

const FALLBACK: ModelMeta = {
  contextWindow: 131_072,
  maxOutput: 8_192,
  thinking: 'none',
  family: 'Model',
  supportsVision: false,
};

const metaCache = new Map<string, ModelMeta>();

/** Strip an OpenRouter-style `org/` prefix for matching. */
function bareId(model: string): string {
  const m = (model ?? '').trim();
  const parts = m.split('/');
  const last = parts[parts.length - 1] ?? m;
  // keep the org for `google/gemini-3.7-flash` style matching, but try both
  return last || m;
}

export function modelMeta(model: string): ModelMeta {
  const key = (model ?? '').trim().toLowerCase();
  if (!key) return FALLBACK;
  const hit = metaCache.get(key);
  if (hit) return hit;

  const candidates = [key, bareId(key)];
  let meta: ModelMeta = FALLBACK;
  outer: for (const rule of RULES) {
    for (const c of candidates) {
      if (rule.match.test(c)) {
        meta = {
          contextWindow: rule.contextWindow,
          maxOutput: rule.maxOutput,
          thinking: rule.thinking,
          family: rule.family,
          supportsVision: !!rule.supportsVision,
        };
        break outer;
      }
    }
  }
  metaCache.set(key, meta);
  return meta;
}

export function contextWindowFor(model: string): number {
  return modelMeta(model).contextWindow;
}

/** Human label, e.g. "1M" / "256K". */
export function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/* ------------------------------- thinking levels ---------------------------- */

export type ThinkingLevel = 'auto' | 'minimal' | 'low' | 'medium' | 'high';

export const THINKING_LEVELS: { value: ThinkingLevel; label: string; note: string }[] = [
  { value: 'auto', label: 'Auto', note: 'Model decides — best default' },
  { value: 'minimal', label: 'Minimal', note: 'Barely thinks · fastest & cheapest' },
  { value: 'low', label: 'Low', note: 'Quick pass · snappy replies' },
  { value: 'medium', label: 'Medium', note: 'Balanced reasoning' },
  { value: 'high', label: 'Extended', note: 'Deep thinking · slowest, smartest' },
];

export const thinkingLabel = (l: ThinkingLevel): string =>
  THINKING_LEVELS.find((x) => x.value === l)?.label ?? 'Auto';

/** Gemini 2.5 token budgets, per Google's published mapping. */
const GEMINI_25_BUDGET: Record<Exclude<ThinkingLevel, 'auto'>, number> = {
  minimal: 128,
  low: 1024,
  medium: 8192,
  high: 24576,
};

/**
 * Builds the provider-specific fields for a thinking level. Returns a partial
 * request body to spread into the chat-completions payload.
 *
 * Gemini note from the official docs: `reasoning_effort` and
 * `thinking_level`/`thinking_budget` overlap and **cannot both be sent**, so we
 * send exactly one of them depending on the model generation.
 */
export function thinkingFields(
  model: string,
  level: ThinkingLevel,
  opts: { includeThoughts?: boolean } = {}
): Record<string, unknown> {
  const meta = modelMeta(model);
  if (level === 'auto') {
    if (meta.thinking === 'gemini-level' && opts.includeThoughts) {
      return { extra_body: { google: { thinking_config: { include_thoughts: true } } } };
    }
    return {};
  }

  switch (meta.thinking) {
    case 'gemini-level':
      // Gemini 3.x cannot fully disable reasoning; `minimal` is the floor.
      return {
        extra_body: {
          google: {
            thinking_config: {
              thinking_level: level === 'minimal' ? 'minimal' : level,
              ...(opts.includeThoughts ? { include_thoughts: true } : {}),
            },
          },
        },
      };
    case 'gemini-budget':
      return {
        extra_body: {
          google: {
            thinking_config: {
              thinking_budget: level === 'minimal' ? 0 : GEMINI_25_BUDGET[level],
              ...(opts.includeThoughts ? { include_thoughts: true } : {}),
            },
          },
        },
      };
    case 'openai-effort':
      return { reasoning_effort: level };
    default:
      return {};
  }
}

/** Which levels a model actually understands (for greying out choices). */
export function supportedThinkingLevels(model: string): ThinkingLevel[] {
  const kind = modelMeta(model).thinking;
  if (kind === 'none') return ['auto'];
  if (kind === 'gemini-budget') return ['auto', 'minimal', 'low', 'medium', 'high'];
  if (kind === 'gemini-level') return ['auto', 'low', 'medium', 'high'];
  return ['auto', 'minimal', 'low', 'medium', 'high'];
}

export function supportsThinking(model: string): boolean {
  return modelMeta(model).thinking !== 'none';
}

/* --------------------------------- friendly names --------------------------- */

export function prettyModelName(id: string): string {
  const bare = bareId(id);
  const card = PROVIDER_PRESETS.flatMap((p) => p.cards ?? []).find((c) => c.id === bare || c.id === id);
  if (card?.label) return card.label;
  return bare
    .replace(/^(models\/)/, '')
    .replace(/[-_](preview|latest|instruct|versatile|turbo|instant|thinking|\d{6,})([-_].*)?$/gi, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Strip Gemini's `models/` prefix returned by the native REST listing. */
export function cleanModelId(id: string): string {
  return String(id ?? '').replace(/^models\//, '').trim();
}

/**
 * Sort key that keeps the newest / most capable families on top instead of
 * alphabetical order (which buries `gemini-3.7-flash` under `embedding-001`).
 */
export function modelSortWeight(id: string): number {
  const m = cleanModelId(id).toLowerCase();
  if (/gemini-3\.7/.test(m)) return 0;
  if (/gemini-3\.6/.test(m)) return 1;
  if (/gemini-3\.5/.test(m)) return 2;
  if (/gemini-3\.1/.test(m)) return 3;
  if (/gemini-3/.test(m)) return 4;
  if (/gemini-2\.5/.test(m)) return 5;
  if (/claude-(fable|opus|sonnet)-5/.test(m)) return 6;
  if (/gpt-5\.6/.test(m)) return 7;
  if (/grok-4-6/.test(m)) return 8;
  if (/gemini/.test(m)) return 20;
  if (/claude/.test(m)) return 21;
  if (/gpt/.test(m)) return 22;
  if (/embedding|tts|transcribe|veo|imagen|guard|whisper|live/.test(m)) return 900;
  return 100;
}

export function sortModelIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const w = modelSortWeight(a) - modelSortWeight(b);
    if (w !== 0) return w;
    return cleanModelId(a).localeCompare(cleanModelId(b), undefined, { numeric: true });
  });
}

/** Models that are not chat models at all — hidden from the picker. */
export function isChatModel(id: string): boolean {
  const m = cleanModelId(id).toLowerCase();
  return !/(embedding|tts|transcribe|veo-|imagen|guard|whisper|rerank|-live|bidi|robotics|lyria|computer-use)/.test(m);
}

/**
 * Fallback chain for automatic model failover: the provider's own recommended
 * models, nearest first, excluding the one that just failed. Used when a
 * request 404s (model retired/typo), 429s (rate limit) or 503s (overloaded) so
 * a long agent run survives provider hiccups instead of dying.
 */
export function fallbackChainFor(baseUrl: string, current: string): string[] {
  const preset = presetForBaseUrl(baseUrl);
  const pool = [...(preset?.suggestedModels ?? []), ...(preset?.cards?.map((m: { id: string }) => m.id) ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of pool) {
    if (m === current || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
    if (out.length >= 3) break;
  }
  return out;
}
