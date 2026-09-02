import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ---------------------------------- types --------------------------------- */

export interface RemoteProfile {
  id: string;
  name: string;
  /** Base URL, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  suggestedModels?: string[];
}

/** The only engine kind: an OpenAI-compatible API (cloud or LAN). */
export type ActiveModel = {
  kind: 'remote';
  profileId: string;
  model: string;
} | null;

/**
 * Reasoning / "thinking" level. Providers name this differently:
 *  - Gemini 3.x  → `thinking_level` (minimal | low | medium | high)
 *  - Gemini 2.5  → `thinking_budget` tokens
 *  - OpenAI      → `reasoning_effort`
 *  - Anthropic   → extended-thinking `budget_tokens`
 * `src/ai/catalog.ts` maps one setting onto all of them.
 */
export type ThinkingLevel = 'auto' | 'minimal' | 'low' | 'medium' | 'high';

export interface GenerationSettings {
  temperature: number;
  topP: number;
  maxTokens: number;
  /** Instructions appended after the agent master prompt. */
  systemPrompt: string;
  /** How hard the model should think before answering. */
  thinking: ThinkingLevel;
  /** Stream the model's thought summaries into the thinking panel. */
  showThinking: boolean;
}

export interface AgentScope {
  /** Master switch: tools + terminal available to the model. */
  enabled: boolean;
  /** User granted a storage root (Android SAF tree / app sandbox). */
  storageEnabled: boolean;
  safTreeUri?: string;
  safRootLabel?: string;
  /**
   * "All files access" root: an absolute Android path (internal or SD card),
   * e.g. `/storage/0123-4567/Download/COPPER Projects`. Empty = not used.
   * Wins over the SAF grant when present and the permission is granted.
   */
  managedBase?: string;
  /** Ask before destructive tool calls (delete, rm -rf). */
  confirmDangerous: boolean;
  /** Read assistant replies aloud automatically. */
  autoReadAloud: boolean;
  /** Give the agent the GitHub tools (needs a token in `github`). */
  githubTools: boolean;
  /** Agent keeps each task inside a named project folder under the root. */
  projectFolders: boolean;
  /** One project folder per chat (off = the agent organises freely). */
  oneProjectPerChat: boolean;
}

/* ------------------------------- appearance -------------------------------- */

/** `reduced` = no travel/instant; `balanced` = default; `full` = extra flourish. */
export type MotionLevel = 'reduced' | 'balanced' | 'full';

/**
 * Haptic vocabulary intensity.
 *  - off      → never vibrate
 *  - subtle   → only meaningful events (send, success, destructive, tab change)
 *  - standard → subtle + presses on primary controls (default)
 *  - rich     → standard + selection ticks while scrolling/picking
 */
export type HapticLevel = 'off' | 'subtle' | 'standard' | 'rich';

export type AccentId = 'copper' | 'ember' | 'cobalt' | 'forest' | 'violet' | 'graphite';

export interface AppearanceSettings {
  theme: 'system' | 'light' | 'dark';
  messageTextSize: 's' | 'm' | 'l';
  /** @deprecated use `haptics` — kept for migration only. */
  hapticsEnabled: boolean;
  haptics: HapticLevel;
  motion: MotionLevel;
  accent: AccentId;
  /** Animated brand splash on cold start. */
  splashAnimation: boolean;
  /** Extra translucency/blur effects (auto-disabled on Android low-end). */
  richSurfaces: boolean;
}

/* -------------------------------- behavior --------------------------------- */

export interface BehaviorSettings {
  autoTitle: boolean;
  sendOnEnter: boolean;
  /** Auto-continue when a provider truncates mid-task. */
  autoContinue: boolean;
  /** Chat tab opens straight into a conversation instead of a list. */
  chatTabIsChat: boolean;
  /** Hide the keyboard whenever you leave the composer (tabs, sheets, nav). */
  dismissKeyboardOnNavigate: boolean;
  /** Auto-focus the composer when a chat opens. */
  autoFocusComposer: boolean;
}

/* --------------------------------- context --------------------------------- */

export interface ContextSettings {
  /** Live token / context-window meter in the chat header. */
  showMeter: boolean;
  /** Summarise + reseed the session before the window fills. */
  autoCompact: boolean;
  /** Percentage of the window that triggers a compaction (default 85). */
  compactAtPct: number;
  /** 0 = detect from the model catalog. Otherwise a hard token ceiling. */
  windowOverride: number;
}

/* --------------------------------- github ---------------------------------- */

export interface GithubSettings {
  /** Classic or fine-grained PAT. Stored on-device only. */
  token: string;
  owner: string;
  repo: string;
  branch: string;
  /** Verified login (filled after a successful /user call). */
  login: string;
  connectedAt: number;
}

/* -------------------------------- terminal --------------------------------- */

export interface TerminalSettings {
  fontSize: number;
  /** Lines kept in the on-device scrollback. */
  scrollback: number;
  /** Wrap long lines instead of horizontal scrolling. */
  wrap: boolean;
  /** Ask before running a command that matches a destructive pattern. */
  confirmDestructive: boolean;
}

export interface SettingsState {
  profiles: RemoteProfile[];
  activeProfileId: string | null;
  activeModel: ActiveModel;
  modelCache: Record<string, { models: string[]; fetchedAt: number }>;
  generation: GenerationSettings;
  agentScope: AgentScope;
  appearance: AppearanceSettings;
  behavior: BehaviorSettings;
  context: ContextSettings;
  github: GithubSettings;
  terminal: TerminalSettings;
  onboarded: boolean;
  /** Id of the conversation the Chat tab shows inline. */
  tabChatId: string | null;

