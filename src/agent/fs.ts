/**
 * Agent file-system layer.
 *
 * Two tiers, both explicit:
 *  1. App sandbox (documents/) — always available, no permissions.
 *  2. User-granted tree (Android SAF via the legacy FileSystem module; iOS:
 *     app sandbox only) — granted with the system picker when the user first
 *     enables "Storage access". Grant URI is persisted; revocable anytime.
 *
 * All agent paths are relative and jailed to the active root.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type * as FSTypes from 'expo-file-system';

export type FsTier = 'sandbox' | 'granted';

export interface FsPermissionInfo {
  tier: FsTier;
  /** Display label for the granted root (short). */
  rootLabel: string;
  /** SAF tree URI when granted on Android. */
  treeUri?: string;
}

const SAF = (FileSystem as unknown as {
  StorageAccessFramework?: {
    requestDirectoryPermissionsAsync: (initialFileUrl?: string) => Promise<{ granted: boolean; directoryUri?: string }>;
    readDirectoryAsync: (directoryUri: string) => Promise<string[]>;
    makeDirectoryAsync: (parentUri: string, dirName: string) => Promise<string>;
    writeFileAsync: (parentUri: string, fileName: string, content: string, encoding?: string) => Promise<string>;
  };
}).StorageAccessFramework;

/* ------------------------------- root state -------------------------------- */

let grantedTreeUri: string | null = null;

export function setGrantedTree(uri: string | null): void {
  grantedTreeUri = uri;
}

export function getGrantedTree(): string | null {
  return grantedTreeUri;
}

export function currentRoot(): { tier: FsTier; uri: string } {
  if (grantedTreeUri && Platform.OS !== 'web') return { tier: 'granted', uri: grantedTreeUri };
  return { tier: 'sandbox', uri: `${FileSystem.documentDirectory ?? ''}files/` };
}

export async function requestStorageAccess(): Promise<FsPermissionInfo> {
  if (Platform.OS === 'web') {
    throw new Error('Storage access requires the native app.');
  }
  if (Platform.OS === 'android' && SAF) {
    const res = await SAF.requestDirectoryPermissionsAsync();
    if (res.granted && res.directoryUri) {
      grantedTreeUri = res.directoryUri;
      const label = decodeURIComponent(res.directoryUri.split('/').pop() ?? 'storage');
      return { tier: 'granted', rootLabel: label || 'storage', treeUri: res.directoryUri };
    }
    // user dismissed the picker — fall back to sandbox
  }
  const dir = `${FileSystem.documentDirectory ?? ''}files/`;
  (await FileSystem.getInfoAsync(dir)).exists || (await FileSystem.makeDirectoryAsync(dir, { intermediates: true }));
  grantedTreeUri = null;
  return { tier: 'sandbox', rootLabel: 'App sandbox', treeUri: undefined };
}

export function revokeStorageAccess(): void {
  grantedTreeUri = null;
}

/* ------------------------------ path helpers ------------------------------- */

/** Normalize + jail-check a relative agent path. Throws on escapes. */
export function safeRelPath(input: string): string {
  const p = String(input ?? '').replace(/^\/+/, '');
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) throw new Error(`Path escapes the sandbox root: ${input}`);
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join('/');
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

/** Resolve a relative path inside the granted tree to a document/directory URI. */
async function safResolve(rel: string, createDirs = false): Promise<string> {
  const root = grantedTreeUri!;
  const segments = rel ? rel.split('/') : [];
  let dirUri = root;
  let consumed = 0;

  // Walk existing directories (cached).
  for (; consumed < segments.length - (createDirs ? 1 : 0); consumed++) {
    const want = segments[consumed];
    const cachedKey = `${dirUri}::${want}`;
    let child = uriCache.get(cachedKey) ?? (await safChild(dirUri, want));
    if (!child) {
      if (!createDirs) throw new Error(`Not found: ${rel}`);
      child = await SAF!.makeDirectoryAsync(dirUri, want);
    }
    uriCache.set(cachedKey, child);
    dirUri = child;
  }
  if (!createDirs && consumed < segments.length) {
    const last = await safChild(dirUri, segments[segments.length - 1]);
    if (!last) throw new Error(`Not found: ${rel}`);
    return last;
  }
  return dirUri;
}

/* --------------------------------- operations ------------------------------ */

const TEXT_EXT = /\.(txt|md|markdown|json|jsonc|js|jsx|ts|tsx|mjs|cjs|css|scss|html|htm|xml|yaml|yml|toml|ini|cfg|conf|env|sh|bash|zsh|py|rb|go|rs|java|kt|kts|c|h|cpp|hpp|cs|php|sql|csv|tsv|log|gitignore|properties|gradle|plist|swift|lock)$/i;

