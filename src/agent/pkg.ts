/**
 * `pkg` — a package manager for the built-in shell.
 *
 * The Termux fantasy is `pkg install python`: download a toolchain, run it.
 * Android's W^X kills that for a normal app — downloaded *binaries* cannot
 * execute, period. What a package manager CAN honestly do here is install
 * **pure-JS tools interpreted by this app** plus language packs (plugins),
 * persisted in the sandbox and hot-registered into the shell.
 *
 * So: `pkg install jq bc seq tr cut rev` adds real, working commands to the
 * terminal and to the agent's run_command. `pkg list` shows the registry with
 * installed state. Nothing is downloaded; "install" means "switch on code that
 * already ships in the bundle" — which is also why it is instant and offline.
 */
import { readAgentFile, writeAgentFile } from '@/src/agent/fs';

export interface PkgContext {
  cwd: string;
  read: (rel: string) => Promise<string>;
}

export interface PkgTool {
  id: string;
  summary: string;
  usage: string;
  run: (args: string[], ctx: PkgContext) => Promise<string>;
}

/* --------------------------------- tools ---------------------------------- */

function readOperand(arg: string | undefined, ctx: PkgContext): Promise<string> {
  if (!arg) throw new Error('missing file operand');
  return ctx.read(arg);
}

/** JSON querier: `.`, `.a.b`, `.a[0]`, `.length`, `.keys`, plus `-r`. */
const jq: PkgTool = {
  id: 'jq',
  summary: 'JSON querier (paths, indexes, .length, .keys)',
  usage: 'jq \'.user.name\' file.json',
  run: async (args, ctx) => {
    const raw = args.filter((a) => a.startsWith('-'));
    const rest = args.filter((a) => !a.startsWith('-'));
    const query = rest[0] ?? '.';
    const text = await readOperand(rest[1], ctx);
    let value: unknown = JSON.parse(text);
    const tokens = query.match(/(?:\.[A-Za-z_][\w-]*|\[\d+\]|\.length|\.keys|\.\.)/g) ?? [];
    if (query !== '.' && !tokens.join('')?.startsWith('.')) throw new Error(`jq: unsupported query "${query}"`);
    for (const t of tokens) {
      if (t === '.') continue;
      if (t === '.length') {
        if (Array.isArray(value)) value = value.length;
        else if (typeof value === 'string') value = value.length;
        else if (value && typeof value === 'object') value = Object.keys(value).length;
        else throw new Error('jq: .length on a scalar');
        continue;
      }
      if (t === '.keys') {
        if (!value || typeof value !== 'object') throw new Error('jq: .keys on a non-object');
        value = Object.keys(value as object);
        continue;
      }
      const idx = /^\[(\d+)\]$/.exec(t);
      if (idx) {
        if (!Array.isArray(value)) throw new Error('jq: index on a non-array');
        value = value[Number(idx[1])];
        continue;
      }
      const key = t.slice(1);
      if (!value || typeof value !== 'object') throw new Error(`jq: cannot read .${key} of a scalar`);
      value = (value as Record<string, unknown>)[key];
    }
    const pretty = (v: unknown) =>
      typeof v === 'string' && raw.includes('-r') ? v : JSON.stringify(v, null, 2) ?? 'null';
    return pretty(value);
  },
};

/** Calculator: + - * / % ^ with parentheses and unary minus. */
const bc: PkgTool = {
  id: 'bc',
  summary: 'expression calculator (+ - * / % ^, parens)',
  usage: 'bc "2 + 3 * (4 ^ 2)"',
  run: async (args) => {
    const expr = args.join(' ').replace(/\s+/g, '');
    if (!expr) throw new Error('bc: missing expression');
    let i = 0;
    const peek = () => expr[i];
    const parseExpr = (): number => {
      let v = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = expr[i++];
        const r = parseTerm();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    };
    const parseTerm = (): number => {
      let v = parseUnary();
      while (peek() === '*' || peek() === '/' || peek() === '%') {
        const op = expr[i++];
        const r = parseUnary();
        v = op === '*' ? v * r : op === '/' ? v / r : v % r;
      }
      return v;
    };
    const parseUnary = (): number => {
      if (peek() === '-') {
        i++;
        return -parseUnary();
      }
      if (peek() === '+') {
        i++;
        return parseUnary();
      }
      return parsePow();
    };
    const parsePow = (): number => {
      const base = parseAtom();
      if (peek() === '^') {
        i++;
        return Math.pow(base, parseUnary());
      }
      return base;
    };
    const parseAtom = (): number => {
      if (peek() === '(') {
        i++;
        const v = parseExpr();
        if (peek() !== ')') throw new Error('bc: missing )');
        i++;
        return v;
      }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(expr.slice(i));
      if (!m) throw new Error(`bc: unexpected "${expr.slice(i, i + 6)}"`);
      i += m[0].length;
      return Number(m[0]);
    };
    const out = parseExpr();
    if (i < expr.length) throw new Error(`bc: trailing "${expr.slice(i)}"`);
    return String(Number(out.toFixed(10)));
  },
};

