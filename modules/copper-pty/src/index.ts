/**
 * JS bridge for the optional CopperPty native module.
 *
 * `requireOptionalNativeModule` returns null in Expo Go and on platforms
 * without the module, so importing this file is always safe; the app feature-
 * detects and labels itself honestly (Terminal tab status chips).
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface CopperPtyNative {
  exec(command: string, timeoutMs: number): Promise<{ stdout: string; exit: number }>;
  spawn(command: string, cwd: string): Promise<number> | number;
  write(id: number, text: string): Promise<boolean> | boolean;
  output(id: number): Promise<string> | string;
  alive(id: number): Promise<boolean> | boolean;
  kill(id: number): Promise<boolean> | boolean;
}

export const copperPty = (requireOptionalNativeModule('CopperPty') as CopperPtyNative | null) ?? null;

export function ptyAvailable(): boolean {
  return !!copperPty && typeof copperPty.exec === 'function';
}

export function sessionAvailable(): boolean {
  return !!copperPty && typeof copperPty.spawn === 'function';
}
