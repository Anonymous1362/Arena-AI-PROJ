/**
 * Repo map — the "what is in this project?" view an agent needs before it
 * starts editing.
 *
 * Aider and OpenCode build theirs with tree-sitter. tree-sitter is a native C
 * parser: on a phone that means a compiled module per language, tens of
 * megabytes of grammar blobs, and a build step the user can't run from Expo Go.
 * Copper is deliberately install-free, so this is a **regex outline** instead:
 * one pass over the files, per-language patterns for the declarations that
 * matter (functions, classes, types, headings, top-level keys), emitted as a
 * compact, line-numbered map.
 *
 * The trade is stated plainly to the model in the header so it never mistakes
 * the outline for a semantic index: it shows *where things live*, not call
 * graphs or types. In practice that is the part an agent actually needs to pick
 * the right file to open, and it costs ~0 dependencies and a few milliseconds.
 *
 * Symbol extraction itself lives in `./outline.ts` (pure, no RN imports).
 */
import { listAgentEntries, readAgentFile, currentRoot } from '@/src/agent/fs';
import { langOf } from '@/src/agent/outline';
import { outlineFor, importGraph } from '@/src/agent/symindex';

/* --------------------------------- options --------------------------------- */

export interface RepoMapOptions {
  /** Relative subtree to map (default "." = whole root). */
  root?: string;
  /** Cap on files outlined. */
  maxFiles?: number;
  /** Cap on the returned text (the agent's context is finite). */
  maxChars?: number;
  /** Case-insensitive substring filter on paths (e.g. "agent", ".ts"). */
  filter?: string;
  /** Include the directory tree section. */
  tree?: boolean;
  /** Append the relative-import graph (JS/TS) for the subtree. */
  graph?: boolean;
}

export interface RepoMapResult {
  output: string;
  files: number;
  dirs: number;
  bytes: number;
  symbols: number;
  truncated: boolean;
}

/* -------------------------------- constants -------------------------------- */

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.expo', '.cache', '.gradle', '.idea', '.vscode',
  '__pycache__', '.venv', 'venv', 'env', 'coverage', '.turbo', '.parcel-cache',
  'Pods', '.terraform', 'vendor', '.mypy_cache', '.pytest_cache', '.ruff_cache',
  '.svelte-kit', '.output', '.vite', 'DerivedData',
]);

const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'Podfile.lock', 'poetry.lock', 'composer.lock']);

const MAX_DEPTH = 9;
const DEFAULT_MAX_FILES = 300;
const DEFAULT_MAX_CHARS = 12_000;
const MAX_BYTES_PER_FILE = 128 * 1024;
const READ_CONCURRENCY = 6;

/** Extensions worth reading for an outline. Anything else is listed by name only. */
const MAPPABLE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|swift|c|h|cc|cpp|hpp|cs|rb|php|sh|bash|zsh|sql|md|markdown|json|ya?ml|toml|ini|env|css|scss|html|vue|svelte|gradle|plist|proto|graphql|gql|lua|r|dart|ex|exs|zig|nim)$/i;

/* --------------------------------- walking --------------------------------- */

interface FoundFile {
  path: string;
  size: number;
}

interface WalkResult {
  files: FoundFile[];
  dirs: string[];
  skipped: number;
}

async function walk(root: string, maxFiles: number, filter: string | undefined): Promise<WalkResult> {
  const files: FoundFile[] = [];
  const dirs: string[] = [];
  let skipped = 0;
  let stopped = false;

  const visit = async (rel: string, depth: number): Promise<void> => {
    if (stopped || depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await listAgentEntries(rel);
    } catch {
      return;
    }
    // Directories first so the map reads top-down like a real tree walk.
    const sorted = [...entries].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    for (const e of sorted) {
      if (stopped) return;
      const child = rel === '.' || rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDir) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) {
          skipped++;
          continue;
        }
        dirs.push(child);
        await visit(child, depth + 1);
        continue;
      }
      if (SKIP_FILES.has(e.name)) {
        skipped++;
        continue;
      }
      if (filter && !child.toLowerCase().includes(filter.toLowerCase())) {
        skipped++;
        continue;
      }
      if (files.length >= maxFiles) {
        stopped = true;
        skipped++;
        return;
      }
      files.push({ path: child, size: e.size });
    }
  };

  await visit(root || '.', 1);
  return { files, dirs, skipped };
}

/* ---------------------------------- public --------------------------------- */

/**
 * Builds the outline text. Always resolves — an unreadable root yields an
 * explanatory message rather than a thrown tool error, because the agent can
 * usually recover by narrowing `root` or granting storage access.
 */
