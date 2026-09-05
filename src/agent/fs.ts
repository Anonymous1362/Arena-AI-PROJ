/**
 * Agent file-system layer.
 *
 * Android discovers Copper's app-specific external directory, preferring a
 * removable volume over emulated primary storage. By default, AI tools require
 * an explicitly selected project workspace through Android's Storage Access
 * Framework (SAF), such as `COPPER Projects`. All agent paths remain relative
 * and jailed to that root. This boundary is enforced: broad Manual Terminal
 * storage access is a separate capability and is never inherited by AI tools.
 * There is never an Android-internal-storage fallback for agent file work.
 * iOS and web retain their platform sandbox because Android external volumes do
 * not exist there.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { CopperExec, type ExternalStorageInfo } from '@/modules/copper-exec';

export type FsTier = 'external' | 'granted' | 'sandbox' | 'unavailable';

export interface FsPermissionInfo {
  tier: FsTier;
  /** Short, user-facing storage location. */
  rootLabel: string;
  /** A SAF tree URI when the user selected a custom Android folder. */
  treeUri?: string;
  /** Physical file URI for the automatic app-specific external root. */
  rootUri?: string;
  /** Physical path used as the native terminal's working directory. */
  rootPath?: string;
}

interface FsRoot extends FsPermissionInfo {
  uri: string;
  path?: string;
}

const SAF = (FileSystem as unknown as {
  StorageAccessFramework?: {
    requestDirectoryPermissionsAsync: (initialFileUrl?: string | null) => Promise<{ granted: boolean; directoryUri?: string }>;
    readDirectoryAsync: (directoryUri: string) => Promise<string[]>;
    makeDirectoryAsync: (parentUri: string, dirName: string) => Promise<string>;
    createFileAsync: (parentUri: string, fileName: string, mimeType: string) => Promise<string>;
  };
}).StorageAccessFramework;

/* ------------------------------- root state -------------------------------- */

let grantedTreeUri: string | null = null;
// AI access is deliberately not configurable to use the automatic external
// root. That broader capability belongs solely to the Manual Terminal.
const workspaceOnly = true;
let automaticExternal: ExternalStorageInfo | null = null;
let automaticStorageChecked = false;
let automaticStorageTask: Promise<FsPermissionInfo> | null = null;

const sandboxUri = (): string => `${FileSystem.documentDirectory ?? ''}files/`;

