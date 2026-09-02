/**
 * Artifacts = files the agent produced during a conversation.
 *
 * Derived from tool events (write_file / zip_dir), never stored twice, so the
 * "Files" sheet and the per-message chips always agree with what actually
 * happened. A path that was written twice shows once, with the newest stamp.
 */
import type { ChatMessage } from '@/src/store/chats';

export type ArtifactKind = 'zip' | 'text' | 'binary';

export interface Artifact {
  path: string;
  kind: ArtifactKind;
  ts: number;
  /** 'write_file' | 'zip_dir' */
  source: string;
}

const ZIP_EXT = /\.(zip|apk|jar|aar|tar|gz|tgz|7z|rar)$/i;
const TEXT_EXT =
  /\.(txt|md|markdown|json|jsonc|js|jsx|ts|tsx|mjs|cjs|css|scss|html|htm|xml|yaml|yml|toml|ini|cfg|conf|env|sh|bash|zsh|py|rb|go|rs|java|kt|kts|c|h|cpp|hpp|cs|php|sql|csv|tsv|log|gitignore|properties|gradle|plist|swift|vue|svelte|proto|graphql|lua|dart|ex|exs)$/i;

export function artifactKind(path: string): ArtifactKind {
  if (ZIP_EXT.test(path)) return 'zip';
  return TEXT_EXT.test(path) ? 'text' : 'binary';
}

/** Tapping a zip shares/saves it; text and code open the reader first. */
export function opensInReader(a: Artifact): boolean {
  return a.kind === 'text';
}

export function artifactsFromMessages(messages: ChatMessage[]): Artifact[] {
  const byPath = new Map<string, Artifact>();
  for (const m of messages) {
    for (const ev of m.toolEvents ?? []) {
      if (ev.kind !== 'tool' || !ev.ok || ev.running) continue;
      if (ev.title !== 'write_file' && ev.title !== 'zip_dir') continue;
      const path = (ev.detail ?? '').trim();
      if (!path || path.startsWith('$')) continue;
      byPath.set(path, { path, kind: artifactKind(path), ts: ev.ts, source: ev.title });
    }
  }
  return [...byPath.values()].sort((a, b) => a.ts - b.ts);
}

/** Artifacts introduced by a single message (chips under that bubble). */
export function artifactsOfMessage(message: ChatMessage): Artifact[] {
  const out: Artifact[] = [];
  for (const ev of message.toolEvents ?? []) {
    if (ev.kind !== 'tool' || !ev.ok || ev.running) continue;
    if (ev.title !== 'write_file' && ev.title !== 'zip_dir') continue;
    const path = (ev.detail ?? '').trim();
    if (!path || path.startsWith('$')) continue;
    if (!out.some((a) => a.path === path)) out.push({ path, kind: artifactKind(path), ts: ev.ts, source: ev.title });
  }
  return out;
}

export function fileNameOf(path: string): string {
  return path.split('/').pop() || path;
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i) : '';
}