export async function buildRepoMap(opts: RepoMapOptions = {}): Promise<RepoMapResult> {
  const root = (opts.root ?? '.').replace(/^\/+/, '') || '.';
  const maxFiles = Math.min(1000, Math.max(10, opts.maxFiles ?? DEFAULT_MAX_FILES));
  const maxChars = Math.min(40_000, Math.max(1500, opts.maxChars ?? DEFAULT_MAX_CHARS));
  const filter = opts.filter?.trim() || undefined;
  const showTree = opts.tree !== false;

  const tier = currentRoot().tier;
  let found: WalkResult;
  try {
    found = await walk(root, maxFiles, filter);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      output: `Could not map "${root}": ${msg}\n\nStorage tier: ${tier}. Try repo_map with root "." or a smaller subtree.`,
      files: 0,
      dirs: 0,
      bytes: 0,
      symbols: 0,
      truncated: false,
    };
  }

  const totalBytes = found.files.reduce((n, f) => n + f.size, 0);
  const head: string[] = [];
  head.push(`REPO MAP — ${root === '.' ? '(storage root)' : root}`);
  head.push(
    `tier: ${tier === 'granted' ? 'user-granted folder' : 'app sandbox'} · files: ${found.files.length}${
      found.skipped ? ` (+${found.skipped} skipped: ignored dirs, lockfiles${filter ? ', non-matching' : ''})` : ''
    } · dirs: ${found.dirs.length}${totalBytes ? ` · ${Math.round(totalBytes / 1024)} KB scanned` : ''}`
  );
  head.push('outline: regex declarations, not a semantic index — line numbers are 1-based; open a file to read it.');
  head.push('');

  const body: string[] = [];
  if (showTree && found.dirs.length) {
    body.push('directories:');
    for (const d of found.dirs.slice(0, 120)) {
      const depth = d.split('/').length - (root === '.' ? 0 : root.split('/').length);
      body.push(`${'  '.repeat(Math.max(0, Math.min(6, depth)))}${d.split('/').pop()}/`);
    }
    if (found.dirs.length > 120) body.push(`  … +${found.dirs.length - 120} more`);
    body.push('');
  }

  if (!found.files.length) {
    body.push(`No mappable files under "${root}".`);
    body.push('Use list_dir to inspect, or grant storage access in Settings → Shell & sandbox if the project lives outside the app sandbox.');
  }

  // Read + outline in small parallel batches: SAF round-trips dominate cost.
  let symbols = 0;
  let listed = 0;
  let truncated = false;

  for (let i = 0; i < found.files.length; i += READ_CONCURRENCY) {
    const batch = found.files.slice(i, i + READ_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (f) => {
        const lang = langOf(f.path);
        const lines = ` ${f.size ? `${Math.round(f.size / 1024)}KB` : ''}`;
        if (!MAPPABLE.test(f.path) || f.size > MAX_BYTES_PER_FILE) {
          return `· ${f.path}${lines} (${lang === 'other' ? 'binary/asset' : 'too large to outline'})`;
        }
        try {
          const text = await readAgentFile(f.path, MAX_BYTES_PER_FILE);
          if (text.startsWith('File too large')) return `· ${f.path}${lines} (too large)`;
          // Cached: a second map of an unchanged project skips parsing entirely.
          const entry = outlineFor(f.path, text, f.size);
          const hits = entry.hits;
          symbols += hits.length;
          const lineCount = entry.lines;
          if (!hits.length) return `· ${f.path} — ${lang}, ${lineCount} lines`;
          const rendered = hits.map((h) => (lang === 'json' ? `      ${h.text}` : `    ${String(h.line).padStart(4, ' ')}  ${h.text}`));
          return `· ${f.path} — ${lang}, ${lineCount} lines\n${rendered.join('\n')}`;
        } catch (e) {
          return `· ${f.path} — unreadable (${e instanceof Error ? e.message : 'error'})`;
        }
      })
    );
    for (const r of results) {
      if (body.join('\n').length + r.length > maxChars) {
        truncated = true;
        break;
      }
      body.push(r);
      listed++;
    }
    if (truncated) break;
  }

  if (truncated) {
    body.push(`… truncated at ${maxChars} chars — ${found.files.length - listed} file(s) not shown.`);
    body.push('Narrow with `root` (a subtree) or `filter` (path substring), or raise `max_chars`.');
  }

  if (opts.graph) {
    const edges = await importGraph(root, 150);
    if (edges.length) {
      body.push('');
      body.push('imports (relative, JS/TS):');
      for (const e of edges.slice(0, 80)) body.push(`  ${e}`);
      if (edges.length > 80) body.push(`  … +${edges.length - 80} more`);
    }
  }

  const output = `${head.join('\n')}${body.join('\n')}`;
  return { output, files: listed, dirs: found.dirs.length, bytes: totalBytes, symbols, truncated };
}
