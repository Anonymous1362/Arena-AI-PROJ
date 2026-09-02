/**
 * Copper plugins — the honest version of "Acode plugins / Termux pkgs".
 *
 * A React Native bundle is sealed: Hermes has no `eval`, and Android's W^X
 * forbids executing downloaded code, so *runtime code* plugins are impossible
 * on-device (that is not a choice, it is the kernel). What IS possible — and
 * what Acode's useful plugins mostly are — is **data**: new editor/terminal
 * capabilities described declaratively and interpreted by the app.
 *
 * A plugin is a JSON manifest in `<storage root>/.copper/plugins/<id>.json`:
 *
 *   {
 *     "name": "rust-pack",
 *     "description": "Rust keywords + handy aliases",
 *     "aliases": { "ll": "ls -la", "cb": "map src" },
 *     "syntax": { "id": "ron", "keywords": "fn pub struct enum impl trait", "comment": "c" },
 *     "chips": ["map src", "sym run"]
 *   }
 *
 * Interpreted effects: shell aliases, extra syntax-highlight language packs,
 * and terminal quick-chips. The agent (or you, in the terminal) can write new
 * manifests with `plugin create`, so the system is extensible from inside the
 * app without ever executing foreign code.
 */
import { listAgentEntries, readAgentFile, writeAgentFile } from '@/src/agent/fs';
import { registerLanguage } from '@/src/utils/highlight';

export interface PluginSyntax {
  id: string;
  keywords: string;
  comment?: 'c' | 'hash' | 'none';
}

export interface PluginManifest {
  name: string;
  description?: string;
  aliases?: Record<string, string>;
  syntax?: PluginSyntax;
  chips?: string[];
}

interface Loaded {
  id: string;
  manifest: PluginManifest;
}

const DIR = '.copper/plugins';
let cache: Loaded[] | null = null;
let disabled: Set<string> = new Set();

export function pluginDir(): string {
  return DIR;
}

/** Reads every manifest. Silent on malformed files — a broken plugin is inert. */
export async function loadPlugins(force = false): Promise<Loaded[]> {
  if (cache && !force) return cache;
  const out: Loaded[] = [];
  try {
    const entries = await listAgentEntries(DIR);
    for (const e of entries) {
      if (e.isDir || !e.name.endsWith('.json')) continue;
      try {
        const raw = await readAgentFile(`${DIR}/${e.name}`, 128 * 1024);
        const manifest = JSON.parse(raw) as PluginManifest;
        if (!manifest?.name) continue;
        out.push({ id: e.name.replace(/\.json$/, ''), manifest });
      } catch {
        /* inert */
      }
    }
  } catch {
    /* no plugins dir yet — fine */
  }
  try {
    const raw = await readAgentFile('.copper/disabled.json', 8 * 1024);
    disabled = new Set((JSON.parse(raw) as string[]) ?? []);
  } catch {
    disabled = new Set();
  }
  cache = out;
  // Side-effect: syntax packs become highlighter languages immediately.
  for (const p of out) {
    if (disabled.has(p.id)) continue;
    const syn = p.manifest.syntax;
    if (syn?.id) registerLanguage(syn.id, { keywords: syn.keywords ?? '', comment: syn.comment ?? 'c' });
  }
  return out;
}

export function activePlugins(list: Loaded[]): Loaded[] {
  return list.filter((p) => !disabled.has(p.id));
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  await writeAgentFile('.copper/disabled.json', JSON.stringify([...disabled]));
  cache = null;
}

/** Shell alias expansion (first word), depth-guarded against alias loops. */
export function expandAlias(command: string, list: Loaded[], depth = 0): string {
  if (depth > 3) return command;
  const first = command.trim().split(/\s+/)[0];
  for (const p of activePlugins(list)) {
    const hit = p.manifest.aliases?.[first];
    if (hit) {
      const rest = command.trim().slice(first.length);
      return expandAlias(`${hit}${rest}`, list, depth + 1);
    }
  }
  return command;
}

export function pluginChips(list: Loaded[]): string[] {
  const out: string[] = [];
  for (const p of activePlugins(list)) for (const c of p.manifest.chips ?? []) if (!out.includes(c)) out.push(c);
  return out.slice(0, 6);
}

/** Starter manifest, written by `plugin create <name>`. */
export function starterManifest(name: string): string {
  return JSON.stringify(
    {
      name,
      description: 'Created by Copper — edit me',
      aliases: { ll: 'ls -la' },
      syntax: { id: name.toLowerCase().replace(/[^a-z0-9]/g, ''), keywords: 'fn let const', comment: 'c' },
      chips: ['map .'],
    },
    null,
    2
  );
}