function withTrailingSlash(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

function externalInfo(): FsPermissionInfo {
  if (automaticExternal?.available && automaticExternal.rootUri && automaticExternal.rootPath) {
    if (workspaceOnly) {
      return {
        tier: 'unavailable',
        rootLabel: 'Select a project workspace (for example, COPPER Projects)',
      };
    }
    return {
      tier: 'external',
      rootLabel: automaticExternal.label ?? (automaticExternal.kind === 'removable' ? 'SD card' : 'External storage'),
      rootUri: withTrailingSlash(automaticExternal.rootUri),
      rootPath: automaticExternal.rootPath,
    };
  }
  return {
    tier: 'unavailable',
    rootLabel: CopperExec.isAvailable()
      ? 'No writable external storage is mounted'
      : 'External storage needs a Copper Android build',
  };
}

function grantedLabel(uri: string): string {
  const encodedTree = uri.match(/\/tree\/([^/]+)/)?.[1];
  const decoded = encodedTree ? decodeURIComponent(encodedTree) : '';
  const [volume, ...path] = decoded.split(':');
  if (volume && volume !== 'primary') {
    return `Custom folder on SD card (${volume})${path.length ? `/${path.join('/')}` : ''}`;
  }
  return path.length ? `Custom external folder (${path.join('/')})` : 'Custom external folder';
}

/** Re-arm or clear the persisted custom SAF tree. */
export function setGrantedTree(uri: string | null): void {
  grantedTreeUri = uri;
  uriCache.clear();
}

export function getGrantedTree(): string | null {
  return grantedTreeUri;
}

/**
 * Discover the automatic Android root. Safe to call more than once; `force`
 * is useful after inserting/ejecting a card. It never falls back to internal
 * storage on Android.
 */
export async function initExternalStorage(force = false): Promise<FsPermissionInfo> {
  if (Platform.OS !== 'android') {
    const uri = sandboxUri();
    if (uri) {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    }
    return currentRoot();
  }

  if (automaticStorageTask && !force) return automaticStorageTask;
  if (automaticStorageChecked && !force) return externalInfo();

  automaticStorageTask = (async () => {
    try {
      const info = await CopperExec.getStorageInfo();
      automaticExternal = info?.available && info.rootUri && info.rootPath ? info : null;
      automaticStorageChecked = true;

      // Android normally creates getExternalFilesDir() for us. Verify it once
      // so failures (e.g. a just-ejected card) surface before a tool writes.
      if (automaticExternal?.rootUri) {
        const uri = withTrailingSlash(automaticExternal.rootUri);
        const root = await FileSystem.getInfoAsync(uri);
        if (!root.exists) await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
      }
    } catch {
      automaticExternal = null;
      automaticStorageChecked = true;
    } finally {
      automaticStorageTask = null;
    }
    return externalInfo();
  })();

  return automaticStorageTask;
}

/** Switch back from a custom SAF folder to the removable/primary auto root. */
export async function useDefaultExternalStorage(): Promise<FsPermissionInfo> {
  revokeStorageAccess();
  return initExternalStorage(true);
}

/** Returns the active root synchronously for labels and shell status. */
export function currentRoot(): FsRoot {
  if (grantedTreeUri && Platform.OS === 'android') {
    return {
      tier: 'granted',
      uri: grantedTreeUri,
      treeUri: grantedTreeUri,
      rootLabel: grantedLabel(grantedTreeUri),
    };
  }

  if (Platform.OS === 'android') {
    const info = externalInfo();
    return {
      ...info,
      uri: info.rootUri ?? '',
      path: info.rootPath,
    };
  }

  const uri = sandboxUri();
  return { tier: 'sandbox', uri, rootUri: uri, rootLabel: 'App sandbox' };
}

/** A label/path snapshot suitable for the Settings screen. */
export function getStorageStatus(): FsPermissionInfo {
  const root = currentRoot();
  return {
    tier: root.tier,
    rootLabel: root.rootLabel,
    treeUri: root.treeUri,
    rootUri: root.rootUri,
    rootPath: root.rootPath,
  };
}

/**
 * Opens the Android system folder picker, initially focused on a removable SD
 * volume when one is mounted. Selecting a SAF workspace is required before AI
 * file tools can operate; no app-specific external-folder fallback is used.
 */
export async function requestStorageAccess(): Promise<FsPermissionInfo> {
  if (Platform.OS === 'web') {
    throw new Error('Picking a device folder requires the native app.');
  }

  if (Platform.OS === 'android') {
    await initExternalStorage();
    if (!SAF) throw new Error('The Android folder picker is unavailable in this build.');

    const initialUri = automaticExternal?.removableSafRootUri ?? automaticExternal?.safRootUri ?? null;
    const res = await SAF.requestDirectoryPermissionsAsync(initialUri);
    if (res.granted && res.directoryUri) {
      grantedTreeUri = res.directoryUri;
      uriCache.clear();
      return {
        tier: 'granted',
        rootLabel: grantedLabel(res.directoryUri),
        treeUri: res.directoryUri,
      };
    }
    // The user closed the picker. Keep the selected-workspace requirement in
    // place; AI never falls back to an automatic external root.
    return getStorageStatus();
  }

  return currentRoot();
}

export function revokeStorageAccess(): void {
  grantedTreeUri = null;
  uriCache.clear();
}

/** Resolve the current Android volume before an actual file operation. */
async function activeRoot(): Promise<FsRoot> {
  // Refresh the automatic root for each operation so ejecting/inserting a card
  // while Copper stays open never redirects work to internal storage (and can
  // immediately select the newly mounted removable volume).
  if (Platform.OS === 'android' && !grantedTreeUri) {
    await initExternalStorage(true);
  }
  const root = currentRoot();
  if (root.tier === 'unavailable' || !root.uri) {
    if (Platform.OS === 'android' && workspaceOnly && !grantedTreeUri) {
      throw new Error('No AI project workspace is selected. In Settings → Agent & storage, choose your COPPER Projects folder first.');
    }
    throw new Error(
      CopperExec.isAvailable()
        ? 'No writable external storage is mounted. Insert or remount the SD card, then select a project workspace in Agent & storage.'
        : 'External storage is available only in a Copper Android build. Expo Go cannot load the external-storage module.'
    );
  }
  return root;
}

/* ------------------------------ path helpers ------------------------------- */

/** Normalize + jail-check a relative agent path. Throws on escapes. */
export function safeRelPath(input: string): string {
  const p = String(input ?? '').replace(/^\/+/, '');
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) throw new Error(`Path escapes the storage root: ${input}`);
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join('/');
}

