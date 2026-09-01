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
  /** Extra request headers (e.g. HTTP-Referer for OpenRouter). */
  headers?: Record<string, string>;
  /** Curated suggestion list shown in the model picker. */
  suggestedModels?: string[];
}

/**
 * What produces the next assistant message.
 *  - remote: an OpenAI-compatible endpoint (cloud or LAN)
 *  - local:  a GGUF model running fully on-device via llama.cpp
 */
export type ActiveModel =
  | { kind: 'remote'; profileId: string; model: string }
  | { kind: 'local'; modelId: string }
  | null;

export interface LocalModelRecord {
  id: string;
  name: string;
  /** Absolute file:// URI of the .gguf file on device. */
  fileUri: string;
  /** Source URL (used for re-download / provenance display). */
  url?: string;
  sizeBytes: number;
  downloadedAt: number;
}

export interface GenerationSettings {
  temperature: number;
  topP: number;
  maxTokens: number;
  contextSize: number;
  systemPrompt: string;
}

export interface AppearanceSettings {
  theme: 'system' | 'light' | 'dark';
  messageTextSize: 's' | 'm' | 'l';
  hapticsEnabled: boolean;
}

export interface BehaviorSettings {
  autoTitle: boolean;
  sendOnEnter: boolean;
}

export interface SettingsState {
  profiles: RemoteProfile[];
  activeProfileId: string | null;
  activeModel: ActiveModel;
  /** Cached GET /v1/models results, keyed by profile id. */
  modelCache: Record<string, { models: string[]; fetchedAt: number }>;
  localModels: LocalModelRecord[];
  generation: GenerationSettings;
  appearance: AppearanceSettings;
  behavior: BehaviorSettings;
  onboarded: boolean;

  addProfile: (p: Omit<RemoteProfile, 'id'>) => string;
  updateProfile: (id: string, patch: Partial<Omit<RemoteProfile, 'id'>>) => void;
  removeProfile: (id: string) => void;
  setActiveProfile: (id: string | null) => void;
  setActiveModel: (m: ActiveModel) => void;
  cacheModels: (profileId: string, models: string[]) => void;
  addLocalModel: (m: LocalModelRecord) => void;
  removeLocalModel: (id: string) => void;
  patchGeneration: (patch: Partial<GenerationSettings>) => void;
  patchAppearance: (patch: Partial<AppearanceSettings>) => void;
  patchBehavior: (patch: Partial<BehaviorSettings>) => void;
  setOnboarded: (v: boolean) => void;
  resetAll: () => void;
}

/* --------------------------------- defaults -------------------------------- */

export const DEFAULT_SYSTEM_PROMPT =
  'You are Aurora, a thoughtful, concise AI assistant. Format answers with markdown when helpful.';

const defaultGeneration: GenerationSettings = {
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 1024,
  contextSize: 3072,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

const defaultAppearance: AppearanceSettings = {
  theme: 'system',
  messageTextSize: 'm',
  hapticsEnabled: true,
};

const defaultBehavior: BehaviorSettings = {
  autoTitle: true,
  sendOnEnter: false,
};

/* ---------------------------------- store ---------------------------------- */

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: null,
      activeModel: null,
      modelCache: {},
      localModels: [],
      generation: defaultGeneration,
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
            s.activeModel?.kind === 'remote' && s.activeModel.profileId === id ? null : s.activeModel;
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

      addLocalModel: (m) =>
        set((s) => ({
          localModels: s.localModels.some((x) => x.id === m.id)
            ? s.localModels
            : [m, ...s.localModels],
        })),

      removeLocalModel: (id) =>
        set((s) => ({
          localModels: s.localModels.filter((m) => m.id !== id),
          activeModel:
            s.activeModel?.kind === 'local' && s.activeModel.modelId === id ? null : s.activeModel,
        })),

      patchGeneration: (patch) => set((s) => ({ generation: { ...s.generation, ...patch } })),
      patchAppearance: (patch) => set((s) => ({ appearance: { ...s.appearance, ...patch } })),
      patchBehavior: (patch) => set((s) => ({ behavior: { ...s.behavior, ...patch } })),

      setOnboarded: (v) => set({ onboarded: v }),

      resetAll: () =>
        set({
          profiles: [],
          activeProfileId: null,
          activeModel: null,
          modelCache: {},
          localModels: [],
          generation: defaultGeneration,
          appearance: defaultAppearance,
          behavior: defaultBehavior,
          onboarded: true,
        }),
    }),
    {
      name: 'aurora/settings/v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);

/** Convenience selector: currently active remote profile (or null). */
export function selectActiveProfile(s: SettingsState): RemoteProfile | null {
  return s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0] ?? null;
}
