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
  /** Absolute root of the selected physical volume, e.g. /storage/0123-4567. */
  volumeRootPath?: string;
}

export interface NativeCommandResult {
  stdout: string;
  exit: number;
  timedOut: boolean;
  /** Absolute external directory used as this command's cwd. */
  cwd: string;
}

export type CopperRuntimeState =
  | 'bundle_missing'
  | 'not_installed'
  | 'ready'
  | 'repair_required'
  | 'package_mismatch';

/** Native package/runtime state. A `bundle_missing` state intentionally means
 * this APK has no verified Copper-prefix bootstrap and cannot act as Termux. */
export interface CopperRuntimeStatus {
  state: CopperRuntimeState;
  ready: boolean;
  bundleAvailable: boolean;
  supportedAbi: string;
  runtimePrefix: string;
  runtimeHome: string;
  persistentBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  freeDeviceBytes: number;
  packageName: string;
  expectedPackageName: string;
}

type NativeCopperExec = {
  getStorageInfo(): Promise<ExternalStorageInfo>;
  getExternalFilesDir(): Promise<ExternalStorageInfo>;
  getExternalSdCard(): Promise<ExternalStorageInfo | null>;
  hasAllFilesAccess(): Promise<boolean>;
  requestAllFilesAccess(): Promise<boolean>;
  getTerminalStartDirectory(): Promise<string | null>;
  resolveSharedDirectory(target: string, workingDirectory: string | null): Promise<string>;
  getRuntimeStatus(): Promise<CopperRuntimeStatus>;
  installCopperRuntime(replaceExisting: boolean): Promise<CopperRuntimeStatus>;
  repairCopperRuntime(): Promise<CopperRuntimeStatus>;
  removeCopperRuntime(preserveHome: boolean): Promise<CopperRuntimeStatus>;
  /** Shares an external file or user-granted SAF URI without a cache copy. */
  shareUri(uri: string, mimeType: string, title: string | null): Promise<boolean>;
  /** Runs an agent command in Copper's automatic external workspace. */
  exec(command: string, workingDirectory: string | null, timeoutMs: number): Promise<NativeCommandResult>;
  /** Runs a manual command anywhere in Android shared storage after user grant. */
  execAllFiles(command: string, workingDirectory: string | null, timeoutMs: number): Promise<NativeCommandResult>;
};

const native = requireOptionalNativeModule<NativeCopperExec>('CopperExec');

/**
 * Optional native bridge. It is included in a custom Copper Android build and
 * intentionally absent in Expo Go, iOS, and web.
 */
export const CopperExec = {
  isAvailable: (): boolean => native != null,

  getStorageInfo: async (): Promise<ExternalStorageInfo | null> =>
    native ? native.getStorageInfo() : null,

  getExternalFilesDir: async (): Promise<ExternalStorageInfo | null> =>
    native ? native.getExternalFilesDir() : null,

  getExternalSdCard: async (): Promise<ExternalStorageInfo | null> =>
    native ? native.getExternalSdCard() : null,

  hasAllFilesAccess: async (): Promise<boolean> => native ? native.hasAllFilesAccess() : false,

  requestAllFilesAccess: async (): Promise<boolean> => {
    if (!native) throw new Error('All-files access is available only in a Copper Android build.');
    return native.requestAllFilesAccess();
  },

  getTerminalStartDirectory: async (): Promise<string | null> =>
    native ? native.getTerminalStartDirectory() : null,

  resolveSharedDirectory: async (target: string, workingDirectory: string | null): Promise<string> => {
    if (!native) throw new Error('The manual terminal is available only in a Copper Android build.');
    return native.resolveSharedDirectory(target, workingDirectory);
  },

  getRuntimeStatus: async (): Promise<CopperRuntimeStatus | null> =>
    native ? native.getRuntimeStatus() : null,

  installCopperRuntime: async (replaceExisting = false): Promise<CopperRuntimeStatus> => {
    if (!native) throw new Error('Copper Runtime installation is available only in a Copper Android build.');
    return native.installCopperRuntime(replaceExisting);
  },

  repairCopperRuntime: async (): Promise<CopperRuntimeStatus> => {
    if (!native) throw new Error('Copper Runtime repair is available only in a Copper Android build.');
    return native.repairCopperRuntime();
  },

  removeCopperRuntime: async (preserveHome = false): Promise<CopperRuntimeStatus> => {
    if (!native) throw new Error('Copper Runtime removal is available only in a Copper Android build.');
    return native.removeCopperRuntime(preserveHome);
  },

  shareUri: async (uri: string, mimeType: string, title: string | null): Promise<boolean> => {
    if (!native) throw new Error('Native sharing for an external/custom folder is unavailable in this build.');
    return native.shareUri(uri, mimeType, title);
  },

  exec: async (command: string, workingDirectory: string | null, timeoutMs: number): Promise<NativeCommandResult> => {
    if (!native) throw new Error('Native external-storage terminal is unavailable in this build. Install a Copper Android build, not Expo Go.');
    return native.exec(command, workingDirectory, timeoutMs);
  },

  execAllFiles: async (command: string, workingDirectory: string | null, timeoutMs: number): Promise<NativeCommandResult> => {
    if (!native) throw new Error('The manual terminal is available only in a Copper Android build.');
    return native.execAllFiles(command, workingDirectory, timeoutMs);
  },
};