export async function readAgentFile(rel: string, maxSize = 2 * 1024 * 1024): Promise<string> {
  const path = safeRelPath(rel);
  const root = currentRoot();
  if (root.tier === 'granted' && SAF) {
    const uri = await safResolve(path);
    const size = await fileSizeOf(uri).catch(() => 0);
    if (size > maxSize) {
      return `File too large to read fully (${formatKB(size)}; limit ${formatKB(maxSize)}). Read it in ranges or delete sections first.`;
    }
    return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  }
  const uri = `${root.uri}${path}`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error(`File not found: ${path}`);
  if ((info as { size?: number }).size && (info as { size?: number }).size! > maxSize) {
    return `File too large to read fully (${formatKB((info as { size?: number }).size!)}; limit ${formatKB(maxSize)}).`;
  }
  return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

export async function writeAgentFile(rel: string, content: string, maxSize = 1024 * 1024): Promise<string> {
  const path = safeRelPath(rel);
  if (content.length > maxSize) {
    throw new Error(`Content too large (${formatKB(content.length)}; limit ${formatKB(maxSize)}). Write in chunks or reduce size.`);
  }
  const root = currentRoot();
  if (root.tier === 'granted' && SAF) {
    const segs = path.split('/');
    const name = segs.pop()!;
    const dirRel = segs.join('/');
    const dirUri = await safResolve(dirRel, true);
    await SAF.writeFileAsync(dirUri, name, content, FileSystem.EncodingType.UTF8);
    uriCache.clear();
    return `Wrote ${formatKB(content.length)} to ${path}`;
  }
  const uri = `${root.uri}${path}`;
  const dir = uri.slice(0, uri.lastIndexOf('/'));
  (await FileSystem.getInfoAsync(dir)).exists ||
    (await FileSystem.makeDirectoryAsync(dir, { intermediates: true }));
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  return `Wrote ${formatKB(content.length)} to ${path}`;
}

export async function listAgentDir(rel: string): Promise<string> {
  const path = safeRelPath(rel);
  const root = currentRoot();
  if (root.tier === 'granted' && SAF) {
    const uri = path ? await safResolve(path) : root.uri;
    const entries = await SAF.readDirectoryAsync(uri);
    if (entries.length === 0) return `(empty) ${path || '.'}`;
    const lines = entries.map((e) => {
      const n = nameOf(e);
      const isDir = looksLikeDir(e);
      return `${isDir ? 'd' : '-'} ${n}`;
    });
    return `${path || '.'}\n${lines.join('\n')}`;
  }
  const uri = `${root.uri}${path}`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error(`Directory not found: ${path || '.'}`);
  if (!(info as { isDirectory?: boolean }).isDirectory) throw new Error(`Not a directory: ${path}`);
  const items = await FileSystem.readDirectoryAsync(uri);
  if (items.length === 0) return `(empty) ${path || '.'}`;
  return `${path || '.'}\n${items.map((n) => `${TEXT_EXT.test(n) || n.includes('.') ? '-' : 'd'} ${n}`).join('\n')}`;
}

export async function statAgentPath(rel: string): Promise<string> {
  const path = safeRelPath(rel);
  const root = currentRoot();
  if (root.tier === 'granted' && SAF) {
    const uri = await safResolve(path);
    const size = await fileSizeOf(uri).catch(() => 0);
    return `${path}\n  type: ${looksLikeDir(uri) ? 'directory' : 'file'}\n  size: ${formatKB(size)}`;
  }
  const uri = `${root.uri}${path}`;
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
  const path = safeRelPath(rel);
  const root = currentRoot();
  if (root.tier === 'granted' && SAF) {
    await safResolve(path, true);
    uriCache.clear();
    return `Created directory ${path}`;
  }
  await FileSystem.makeDirectoryAsync(`${root.uri}${path}`, { intermediates: true });
  return `Created directory ${path}`;
}

export async function deleteAgentPath(rel: string): Promise<string> {
  const path = safeRelPath(rel);
  if (!path) throw new Error('Refusing to delete the sandbox root.');
  const root = currentRoot();
  if (root.tier === 'granted' && SAF) {
    const uri = await safResolve(path);
    await FileSystem.deleteAsync(uri, { idempotent: true });
    uriCache.clear();
    return `Deleted ${path}`;
  }
  await FileSystem.deleteAsync(`${root.uri}${path}`, { idempotent: true });
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
  // SAF document ids for directories carry the mimeType in the tree; heuristics:
  // directory entries typically do not have an extension.
  const n = nameOf(uri);
  return !/\.[A-Za-z0-9]{1,8}$/.test(n);
}

function formatKB(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/* --------------------------- structured listing ---------------------------- */

export interface AgentEntry {
  name: string;
  isDir: boolean;
  /** Bytes, when the tier can report them cheaply (sandbox tier only). */
  size: number;
}

/**
 * Directory listing as data (rather than pre-formatted text) — used by the repo
 * mapper, which needs to walk the tree itself. Works on both storage tiers.
 */
export async function listAgentEntries(rel: string): Promise<AgentEntry[]> {
  const path = safeRelPath(rel);
  const root = currentRoot();

  if (root.tier === 'granted' && SAF) {
    const uri = path ? await safResolve(path) : root.uri;
    const entries = await SAF.readDirectoryAsync(uri);
    return entries.map((e) => ({ name: nameOf(e), isDir: looksLikeDir(e), size: 0 }));
  }

  const raw = `${root.uri}${path}`;
  const dirUri = raw.endsWith('/') ? raw : `${raw}/`;
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) throw new Error(`Directory not found: ${path || '.'}`);
  if (!(info as { isDirectory?: boolean }).isDirectory) throw new Error(`Not a directory: ${path}`);
  const items = await FileSystem.readDirectoryAsync(dirUri);
  const out: AgentEntry[] = [];
  for (const n of items) {
    const child = await FileSystem.getInfoAsync(`${dirUri}${n}`).catch(() => null);
    out.push({
      name: n,
      isDir: !!(child as { isDirectory?: boolean } | null)?.isDirectory,
      size: (child as { size?: number } | null)?.size ?? 0,
    });
  }
  return out;
}

/** True when the active root can report entry sizes cheaply (sandbox tier). */
export function rootHasSizes(): boolean {
  return currentRoot().tier === 'sandbox';
}
