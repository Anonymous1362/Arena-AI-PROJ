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

export interface GenerationSettings {
  temperature: number;
  topP: number;
  maxTokens: number;
  /** Instructions appended after the agent master prompt. */
  systemPrompt: string;
}

export interface AgentScope {
  /** Master switch: tools + terminal available to the model. */
  enabled: boolean;
  /** User granted a storage root (Android SAF tree / app sandbox). */
  storageEnabled: boolean;
  safTreeUri?: string;
  safRootLabel?: string;
}

export interface AppearanceSettings {
  theme: 'system' | 'light' | 'dark';
  messageTextSize: 's' | 'm' | 'l';
  hapticsEnabled: boolean;
}

export interface BehaviorSettings {
  autoTitle: boolean;
  sendOnEnter: boolean;
  /** Auto-continue when a provider truncates mid-task. */
  autoContinue: boolean;
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
  onboarded: boolean;

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
  setOnboarded: (v: boolean) => void;
  resetAll: () => void;
}

/* --------------------------------- defaults -------------------------------- */

const defaultGeneration: GenerationSettings = {
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 4096,
  systemPrompt: '',
};

const defaultAgentScope: AgentScope = {
  enabled: true,
  storageEnabled: false,
};

const defaultAppearance: AppearanceSettings = {
  theme: 'system',
  messageTextSize: 'm',
  hapticsEnabled: true,
};

const defaultBehavior: BehaviorSettings = {
  autoTitle: true,
  sendOnEnter: false,
  autoContinue: true,
};

/* ---------------------------------- store ---------------------------------- */

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: null,
      activeModel: null,
      modelCache: {},
      generation: defaultGeneration,
      agentScope: defaultAgentScope,
      appearance: defaultAppearance,
      behavior: defaultBehavior,
      onboarded: false,

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
          onboarded: true,
        }),
    }),
    {
      name: 'aurora/settings/v2',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // v1 → v2: drop local-model records, add agentScope defaults.
      migrate: (persisted: any) => {
        const s = { ...persisted };
        delete s.localModels;
        if (!s.agentScope) s.agentScope = defaultAgentScope;
        if (s.generation && typeof (s.generation as any).contextSize === 'number') {
          delete (s.generation as any).contextSize;
        }
        if (!s.behavior) s.behavior = defaultBehavior;
        if (typeof (s.behavior as any).autoContinue !== 'boolean') {
          (s.behavior as any).autoContinue = true;
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
