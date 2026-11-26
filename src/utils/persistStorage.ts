/**
 * Persistence helpers shared by the zustand stores.
 *
 *  - `secretBackedStorage` keeps credentials out of the plain JSON blob that
 *    AsyncStorage writes to disk: secrets are split into secure storage and
 *    scrubbed from the persisted state, with a one-shot migration for users
 *    who already have keys in the old plaintext blob.
 *  - `quotaSafeStorage` keeps AsyncStorage's 6 MB Android ceiling from turning
 *    a chat into a crash: on a failed write it hands the state to a shrinker
 *    and retries once.
 *
 * Both fall back to the legacy `aurora/*` keys so upgrading does not lose data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';
import { secureDelete, secureGet, secureSet } from '@/src/utils/secureStore';

export interface SecretBundle {
  [key: string]: unknown;
}

export interface SecretCodec {
  /** Where the secret payload lives in secure storage. */
  secretsKey: string;
  /** Split secrets out of a state object, returning the scrubbed copy. */
  extract: (state: any) => { scrubbed: any; bundle: SecretBundle };
  /** Put secrets back into a state object loaded from disk. */
  inject: (state: any, bundle: SecretBundle | null) => any;
  /** True when the raw state still carries plaintext credentials. */
  hasPlaintextSecrets: (state: any) => boolean;
}

async function readBundle(key: string): Promise<SecretBundle | null> {
  const raw = await secureGet(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as SecretBundle) : null;
  } catch {
    return null;
  }
}

export function secretBackedStorage(opts: {
  name: string;
  legacyName?: string;
  codec: SecretCodec;
}): StateStorage {
  const { name, legacyName, codec } = opts;

  return {
    async getItem() {
      let raw = await AsyncStorage.getItem(name);
      let usedLegacy = false;
      if (raw == null && legacyName) {
        raw = await AsyncStorage.getItem(legacyName);
        usedLegacy = raw != null;
      }
      if (raw == null) return null;

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!parsed?.state) return raw;

      const bundle = await readBundle(codec.secretsKey);
      parsed.state = codec.inject(parsed.state, bundle);

      // Migrate old plaintext blobs (and the legacy key name) in the background.
      if (codec.hasPlaintextSecrets(parsed.state) || usedLegacy) {
        try {
          const { scrubbed, bundle: fresh } = codec.extract(parsed.state);
          await secureSet(codec.secretsKey, JSON.stringify(fresh));
          await AsyncStorage.setItem(name, JSON.stringify({ ...parsed, state: scrubbed }));
          if (legacyName) await AsyncStorage.removeItem(legacyName);
        } catch {
          /* a failed migration must not block hydration */
        }
      }
      return JSON.stringify(parsed);
    },

    async setItem(_key, value) {
      let parsed: any;
      try {
        parsed = JSON.parse(value);
      } catch {
        await AsyncStorage.setItem(name, value);
        return;
      }
      try {
        const { scrubbed, bundle } = codec.extract(parsed.state ?? {});
        await secureSet(codec.secretsKey, JSON.stringify(bundle));
        await AsyncStorage.setItem(name, JSON.stringify({ ...parsed, state: scrubbed }));
      } catch {
        /* never let a storage hiccup break the in-memory store */
      }
    },

    async removeItem() {
      await AsyncStorage.removeItem(name);
      if (legacyName) await AsyncStorage.removeItem(legacyName);
      await secureDelete(codec.secretsKey);
    },
  };
}

export function quotaSafeStorage(opts: {
  name: string;
  legacyName?: string;
  /** Return a smaller state to retry with, or null to give up. */
  shrink?: (parsed: any) => any | null;
}): StateStorage {
  const { name, legacyName, shrink } = opts;

  return {
    async getItem() {
      const raw = await AsyncStorage.getItem(name);
      if (raw != null) return raw;
      if (!legacyName) return null;
      const legacy = await AsyncStorage.getItem(legacyName);
      if (legacy == null) return null;
      // Adopt the legacy blob under the new key so the migration happens once.
      try {
        await AsyncStorage.setItem(name, legacy);
        await AsyncStorage.removeItem(legacyName);
      } catch {
        /* keep reading from the legacy key */
      }
      return legacy;
    },

    async setItem(_key, value) {
      try {
        await AsyncStorage.setItem(name, value);
        return;
      } catch (err) {
        if (!shrink) {
          console.warn('[copper] storage write failed', err);
          return;
        }
        try {
          const parsed = JSON.parse(value);
          const smaller = shrink(parsed);
          if (smaller) {
            await AsyncStorage.setItem(name, JSON.stringify(smaller));
            console.warn('[copper] storage was full — older data was pruned to save this write.');
            return;
          }
        } catch {
          /* fall through */
        }
        console.warn('[copper] storage write failed and could not be recovered', err);
      }
    },

    async removeItem() {
      await AsyncStorage.removeItem(name);
      if (legacyName) await AsyncStorage.removeItem(legacyName);
    },
  };
}