function requiredPath(input: string, operation: string): string {
  const path = safeRelPath(input);
  if (!path) throw new Error(`${operation} requires a path inside the storage root.`);
  return path;
}

function joinUri(rootUri: string, rel: string): string {
  return `${withTrailingSlash(rootUri)}${rel}`;
}

function nameOf(uri: string): string {
  const last = uri.split('/').pop() ?? '';
  return decodeURIComponent(last);
}

/* ------------------------------ SAF navigation ----------------------------- */

const uriCache = new Map<string, string>();

async function safChild(dirUri: string, name: string): Promise<string | null> {
  const entries = await SAF!.readDirectoryAsync(dirUri);
  for (const entry of entries) {
    if (nameOf(entry) === name) return entry;
  }
  return null;
}

/** Resolve an existing document or directory inside the SAF tree. */
async function safResolveExisting(rel: string): Promise<string> {
  let current = grantedTreeUri!;
  if (!rel) return current;

  for (const segment of rel.split('/')) {
    const cacheKey = `${current}::${segment}`;
    let child = uriCache.get(cacheKey) ?? (await safChild(current, segment));
    if (!child) throw new Error(`Not found: ${rel}`);
    uriCache.set(cacheKey, child);
    current = child;
  }
  return current;
}

/** Resolve/create a directory path inside the SAF tree. */
async function safEnsureDirectory(rel: string): Promise<string> {
  let current = grantedTreeUri!;
  if (!rel) return current;

  for (const segment of rel.split('/')) {
    const cacheKey = `${current}::${segment}`;
    let child = uriCache.get(cacheKey) ?? (await safChild(current, segment));
    if (!child) child = await SAF!.makeDirectoryAsync(current, segment);
    uriCache.set(cacheKey, child);
    current = child;
  }
  return current;
}

function mimeFor(filename: string): string {
  if (/\.(md|markdown)$/i.test(filename)) return 'text/markdown';
  if (/\.json$/i.test(filename)) return 'application/json';
  if (/\.csv$/i.test(filename)) return 'text/csv';
  if (/\.(html?|xml)$/i.test(filename)) return 'text/html';
  return 'text/plain';
}

async function writeToSaf(path: string, content: string): Promise<string> {
  const segments = path.split('/');
  const filename = segments.pop()!;
  const parent = await safEnsureDirectory(segments.join('/'));
  const existing = await safChild(parent, filename);
  const fileUri = existing ?? (await SAF!.createFileAsync(parent, filename, mimeFor(filename)));
  await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
  uriCache.clear();
  return fileUri;
}

/* --------------------------------- operations ------------------------------ */

const TEXT_EXT = /\.(txt|md|markdown|json|jsonc|js|jsx|ts|tsx|mjs|cjs|css|scss|html|htm|xml|yaml|yml|toml|ini|cfg|conf|env|sh|bash|zsh|py|rb|go|rs|java|kt|kts|c|h|cpp|hpp|cs|php|sql|csv|tsv|log|gitignore|properties|gradle|plist|swift|lock)$/i;