const seq: PkgTool = {
  id: 'seq',
  summary: 'print a numeric sequence',
  usage: 'seq 1 2 10',
  run: async (args) => {
    const n = args.map(Number);
    if (n.some((x) => Number.isNaN(x)) || !n.length) throw new Error('seq: numeric arguments required');
    // GNU order: seq LAST | seq FIRST LAST | seq FIRST INCREMENT LAST
    const [from, to, step] =
      n.length === 1 ? [1, n[0], 1] : n.length === 2 ? [n[0], n[1], 1] : [n[0], n[2], n[1]];
    if (step === 0) throw new Error('seq: zero step');
    const out: string[] = [];
    for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
      out.push(String(v));
      if (out.length > 10_000) break;
    }
    return out.join('\n');
  },
};

const tr: PkgTool = {
  id: 'tr',
  summary: 'translate characters in a file',
  usage: 'tr abc XYZ file.txt',
  run: async (args, ctx) => {
    const [a, b, file] = args;
    if (a == null || b == null) throw new Error('tr: needs SET1 SET2 file');
    const text = await readOperand(file, ctx);
    const map = new Map<string, string>();
    for (let i = 0; i < a.length; i++) map.set(a[i], b[Math.min(i, b.length - 1)] ?? '');
    return text
      .split('')
      .map((ch) => (map.has(ch) ? map.get(ch) : ch))
      .join('');
  },
};

const cut: PkgTool = {
  id: 'cut',
  summary: 'cut columns by delimiter (-d, -f)',
  usage: 'cut -d , -f 2 data.csv',
  run: async (args, ctx) => {
    let delim = '\t';
    let fields = '1';
    const rest: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-d') delim = args[++i] ?? '\t';
      else if (args[i] === '-f') fields = args[++i] ?? '1';
      else if (args[i].startsWith('-d')) delim = args[i].slice(2);
      else if (args[i].startsWith('-f')) fields = args[i].slice(2);
      else rest.push(args[i]);
    }
    const wanted = fields.split(',').map((f) => Number(f) - 1);
    const text = await readOperand(rest[0], ctx);
    return text
      .split('\n')
      .map((line) => wanted.map((w) => line.split(delim)[w] ?? '').join(delim))
      .join('\n');
  },
};

const rev: PkgTool = {
  id: 'rev',
  summary: 'reverse each line of a file',
  usage: 'rev file.txt',
  run: async (args, ctx) => {
    const text = await readOperand(args[0], ctx);
    return text
      .split('\n')
      .map((l) => [...l].reverse().join(''))
      .join('\n');
  },
};

const nl: PkgTool = {
  id: 'nl',
  summary: 'number the lines of a file',
  usage: 'nl file.ts',
  run: async (args, ctx) => {
    const text = await readOperand(args[0], ctx);
    return text
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(6)}\t${l}`)
      .join('\n');
  },
};

/* -------------------------------- registry --------------------------------- */

export const PKG_REGISTRY: PkgTool[] = [jq, bc, seq, tr, cut, rev, nl];

const STATE = '.copper/pkg.json';
let installedCache: string[] | null = null;

export async function installedPackages(force = false): Promise<string[]> {
  if (installedCache && !force) return installedCache;
  try {
    const raw = await readAgentFile(STATE, 8 * 1024);
    installedCache = (JSON.parse(raw) as { installed?: string[] }).installed ?? [];
  } catch {
    installedCache = [];
  }
  return installedCache;
}

async function persist(list: string[]): Promise<void> {
  installedCache = list;
  await writeAgentFile(STATE, JSON.stringify({ installed: list }, null, 2));
}

export async function pkgInstall(ids: string[]): Promise<string> {
  const have = await installedPackages();
  const added: string[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    if (!PKG_REGISTRY.some((t) => t.id === id)) {
      unknown.push(id);
      continue;
    }
    if (!have.includes(id)) added.push(id);
  }
  if (added.length) await persist([...have, ...added]);
  const lines = [
    added.length ? `installed: ${added.join(', ')} (bundled, instant, offline)` : 'nothing new installed',
    unknown.length ? `unknown package(s): ${unknown.join(', ')} — registry: ${PKG_REGISTRY.map((t) => t.id).join(', ')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

export async function pkgRemove(ids: string[]): Promise<string> {
  const have = await installedPackages();
  const left = have.filter((h) => !ids.includes(h));
  await persist(left);
  return `removed: ${have.filter((h) => ids.includes(h)).join(', ') || 'nothing'}`;
}

export async function pkgList(): Promise<string> {
  const have = await installedPackages();
  return PKG_REGISTRY.map(
    (t) => `${have.includes(t.id) ? '[x]' : '[ ]'} ${t.id.padEnd(5)} ${t.summary}\n        ${t.usage}`
  ).join('\n');
}

/** Looks up an installed package command; null when not installed. */
export async function pkgCommand(cmd: string): Promise<PkgTool | null> {
  const have = await installedPackages();
  if (!have.includes(cmd)) return null;
  return PKG_REGISTRY.find((t) => t.id === cmd) ?? null;
}
