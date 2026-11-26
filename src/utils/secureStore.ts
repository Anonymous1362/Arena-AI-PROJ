/**
 * Device secure storage for secrets (provider API keys, GitHub tokens).
 *
 * On iOS this is the Keychain, on Android it is Keystore-backed encrypted
 * preferences. The plain-web build has no keychain, so it falls back to
 * AsyncStorage — a browser PWA cannot protect localStorage, and we say so in
 * Settings → Data & privacy rather than pretending otherwise.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SecureStoreModule {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

let cached: SecureStoreModule | null | undefined;

function nativeModule(): SecureStoreModule | null {
  if (Platform.OS === 'web') return null;
  if (cached !== undefined) return cached;
  try {
    // Loaded lazily so the web bundle never pulls in the native module.
    cached = require('expo-secure-store') as SecureStoreModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when secrets land in the OS keychain/keystore rather than plain storage. */
export function secureStoreAvailable(): boolean {
  return nativeModule() !== null;
}

const WEB_PREFIX = '__copper_secure__:';

export async function secureGet(key: string): Promise<string | null> {
  const mod = nativeModule();
  if (mod) {
    try {
      return await mod.getItemAsync(key);
    } catch {
      return null;
    }
  }
  return AsyncStorage.getItem(WEB_PREFIX + key);
}

export async function secureSet(key: string, value: string): Promise<void> {
  const mod = nativeModule();
  if (mod) {
    try {
      await mod.setItemAsync(key, value);
      return;
    } catch {
      /* fall through to plain storage so the app keeps working */
    }
  }
  await AsyncStorage.setItem(WEB_PREFIX + key, value);
}

export async function secureDelete(key: string): Promise<void> {
  const mod = nativeModule();
  if (mod) {
    try {
      await mod.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  }
  await AsyncStorage.removeItem(WEB_PREFIX + key);
}