  addProfile: (p: Omit<RemoteProfile, 'id'>) => string;
  updateProfile: (id: string, patch: Partial<Omit<RemoteProfile, 'id'>>) => void;
  removeProfile: (id: string) => void;
  setActiveProfile: (id: string | null) => void;
  setActiveModel: (m: ActiveModel) => void;
  cacheModels: (profileId: string, models: string[]) => void;
  patchGeneration: (patch: Partial<GenerationSettings>) => void;
  patchAgentScope: (patch: Partial<AgentScope>) => void;
  patchAppearance: (patch: Partial<AppearanceSettings>) => void;
  patchBehavior: (patch: Partial<BehaviorSettings>) => void;
  patchContext: (patch: Partial<ContextSettings>) => void;
  patchGithub: (patch: Partial<GithubSettings>) => void;
  patchTerminal: (patch: Partial<TerminalSettings>) => void;
  setTabChatId: (id: string | null) => void;
  setOnboarded: (v: boolean) => void;
  resetAll: () => void;
}

/* --------------------------------- defaults -------------------------------- */

const defaultGeneration: GenerationSettings = {
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 8192,
  systemPrompt: '',
  thinking: 'auto',
  showThinking: true,
};

const defaultAgentScope: AgentScope = {
  enabled: true,
  storageEnabled: false,
  confirmDangerous: true,
  autoReadAloud: false,
  githubTools: false,
  projectFolders: true,
  oneProjectPerChat: true,
};

const defaultAppearance: AppearanceSettings = {
  theme: 'system',
  messageTextSize: 'm',
  hapticsEnabled: true,
  haptics: 'standard',
  motion: 'balanced',
  accent: 'copper',
  splashAnimation: true,
  richSurfaces: true,
};

const defaultBehavior: BehaviorSettings = {
  autoTitle: true,
  sendOnEnter: false,
  autoContinue: true,
  chatTabIsChat: true,
  dismissKeyboardOnNavigate: true,
  autoFocusComposer: false,
};

const defaultContext: ContextSettings = {
  showMeter: true,
  autoCompact: true,
  compactAtPct: 85,
  windowOverride: 0,
};

const defaultGithub: GithubSettings = {
  token: '',
  owner: '',
  repo: '',
  branch: 'main',
  login: '',
  connectedAt: 0,
};

const defaultTerminal: TerminalSettings = {
  fontSize: 12.5,
  scrollback: 600,
  wrap: true,
  confirmDestructive: true,
};

/* ---------------------------------- store ---------------------------------- */

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      profiles: [],
      activeProfileId: null,
      activeModel: null,
      modelCache: {},
      generation: defaultGeneration,
      agentScope: defaultAgentScope,
      appearance: defaultAppearance,
      behavior: defaultBehavior,
      context: defaultContext,
      github: defaultGithub,
      terminal: defaultTerminal,
      onboarded: false,
      tabChatId: null,

