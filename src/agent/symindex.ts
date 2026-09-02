/**
 * Symbol index — the cached, graph-aware layer over `outline.ts`.
 *
 * Three jobs:
 *  1. **Cache** outlines by a cheap fingerprint (size + length + head/tail
 *     hash) so a second `repo_map` / `sym` over an unchanged project is free.
 *     This is the incremental-repo-map item from the upgrade list: walking the
 *     tree still costs SAF round-trips, but parsing never repeats.
 *  2. **Import graph** for JS/TS: who imports whom, resolved relative to the
 *     file, so the agent can see structure beyond a file list.
 *  3. **Symbol search** (`sym <query>`): grep that only looks at declarations,
 *     i.e. "where is `runAgentTurn` defined?" without reading 300 files.
 */
import { outline, langOf, type SymbolHit } from '@/src/agent/outline';
import { listAgentEntries, readAgentFile } from '@/src/agent/fs';

export interface OutlineEntry {
  hits: SymbolHit[];
  lines: number;
  imports: string[];
}

interface CacheEntry extends OutlineEntry {
  sig: string;
}

const cache = new Map<string, CacheEntry>();

function sigOf(text: string): string {
  let h = 5381;
  const head = text.slice(0, 96);
  const tail = text.slice(-48);
  const s = `${text.length}:${head}:${tail}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${text.length}:${h}`;
}

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"\n]+)['"]/g;

function importsFor(lang: string, text: string): string[] {
  if (!/^(ts|js|tsx|jsx|typescript|javascript|mjs|cjs)$/i.test(lang)) return [];
  const out: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (spec.startsWith('.')) out.push(spec);
  }
  return [...new Set(out)];
}

/** Outline with cache. `size` is only used by callers that already have it. */
export function outlineFor(path: string, text: string, _size = 0): OutlineEntry {
  const sig = sigOf(text);
  const hit = cache.get(path);
  if (hit && hit.sig === sig) return hit;
  const lang = langOf(path);
  const entry: CacheEntry = {
    sig,
    hits: outline(lang, text),
    lines: text.split('\n').length,
    imports: importsFor(lang, text),
  };
  cache.set(path, entry);
  return entry;
}

export function indexStats(): { files: number } {
  return { files: cache.size };
}

/* --------------------------------- walking --------------------------------- */

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.expo', '__pycache__', '.venv', 'coverage', 'target', '.gradle', 'Pods']);

async function walkFiles(root: string, max: number): Promise<string[]> {
  const out: string[] = [];
  const visit = async (rel: string, depth: number): Promise<void> => {
    if (depth > 7 || out.length >= max) return;
    let entries;
    try {
      entries = await listAgentEntries(rel);
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= max) return;
      const child = rel === '.' || rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDir) {
        if (!SKIP.has(e.name) && !e.name.startsWith('.')) await visit(child, depth + 1);
      } else {
        out.push(child);
      }
    }
  };
  await visit(root || '.', 1);
  return out;
}

/* --------------------------------- queries --------------------------------- */

export interface SymHit {
  path: string;
  line: number;
  name: string;
}

/** Declaration-only search across a subtree (cached per file). */
export async function searchSymbols(root: string, query: string, maxFiles = 400): Promise<SymHit[]> {
  const q = query.toLowerCase();
  const files = await walkFiles(root, maxFiles);
  const hits: SymHit[] = [];
  for (const f of files) {
    try {
      const text = await readAgentFile(f, 256 * 1024);
      if (text.startsWith('File too large')) continue;
      for (const h of outlineFor(f, text).hits) {
        if (h.text.toLowerCase().includes(q)) hits.push({ path: f, line: h.line, name: h.text });
        if (hits.length >= 120) return hits;
      }
    } catch {
      /* skip */
    }
  }
  return hits;
}

/** Relative-import edges inside a subtree, e.g. `agent/loop.ts -> agent/tools`. */
export async function importGraph(root: string, maxFiles = 400): Promise<string[]> {
  const files = await walkFiles(root, maxFiles);
  const edges: string[] = [];
  const norm = (from: string, spec: string): string => {
    const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
    const parts = `${dir}/${spec.replace(/^\.\//, '')}`.split('/');
    const stack: string[] = [];
    for (const p of parts) {
      if (p === '..') stack.pop();
      else if (p && p !== '.') stack.push(p);
    }
    return stack.join('/');
  };
  for (const f of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)) continue;
    try {
      const text = await readAgentFile(f, 256 * 1024);
      if (text.startsWith('File too large')) continue;
      for (const spec of outlineFor(f, text).imports) {
        edges.push(`${f} -> ${norm(f, spec)}`);
        if (edges.length >= 250) return edges;
      }
    } catch {
      /* skip */
    }
  }
  return edges;
}
