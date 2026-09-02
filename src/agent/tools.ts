/**
 * Agent tool registry.
 *
 * The model calls these through the OpenAI `tools` protocol. Every call runs
 * inside the sandbox configured by the user (see fs.ts + settings.agentScope):
 *  - `read_file` / `write_file` / `list_dir` / `delete_path` / `mkdir` / `stat`
 *    operate on the jailed storage root (app sandbox or user-granted tree).
 *  - `run_command` executes a shell command when a real executor is available
 *    (Android + SUMKeep-style exec grant); otherwise it runs a pure-JS
 *    simulated shell (ls / cat / echo / head / tail / wc / grep / touch /
 *    mkdir / rm / pwd) that still produces honest, useful transcript output.
 */
import { Platform } from 'react-native';
import { useSettingsStore } from '@/src/store/settings';
import { GITHUB_TOOL_SPECS, GITHUB_TOOL_NAMES, dispatchGithubTool } from '@/src/agent/github';
import { buildRepoMap } from '@/src/agent/repomap';
import {
  readAgentFile,
  writeAgentFile,
  listAgentDir,
  deleteAgentPath,
  mkdirAgent,
  statAgentPath,
  currentRoot,
  safeRelPath,
} from '@/src/agent/fs';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ToolParam {
  type: 'string' | 'number' | 'boolean' | 'object';
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface ToolSpec {
  name: string;
  description: string;
  params: Record<string, ToolParam>;
  required: string[];
  danger?: 'low' | 'medium';
}

export interface ToolContext {
  /** wall-clock deadline for run_command */
  defaultTimeoutMs?: number;
  /** working directory for run_command (defaults to the shared shell cwd) */
  cwd?: string;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

/* ------------------------------ tool schemas ------------------------------- */

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'read_file',
    description: 'Read a text file from the sandboxed storage root. Paths are relative (e.g. "notes/todo.md").',
    params: { path: { type: 'string', description: 'Relative file path' } },
    required: ['path'],
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a text file in the sandboxed storage root. Parent folders are created automatically.',
    params: {
      path: { type: 'string', description: 'Relative file path' },
      content: { type: 'string', description: 'Full file content (UTF-8 text, ≤1 MB)' },
    },
    required: ['path', 'content'],
  },
  {
    name: 'list_dir',
    description: 'List a directory in the sandboxed storage root.',
    params: { path: { type: 'string', description: 'Relative directory path ("." for root)' } },
    required: ['path'],
  },
  {
    name: 'mkdir',
    description: 'Create a directory (and parents) in the sandboxed storage root.',
    params: { path: { type: 'string', description: 'Relative directory path' } },
    required: ['path'],
  },
  {
    name: 'delete_path',
    description: 'Delete a file or directory (recursive) inside the sandboxed storage root.',
    params: { path: { type: 'string', description: 'Relative path to delete' } },
    required: ['path'],
    danger: 'medium',
  },
  {
    name: 'stat',
    description: 'Get type, size and modified time of a file or directory.',
    params: { path: { type: 'string', description: 'Relative path' } },
    required: ['path'],
  },
  {
    name: 'repo_map',
    description:
      'Outline the project in the storage root: directory tree plus each file\'s declared functions, classes, types and headings with 1-based line numbers. Call this FIRST when you have not seen the project — one call beats reading a dozen files. It is a regex outline (where things live), not a semantic index; open a file to read its body.',
    params: {
      root: { type: 'string', description: 'Subtree to map ("." for the whole root)' },
      filter: { type: 'string', description: 'Only include paths containing this substring (e.g. "agent", ".ts")' },
      max_files: { type: 'number', description: 'Cap on files outlined (default 300, max 1000)' },
      max_chars: { type: 'number', description: 'Cap on output characters (default 12000)' },
    },
    required: [],
  },
  {
    name: 'run_command',
    description:
      'Run a shell command inside the app sandbox (cwd = storage root). Real shell when an executor is available; otherwise a built-in shell emulation for common commands (ls, cat, echo, head, tail, wc, grep, touch, mkdir, rm, pwd). Timeout applies.',
    params: {
      command: { type: 'string', description: 'The shell command to run' },
      timeout_seconds: { type: 'number', description: 'Timeout in seconds (default 20, max 60)' },
    },
    required: ['command'],
  },
];