export async function readAgentFile(rel: string, maxSize = 2 * 1024 * 1024): Promise<string> {
  const path = requiredPath(rel, 'Reading');
  const root = await activeRoot();
  if (root.tier === 'granted' && SAF) {
    const uri = await safResolveExisting(path);
    const size = await fileSizeOf(uri).catch(() => 0);
    if (size > maxSize) {
      return `File too large to read fully (${formatKB(size)}; limit ${formatKB(maxSize)}). Read it in ranges or delete sections first.`;
    }
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  }

  const uri = joinUri(root.uri, path);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error(`File not found: ${path}`);
  if ((info as { size?: number }).size && (info as { size?: number }).size! > maxSize) {
    return `File too large to read fully (${formatKB((info as { size?: number }).size!)}; limit ${formatKB(maxSize)}).`;
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

async function writeRootFile(rel: string, content: string): Promise<string> {
  const path = requiredPath(rel, 'Writing');
  const root = await activeRoot();
  if (root.tier === 'granted' && SAF) return writeToSaf(path, content);

  const uri = joinUri(root.uri, path);
  const dir = uri.slice(0, uri.lastIndexOf('/'));
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
}

export async function writeAgentFile(rel: string, content: string, maxSize = 1024 * 1024): Promise<string> {
  const path = requiredPath(rel, 'Writing');
  if (content.length > maxSize) {
    throw new Error(`Content too large (${formatKB(content.length)}; limit ${formatKB(maxSize)}). Write in chunks or reduce size.`);
  }
  await writeRootFile(path, content);
  return `Wrote ${formatKB(content.length)} to ${path}`;
}

/** Write a user-visible export into the active external/custom root. */
export async function writeAgentExport(filename: string, content: string): Promise<string> {
  const cleanName = requiredPath(filename.replace(/[\\/]+/g, '_'), 'Exporting');
  return writeRootFile(`exports/${cleanName}`, content);
}

export async function listAgentDir(rel: string): Promise<string> {
  const path = safeRelPath(rel);
  const root = await activeRoot();
  if (root.tier === 'granted' && SAF) {
    const uri = path ? await safResolveExisting(path) : root.uri;
    const entries = await SAF.readDirectoryAsync(uri);
    if (entries.length === 0) return `(empty) ${path || '.'}`;
    const lines = entries.map((e) => `${looksLikeDir(e) ? 'd' : '-'} ${nameOf(e)}`);
    return `${path || '.'}\n${lines.join('\n')}`;
  }

  const uri = joinUri(root.uri, path);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error(`Directory not found: ${path || '.'}`);
  if (!(info as { isDirectory?: boolean }).isDirectory) throw new Error(`Not a directory: ${path}`);
  const items = await FileSystem.readDirectoryAsync(uri);
  if (items.length === 0) return `(empty) ${path || '.'}`;
  return `${path || '.'}\n${items.map((n) => `${TEXT_EXT.test(n) || n.includes('.') ? '-' : 'd'} ${n}`).join('\n')}`;
}

export async function statAgentPath(rel: string): Promise<string> {
  const path = requiredPath(rel, 'Stat');
  const root = await activeRoot();
  if (root.tier === 'granted' && SAF) {
    const uri = await safResolveExisting(path);
    const size = await fileSizeOf(uri).catch(() => 0);
    return `${path}\n  type: ${looksLikeDir(uri) ? 'directory' : 'file'}\n  size: ${formatKB(size)}`;
  }

  const uri = joinUri(root.uri, path);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error(`Not found: ${path}`);
  const s = info as { size?: number; isDirectory?: boolean; modificationTime?: number };
  return [
    path,
    `  type: ${s.isDirectory ? 'directory' : 'file'}`,
    `  size: ${formatKB(s.size ?? 0)}`,
    s.modificationTime ? `  modified: ${new Date(s.modificationTime * 1000).toISOString()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function mkdirAgent(rel: string): Promise<string> {
  const path = requiredPath(rel, 'Creating a directory');
  const root = await activeRoot();
  if (root.tier === 'granted' && SAF) {
    await safEnsureDirectory(path);
    uriCache.clear();
  } else {
    await FileSystem.makeDirectoryAsync(joinUri(root.uri, path), { intermediates: true });
  }
  return `Created directory ${path}`;
}

export async function deleteAgentPath(rel: string): Promise<string> {
  const path = requiredPath(rel, 'Deleting');
  const root = await activeRoot();
  if (root.tier === 'granted' && SAF) {
    await FileSystem.deleteAsync(await safResolveExisting(path), { idempotent: true });
    uriCache.clear();
  } else {
    await FileSystem.deleteAsync(joinUri(root.uri, path), { idempotent: true });
  }
  return `Deleted ${path}`;
}

/* -------------------------------- utilities -------------------------------- */

async function fileSizeOf(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? (info as { size?: number }).size ?? 0 : 0;
  } catch {
    return 0;
  }
}

function looksLikeDir(uri: string): boolean {
  // The legacy SAF API does not expose a reliable directory stat. This keeps
  // command listings useful while accepting that uncommon dotted folder names
  // are displayed as files.
  return !/\.[A-Za-z0-9]{1,8}$/.test(nameOf(uri));
}

function formatKB(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