      addProfile: (p) => {
        const id = `prof_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        set((s) => ({
          profiles: [...s.profiles, { ...p, id }],
          activeProfileId: s.activeProfileId ?? id,
        }));
        return id;
      },

      updateProfile: (id, patch) =>
        set((s) => ({
          profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removeProfile: (id) =>
        set((s) => {
          const profiles = s.profiles.filter((p) => p.id !== id);
          const activeModel =
            s.activeModel && s.activeModel.profileId === id ? null : s.activeModel;
          const activeProfileId =
            s.activeProfileId === id ? (profiles[0]?.id ?? null) : s.activeProfileId;
          return { profiles, activeModel, activeProfileId };
        }),

      setActiveProfile: (id) => set({ activeProfileId: id }),

      setActiveModel: (m) => set({ activeModel: m }),

      cacheModels: (profileId, models) =>
        set((s) => ({
          modelCache: { ...s.modelCache, [profileId]: { models, fetchedAt: Date.now() } },
        })),

      patchGeneration: (patch) => set((s) => ({ generation: { ...s.generation, ...patch } })),
      patchAgentScope: (patch) => set((s) => ({ agentScope: { ...s.agentScope, ...patch } })),
      patchAppearance: (patch) => set((s) => ({ appearance: { ...s.appearance, ...patch } })),
      patchBehavior: (patch) => set((s) => ({ behavior: { ...s.behavior, ...patch } })),
      patchContext: (patch) => set((s) => ({ context: { ...s.context, ...patch } })),
      patchGithub: (patch) => set((s) => ({ github: { ...s.github, ...patch } })),
      patchTerminal: (patch) => set((s) => ({ terminal: { ...s.terminal, ...patch } })),
      setTabChatId: (id) => set({ tabChatId: id }),

      setOnboarded: (v) => set({ onboarded: v }),

      resetAll: () =>
        set({
          profiles: [],
          activeProfileId: null,
          activeModel: null,
          modelCache: {},
          generation: defaultGeneration,
          agentScope: defaultAgentScope,
          appearance: defaultAppearance,
          behavior: defaultBehavior,
          context: defaultContext,
          github: defaultGithub,
          terminal: defaultTerminal,
          onboarded: true,
          tabChatId: null,
        }),
    }),
    {
      name: 'aurora/settings/v2',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      /**
       * v1 → v2: drop local-model records, add agentScope defaults.
       * v2 → v3: haptics boolean → level, add motion/accent/context/github/
       *          terminal/chat-tab settings, thinking level.
       */
      migrate: (persisted: any, version: number) => {
        const s = { ...(persisted ?? {}) };
        if (version < 2) delete s.localModels;

        s.agentScope = { ...defaultAgentScope, ...(s.agentScope ?? {}) };
        s.generation = { ...defaultGeneration, ...(s.generation ?? {}) };
        if (typeof s.generation.contextSize === 'number') delete s.generation.contextSize;
        s.behavior = { ...defaultBehavior, ...(s.behavior ?? {}) };
        s.context = { ...defaultContext, ...(s.context ?? {}) };
        s.github = { ...defaultGithub, ...(s.github ?? {}) };
        s.terminal = { ...defaultTerminal, ...(s.terminal ?? {}) };

        const legacyAppearance = s.appearance ?? {};
        s.appearance = { ...defaultAppearance, ...legacyAppearance };
        if (version < 3) {
          // Carry the old on/off switch into the new 4-step vocabulary.
          if (legacyAppearance.hapticsEnabled === false) s.appearance.haptics = 'off';
          delete s.appearance.hapticsEnabled;
        }
        s.appearance.hapticsEnabled = s.appearance.haptics !== 'off';

        // A truncated Gemini base URL was a real bug in earlier builds — heal it.
        if (Array.isArray(s.profiles)) {
          s.profiles = s.profiles.map((p: RemoteProfile) => {
            const b = (p.baseUrl ?? '').trim();
            if (/generativelanguage\.googleapis\.com\/v1beta\/open$/i.test(b)) {
              return { ...p, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' };
            }
            return p;
          });
        }
        return s as SettingsState;
      },
    }
  )
);

/** Convenience selector: currently active remote profile (or null). */
export function selectActiveProfile(s: SettingsState): RemoteProfile | null {
  return s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0] ?? null;
}