/** Every tool spec available right now (storage tools + GitHub when connected). */
export function allToolSpecs(): ToolSpec[] {
  const s = useSettingsStore.getState();
  const gh = s.agentScope.githubTools && (s.github?.token ?? '').trim().length > 8;
  return gh ? [...TOOL_SPECS, ...GITHUB_TOOL_SPECS] : TOOL_SPECS;
}

/** OpenAI-format `tools` array for chat.completions. */
export function openAITools(): any[] {
  return allToolSpecs().map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(t.params).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
        required: t.required,
      },
    },
  }));
}

/* ------------------------------- dispatching ------------------------------- */

export async function dispatchTool(
  name: string,
  argsJson: string,
  ctx: ToolContext = {}
): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return { ok: false, output: `Invalid JSON arguments for ${name}.` };
  }
  if (GITHUB_TOOL_NAMES.has(name)) return dispatchGithubTool(name, args);

  try {
    switch (name) {
      case 'read_file':
        return { ok: true, output: await readAgentFile(String(args.path ?? '')) };
      case 'write_file':
        return { ok: true, output: await writeAgentFile(String(args.path ?? ''), String(args.content ?? '')) };
      case 'list_dir':
        return { ok: true, output: await listAgentDir(String(args.path ?? '.')) };
      case 'mkdir':
        return { ok: true, output: await mkdirAgent(String(args.path ?? '')) };
      case 'delete_path':
        return { ok: true, output: await deleteAgentPath(String(args.path ?? '')) };
      case 'stat':
        return { ok: true, output: await statAgentPath(String(args.path ?? '')) };
      case 'repo_map': {
        const map = await buildRepoMap({
          root: args.root != null && String(args.root).trim() ? String(args.root) : '.',
          filter: args.filter ? String(args.filter) : undefined,
          maxFiles: args.max_files != null ? Number(args.max_files) : undefined,
          maxChars: args.max_chars != null ? Number(args.max_chars) : undefined,
        });
        return { ok: true, output: map.output };
      }
      case 'run_command': {
        const secs = Math.min(120, Math.max(1, Number(args.timeout_seconds ?? 20)));
        return await runCommand(String(args.command ?? ''), secs * 1000, ctx.cwd ?? shellCwd());
      }
      default:
        return { ok: false, output: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------ run_command ------------------------------- */

/**
 * Real executor detection. Devices with an exec-capable grant (e.g. the
 * SUMKeep/EXTIRPERSS pattern) expose a native executor module in the JS
 * context; we probe for it lazily and never assume.
 */
export type ExecutorMode = 'native' | 'builtin';

export function executorStatus(): ExecutorMode {
  return nativeExecutor() ? 'native' : 'builtin';
}

function nativeExecutor(): ((cmd: string, timeoutMs: number) => Promise<{ stdout: string; exit: number }>) | null {
  if (Platform.OS !== 'android') return null;
  const g = globalThis as any;
  const exec =
    g.CopperExec?.exec ??
    g.expo?.modules?.CopperExec?.exec ??
    // Legacy bridge name retained so existing development builds keep working.
    g.AuroraExec?.exec ??
    g.expo?.modules?.AuroraExec?.exec ??
    g.expo?.modules?.ExpoFileSystem?.exec ??
    null;
  if (typeof exec !== 'function') return null;
  return (cmd: string, timeoutMs: number) =>
    exec(cmd, timeoutMs).then((r: any) => ({ stdout: String(r?.stdout ?? r ?? ''), exit: Number(r?.exit ?? r?.code ?? 0) }));
}

/* --------------------------------- shell cwd -------------------------------- */

/**
 * The shell's working directory, relative to the jailed storage root. Shared by
 * the agent's `run_command` tool and the interactive Terminal tab so `cd` in
 * one place is visible in the other.
 */
let cwdState = '.';

export function shellCwd(): string {
  return cwdState;
}

export function setShellCwd(dir: string): void {
  cwdState = normalizeRel(dir || '.');
}

function normalizeRel(p: string): string {
  const parts: string[] = [];
  for (const seg of String(p ?? '').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.length ? parts.join('/') : '.';
}

/** Resolve a possibly-relative path against the shell cwd. */
export function resolveFromCwd(p: string, cwd: string = cwdState): string {
  const raw = String(p ?? '').trim().replace(/^["']|["']$/g, '');
  if (!raw || raw === '.') return cwd === '.' ? '.' : cwd;
  if (raw === '~') return '.';
  const base = raw.startsWith('/') ? '' : cwd === '.' ? '' : `${cwd}/`;
  return normalizeRel(`${base}${raw.replace(/^\//, '')}`) || '.';
}

/* ------------------------------- run_command -------------------------------- */

/**
 * Public shell entrypoint — used by both the agent's `run_command` tool and the
 * interactive Terminal tab so they share one executor, one sandbox and one cwd.
 *
 * Returns `{ ok, output, exit }`; `output` is the combined stdout/stderr text.
 */
export async function runShellCommand(
  command: string,
  timeoutMs = 20_000,
  cwd: string = cwdState
): Promise<ToolResult & { exit: number }> {
  const res = await runCommand(command, timeoutMs, cwd);
  return { ...res, exit: res.ok ? 0 : 1 };
}

/** Command names the built-in shell understands — used for tab completion. */
export const SHELL_BUILTINS = [
  'ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'wc', 'echo', 'grep', 'touch',
  'mkdir', 'rm', 'mv', 'cp', 'find', 'tree', 'date', 'whoami', 'uname', 'env',
  'clear', 'history', 'help', 'write', 'stat', 'du', 'basename', 'dirname',
  'true', 'false', 'which', 'map', 'sort', 'uniq',
] as const;

async function runCommand(command: string, timeoutMs: number, cwd: string = cwdState): Promise<ToolResult> {
  const real = nativeExecutor();
  if (real) {
    const dir = resolveFromCwd('.', cwd);
    try {
      const withCd = dir && dir !== '.' ? `cd "${dir}" 2>/dev/null || cd "$(pwd)"; ${command}; echo "__EXIT:$?"` : `${command}; echo "__EXIT:$?"`;
      const r = await Promise.race([
        real(withCd, timeoutMs),
        new Promise<{ stdout: string; exit: number }>((_, rej) =>
          setTimeout(() => rej(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs + 1500)
        ),
      ]);
      const out = String(r.stdout ?? '').replace(/__EXIT:(\d+)\s*$/, '');
      const exit = Number(/__EXIT:(\d+)/.exec(String(r.stdout ?? ''))?.[1] ?? r.exit ?? 0);
      return {
        ok: exit === 0,
        output: out.length > 32_000 ? `${out.slice(0, 16_000)}\n…[truncated]…\n${out.slice(-16_000)}` : out,
      };
    } catch (e) {
      return { ok: false, output: `Command failed: ${(e as Error).message}` };
    }
  }
  // Built-in tier — honest about what it is, still useful.
  return simulateShell(command, cwd);
}

/* --------------------------- built-in mini-shell ---------------------------- */

/**
 * A small POSIX-flavoured shell that runs entirely in JS against the jailed
 * storage root. Supports:
 *   - sequencing with `;` and `&&`
 *   - a single pipe stage (`| wc -l`, `| head`, `| tail`, `| grep`)
 *   - quoting, `cd` with persistent state, and path resolution
 * It is *not* a Linux userland — see docs/TERMINAL-AND-CODING-AGENTS.md for the
 * honest comparison with Termux / WebContainers / a native exec module.
 */
async function simulateShell(rawCommand: string, cwd: string): Promise<ToolResult> {
  const command = rawCommand.trim();
  if (!command) return { ok: false, output: 'Empty command.' };

  // Sequencing: `a && b` runs b only if a succeeded; `a ; b` always runs b.
  const segments = splitSequence(command);
  if (segments.length > 1) {
    let lastOk = true;
    const chunks: string[] = [];
    for (const seg of segments) {
      if (seg.op === '&&' && !lastOk) continue;
      const r = await simulateShell(seg.text, cwd);
      lastOk = r.ok;
      if (r.output) chunks.push(r.output);
    }
    return { ok: lastOk, output: chunks.join('\n') };
  }

  const [beforePipe, ...pipeStages] = splitPipes(command);
  let result = await execOne(beforePipe, cwd);
  for (const stage of pipeStages) {
    result = await execPipeStage(stage, result.output);
  }
  return result;
}

interface Segment {
  op: 'start' | ';' | '&&';
  text: string;
}

function splitSequence(cmd: string): Segment[] {
  const out: Segment[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    const next = cmd[i + 1];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '&') {
      if (next === '&') {
        out.push({ op: out.length ? '&&' : 'start', text: cur.trim() });
        cur = '';
        i++;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === ';') {
      out.push({ op: out.length ? ';' : 'start', text: cur.trim() });
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push({ op: out.length ? ';' : 'start', text: cur.trim() });
  return out.filter((s) => s.text);
}

function splitPipes(cmd: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const ch of cmd) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '|') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

async function execPipeStage(stage: string, input: string): Promise<ToolResult> {
  const parts = tokenize(stage);
  const [cmd, ...rest] = parts;
  const n = Number((rest.find((f) => /^-n?\d+$/.test(f)) ?? '').replace(/[^0-9]/g, '')) || 10;
  const lines = input.split('\n');
  switch (cmd) {
    case 'wc':
      return { ok: true, output: rest.includes('-l') ? String(lines.filter(Boolean).length) : `${lines.length} ${input.split(/\s+/).filter(Boolean).length} ${input.length}` };
    case 'head':
      return { ok: true, output: lines.slice(0, n).join('\n') };
    case 'tail':
      return { ok: true, output: lines.slice(Math.max(0, lines.length - n)).join('\n') };
    case 'grep': {
      const pattern = rest.filter((r) => !r.startsWith('-'))[0] ?? '';
      const matches = lines.filter((l) => l.toLowerCase().includes(pattern.toLowerCase()));
      return { ok: matches.length > 0, output: matches.slice(0, 200).join('\n') || '' };
    }
    case 'sort':
      return { ok: true, output: [...lines].sort().join('\n') };
    case 'uniq':
      return { ok: true, output: lines.filter((l, i) => l !== lines[i - 1]).join('\n') };
    default:
      return { ok: false, output: `${cmd}: not supported as a pipe stage (wc, head, tail, grep, sort, uniq)` };
  }
}

async function execOne(command: string, cwd: string): Promise<ToolResult> {
  const parts = tokenize(command);
  if (!parts.length) return { ok: false, output: 'Empty command.' };
  const [cmd, ...rest] = parts;
  const joinRest = rest.join(' ');
  const flags = rest.filter((r) => r.startsWith('-'));
  const operands = rest.filter((r) => !r.startsWith('-'));
  const firstOp = operands[0] ?? '';
  const at = (p: string) => resolveFromCwd(p, cwd);

  try {
    switch (cmd) {
      case 'pwd':
        return { ok: true, output: `/${cwd === '.' ? '' : cwd}` };
      case 'cd': {
        const target = firstOp ? at(firstOp) : '.';
        if (target !== '.') {
          const st = await statAgentPath(target);
          if (!/directory/i.test(st)) return { ok: false, output: `cd: ${firstOp}: not a directory` };
        }
        setShellCwd(target);
        cwdState = target;
        return { ok: true, output: '' };
      }
      case 'ls': {
        const out = await listAgentDir(at(firstOp || '.'));
        return { ok: true, output: out };
      }
      case 'tree': {
        const root = at(firstOp || '.');
        const all = await walkAll(root);
        const lines = all.slice(0, 400).map((f) => f);
        return { ok: true, output: lines.length ? `${root}\n${lines.join('\n')}` : `${root} (empty)` };
      }
      case 'map': {
        const root = at(firstOp || '.');
        const filterArg = operands[1];
        const res = await buildRepoMap({ root, filter: filterArg, maxFiles: 200, maxChars: 9_000 });
        return { ok: true, output: res.output };
      }
      case 'cat': {
        if (!firstOp) return { ok: false, output: 'cat: missing operand' };
        const chunks: string[] = [];
        for (const op of operands) chunks.push(await readAgentFile(at(op), 512 * 1024));
        return { ok: true, output: chunks.join('\n') };
      }
      case 'head': {
        const n = Number((flags.find((f) => /^-n?\d+$/.test(f)) ?? '-10').replace(/[^0-9]/g, '')) || 10;
        const text = await readAgentFile(at(firstOp), 1024 * 1024);
        return { ok: true, output: text.split('\n').slice(0, n).join('\n') };
      }
      case 'tail': {
        const n = Number((flags.find((f) => /^-n?\d+$/.test(f)) ?? '-10').replace(/[^0-9]/g, '')) || 10;
        const text = await readAgentFile(at(firstOp), 1024 * 1024);
        const lines = text.split('\n');
        return { ok: true, output: lines.slice(Math.max(0, lines.length - n)).join('\n') };
      }
      case 'wc': {
        const text = await readAgentFile(at(firstOp), 1024 * 1024);
        const lines = text.split('\n').length;
        const words = text.split(/\s+/).filter(Boolean).length;
        return { ok: true, output: `${flags.includes('-l') ? `${lines}` : `${lines} ${words} ${text.length}`} ${firstOp}` };
      }
      case 'sort': {
        const text = await readAgentFile(at(firstOp), 1024 * 1024);
        const lines = text.split('\n');
        lines.sort();
        if (flags.includes('-r')) lines.reverse();
        return { ok: true, output: lines.join('\n') };
      }
      case 'uniq': {
        const text = await readAgentFile(at(firstOp), 1024 * 1024);
        const lines = text.split('\n');
        const out: string[] = [];
        let count = 1;
        for (let i = 1; i <= lines.length; i++) {
          if (i < lines.length && lines[i] === lines[i - 1]) {
            count++;
            continue;
          }
          out.push(flags.includes('-c') ? `${String(count).padStart(4)} ${lines[i - 1]}` : lines[i - 1]);
          count = 1;
        }
        return { ok: true, output: out.join('\n') };
      }
      case 'du': {
        const target = at(firstOp || '.');
        const files = await walkAll(target);
        return { ok: true, output: `${files.length} file(s) under /${target === '.' ? '' : target}` };
      }
      case 'echo':
        return { ok: true, output: joinRest.replace(/^["']|["']$/g, '') };
      case 'write': {
        const [path, ...body] = rest;
        if (!path) return { ok: false, output: 'write: usage — write <path> <text…>' };
        return { ok: true, output: await writeAgentFile(at(path), body.join(' ').replace(/^["']|["']$/g, '')) };
      }
      case 'grep': {
        const pattern = (operands[0] ?? '').replace(/^["']|["']$/g, '');
        const file = operands[1];
        if (!pattern) return { ok: false, output: 'grep: missing pattern' };
        const sources = file ? [at(file)] : (await walkAll(cwd)).slice(0, 300);
        const results: string[] = [];
        for (const src of sources) {
          try {
            const text = await readAgentFile(src, 1024 * 1024);
            text.split('\n').forEach((line, i) => {
              if (line.toLowerCase().includes(pattern.toLowerCase())) {
                results.push(`${file ? '' : `${src}:`}${i + 1}: ${line}`);
              }
            });
          } catch {
            /* skip unreadable */
          }
        }
        return { ok: results.length > 0, output: results.slice(0, 150).join('\n') || '(no matches)' };
      }
      case 'touch': {
        if (!firstOp) return { ok: false, output: 'touch: missing operand' };
        return { ok: true, output: await writeAgentFile(at(firstOp), '') };
      }
      case 'mkdir':
        return { ok: true, output: await mkdirAgent(at(firstOp)) };
      case 'stat':
        return { ok: true, output: await statAgentPath(at(firstOp || '.')) };
      case 'rm': {
        const target = operands[0];
        if (!target) return { ok: false, output: 'rm: missing operand' };
        return { ok: true, output: await deleteAgentPath(at(target)) };
      }
      case 'mv':
      case 'cp': {
        const [from, to] = operands;
        if (!from || !to) return { ok: false, output: `${cmd}: needs <src> <dst>` };
        const content = await readAgentFile(at(from), 4 * 1024 * 1024);
        await writeAgentFile(at(to), content);
        if (cmd === 'mv') await deleteAgentPath(at(from));
        return { ok: true, output: `${cmd === 'mv' ? 'Moved' : 'Copied'} ${from} → ${to}` };
      }
      case 'find': {
        const all = await walkAll(at(firstOp || '.'));
        const pattern = operands[1];
        const filtered = pattern ? all.filter((f) => f.includes(pattern.replace(/^["']|["']$/g, ''))) : all;
        return { ok: true, output: filtered.slice(0, 400).join('\n') || '(no files)' };
      }
      case 'basename':
        return { ok: true, output: at(firstOp).split('/').pop() ?? '' };
      case 'dirname': {
        const p = at(firstOp).split('/');
        p.pop();
        return { ok: true, output: p.join('/') || '.' };
      }
      case 'date':
        return { ok: true, output: new Date().toString() };
      case 'whoami':
        return { ok: true, output: 'copper' };
      case 'uname':
        return { ok: true, output: `Copper-Sandbox ${executorStatus()} js` };
      case 'env':
        return {
          ok: true,
          output: `PWD=/${cwd === '.' ? '' : cwd}\nHOME=/(storage root: ${currentRoot().tier === 'granted' ? 'user-granted folder' : 'app sandbox'})\nSHELL=copper-sh\nEXECUTOR=${executorStatus()}`,
        };
      case 'which':
        return {
          ok: (SHELL_BUILTINS as readonly string[]).includes(firstOp),
          output: (SHELL_BUILTINS as readonly string[]).includes(firstOp) ? `${firstOp}: shell builtin` : `${firstOp}: not found`,
        };
      case 'true':
        return { ok: true, output: '' };
      case 'false':
        return { ok: false, output: '' };
      case 'clear':
        return { ok: true, output: '\u001bc' };
      case 'help':
        return {
          ok: true,
          output: [
            'copper-sh — sandboxed shell over the app storage root.',
            '',
            '  navigation   cd  pwd  ls  tree  find  du  stat',
            '  project      map [dir] [filter]   outline of files + symbols with line numbers',
            '  files        cat  head  tail  wc  touch  write  mkdir  rm  mv  cp',
            '  text         echo  grep  sort  uniq',
            '  misc         date  whoami  uname  env  which  clear  help',
            '',
            '  sequencing   a && b     a ; b     a | wc -l',
            '',
            `Executor: ${executorStatus() === 'native' ? 'native (/system/bin/sh via the copper-exec module)' : 'built-in JS shell'}.`,
            'Built-ins only — no package manager, no downloaded binaries (Android W^X).',
          ].join('\n'),
        };
      default:
        return {
          ok: false,
          output: `${cmd}: command not found. Type \`help\` for the built-in list.`,
        };
    }
  } catch (e) {
    return { ok: false, output: `${cmd}: ${(e as Error).message}` };
  }
}

function tokenize(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function walkAll(rel: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string, depth = 0) => {
    if (depth > 6) return;
    let listing: string;
    try {
      listing = await listAgentDir(dir);
    } catch {
      return;
    }
    for (const line of listing.split('\n').slice(1)) {
      const [kind, ...rest] = line.trim().split(/\s+/);
      const name = rest.join(' ');
      if (!name) continue;
      const child = dir === '.' || dir === '' ? name : `${dir}/${name}`;
      if (kind === 'd') await walk(child, depth + 1);
      else files.push(child);
    }
  };
  await walk(safeRelPath(rel) || '.');
  return files;
}
