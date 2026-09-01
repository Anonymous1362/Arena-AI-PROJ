import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { EngineUnavailableError } from '@/src/ai/types';

/**
 * Local-model file management: storage location, downloads with progress,
 * cancellation and deletion. Native only — the web build never imports this
 * at runtime (see LocalEngine.web.ts).
 */

export interface DownloadProgress {
  received: number;
  total: number;
  fraction: number;
}

type ProgressCb = (p: DownloadProgress) => void;

const resumables = new Map<string, FileSystem.DownloadResumable>();

function assertNative(): void {
  if (Platform.OS === 'web') {
    throw new EngineUnavailableError('On-device models require the native app.');
  }
}

export function modelsDir(): string {
  return `${FileSystem.documentDirectory ?? ''}models/`;
}

export async function ensureModelsDir(): Promise<string> {
  assertNative();
  const dir = modelsDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export function localFileUri(modelId: string): string {
  return `${modelsDir()}${modelId}.gguf`;
}

export async function fileExists(uri: string): Promise<boolean> {
  assertNative();
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists;
}

export async function fileSize(uri: string): Promise<number> {
  assertNative();
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? (info as { size?: number }).size ?? 0 : 0;
}

export async function freeDiskBytes(): Promise<number> {
  assertNative();
  try {
    return await FileSystem.getFreeDiskStorageAsync();
  } catch {
    return NaN;
  }
}

export async function deleteModelFile(uri: string): Promise<void> {
  assertNative();
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

/**
 * Download a GGUF with progress. Resolves with the final file URI + size.
 * Cancel with `cancelDownload(modelId)` — rejects with `DownloadCancelled`.
 */
export class DownloadCancelled extends Error {
  constructor() {
    super('Download cancelled');
    this.name = 'DownloadCancelled';
  }
}

export async function downloadModelFile(
  modelId: string,
  url: string,
  onProgress: ProgressCb
): Promise<{ fileUri: string; size: number }> {
  assertNative();
  await ensureModelsDir();
  const fileUri = localFileUri(modelId);

  const existing = await fileExists(fileUri);
  if (existing) {
    const size = await fileSize(fileUri);
    if (size > 0) return { fileUri, size };
  }

  const callback: FileSystem.DownloadProgressCallback = (data) => {
    const total = data.totalBytesExpectedToWrite ?? 0;
    const received = data.totalBytesWritten ?? 0;
    onProgress({ received, total, fraction: total > 0 ? received / total : 0 });
  };

  const resumable = FileSystem.createDownloadResumable(url, fileUri, {}, callback);
  resumables.set(modelId, resumable);
  try {
    const result = await resumable.downloadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
      throw new Error(`Download failed (HTTP ${result?.status ?? '—'}).`);
    }
    const size = await fileSize(fileUri);
    return { fileUri, size };
  } catch (e) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    if ((e as Error)?.message === 'Download cancelled' || (e as Error)?.name === 'AbortError') {
      throw new DownloadCancelled();
    }
    throw e;
  } finally {
    resumables.delete(modelId);
  }
}

export async function cancelDownload(modelId: string): Promise<void> {
  const r = resumables.get(modelId);
  if (!r) return;
  resumables.delete(modelId);
  try {
    await r.cancelAsync();
  } catch {
    /* noop */
  }
}

export function isDownloading(modelId: string): boolean {
  return resumables.has(modelId);
}
