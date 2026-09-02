import { requireOptionalNativeModule } from 'expo-modules-core';

export type ExternalStorageKind = 'removable' | 'primary';

/**
 * App-specific external storage selected by Android. `root*` always points to
 * a writable app folder; `removable*` is populated only when a removable card
 * is currently mounted.
 */
export interface ExternalStorageInfo {
  available: boolean;
  kind?: ExternalStorageKind;
  label?: string;
  rootUri?: string;
  rootPath?: string;
  /** File URI for the volume root, useful for display/debugging. */
  volumeRootUri?: string;
  /** DocumentsUI URI used to open the SAF picker at this volume. */
  safRootUri?: string;
  removableRootUri?: string;
  removableRootPath?: string;
  removableSafRootUri?: string;
}

export interface NativeCommandResult {
  stdout: string;
  exit: number;
  timedOut: boolean;
  /** Absolute app-specific external directory used as the command cwd. */
  cwd: string;
}

type NativeAuroraExec = {
  getStorageInfo(): Promise<ExternalStorageInfo>;
  getExternalFilesDir(): Promise<ExternalStorageInfo>;
  getExternalSdCard(): Promise<ExternalStorageInfo | null>;
  /** Shares a user-granted SAF content URI without making an internal cache copy. */
  shareUri(uri: string, mimeType: string, title: string | null): Promise<boolean>;
  exec(command: string, workingDirectory: string | null, timeoutMs: number): Promise<NativeCommandResult>;
};

const native = requireOptionalNativeModule<NativeAuroraExec>('AuroraExec');

/**
 * Optional bridge: it is present in a custom Android build and intentionally
 * absent in Expo Go, iOS, and web.
 */
export const AuroraExec = {
  isAvailable: (): boolean => native != null,

  getStorageInfo: async (): Promise<ExternalStorageInfo | null> =>
    native ? native.getStorageInfo() : null,

  getExternalFilesDir: async (): Promise<ExternalStorageInfo | null> =>
    native ? native.getExternalFilesDir() : null,

  getExternalSdCard: async (): Promise<ExternalStorageInfo | null> =>
    native ? native.getExternalSdCard() : null,

  shareUri: async (uri: string, mimeType: string, title: string | null): Promise<boolean> => {
    if (!native) {
      throw new Error('Native sharing for a custom folder is unavailable in this build.');
    }
    return native.shareUri(uri, mimeType, title);
  },

  exec: async (command: string, workingDirectory: string | null, timeoutMs: number): Promise<NativeCommandResult> => {
    if (!native) {
      throw new Error('Native external-storage terminal is unavailable in this build. Install a Copper Android build, not Expo Go.');
    }
    return native.exec(command, workingDirectory, timeoutMs);
  },
};
