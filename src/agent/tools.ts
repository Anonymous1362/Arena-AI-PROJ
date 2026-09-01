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

/** OpenAI-format `tools` array for chat.completions. */
export function openAITools(): any[] {
  return TOOL_SPECS.map((t) => ({
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
      case 'run_command': {
        const secs = Math.min(60, Math.max(1, Number(args.timeout_seconds ?? 20)));
        return await runCommand(String(args.command ?? ''), secs * 1000, ctx.defaultTimeoutMs);
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
function nativeExecutor(): ((cmd: string, timeoutMs: number) => Promise<{ stdout: string; exit: number }>) | null {
  if (Platform.OS !== 'android') return null;
  const g = globalThis as any;
  const exec =
    g.AuroraExec?.exec ??
    g.expo?.modules?.AuroraExec?.exec ??
    g.expo?.modules?.ExpoFileSystem?.exec ??
    null;
  if (typeof exec !== 'function') return null;
  return (cmd: string, timeoutMs: number) =>
    exec(cmd, timeoutMs).then((r: any) => ({ stdout: String(r?.stdout ?? r ?? ''), exit: Number(r?.exit ?? r?.code ?? 0) }));
}

async function runCommand(command: string, timeoutMs: number, _cap?: number): Promise<ToolResult> {
  const cwdLabel = currentRoot().tier === 'granted' ? 'granted storage root' : 'app sandbox';

  const real = nativeExecutor();
  if (real) {
    try {
      const withCd = `cd "$(getcwd 2>/dev/null || echo .)" 2>/dev/null; ${command}; echo "__EXIT:$?"`;
      const r = await Promise.race([
        real(withCd, timeoutMs),
        new Promise<{ stdout: string; exit: number }>((_, rej) =>
          setTimeout(() => rej(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs + 1500)
        ),
      ]);
      return {
        ok: r.exit === 0,
        output: r.stdout.length > 32_000 ? `${r.stdout.slice(0, 16_000)}\n…[truncated]…\n${r.stdout.slice(-16_000)}` : r.stdout,
      };
    } catch (e) {
      return { ok: false, output: `Command failed: ${(e as Error).message}` };
    }
  }

  // Simulated tier — honest about what it is, still useful.
  return simulateShell(command, cwdLabel);
}

/* --------------------------- simulated mini-shell -------------------------- */

function simulateShell(command: string, cwdLabel: string): Promise<ToolResult> {
  return (async () => {
    const parts = tokenize(command.trim());
    if (parts.length === 0) return { ok: false, output: 'Empty command.' };
    const [cmd, ...rest] = parts;

    const joinRest = rest.join(' ');
    const flags = rest.filter((r) => r.startsWith('-'));
    const operands = rest.filter((r) => !r.startsWith('-'));
    const firstOp = operands[0] ?? '';

    try {
      switch (cmd) {
        case 'pwd':
          return { ok: true, output: `/ (sandbox: ${cwdLabel})` };
        case 'ls': {
          const out = await listAgentDir(firstOp || '.');
          return { ok: true, output: out };
        }
        case 'cat': {
          if (!firstOp) return { ok: false, output: 'cat: missing operand' };
          const out = await readAgentFile(firstOp, 256 * 1024);
          return { ok: true, output: out };
        }
        case 'head': {
          const n = Number((flags.find((f) => /^-n?\d+$|^-\d+$/.test(f)) ?? '-10').replace(/[^0-9]/g, '')) || 10;
          const text = await readAgentFile(firstOp, 1024 * 1024);
          return { ok: true, output: text.split('\n').slice(0, n).join('\n') };
        }
        case 'tail': {
          const n = Number((flags.find((f) => /^-n?\d+$|^-\d+$/.test(f)) ?? '-10').replace(/[^0-9]/g, '')) || 10;
          const text = await readAgentFile(firstOp, 1024 * 1024);
          const lines = text.split('\n');
          return { ok: true, output: lines.slice(Math.max(0, lines.length - n)).join('\n') };
        }
        case 'wc': {
          const text = await readAgentFile(firstOp, 1024 * 1024);
          const lines = text.split('\n').length;
          const words = text.split(/\s+/).filter(Boolean).length;
          return { ok: true, output: `${flags.includes('-l') ? `${lines}` : `${lines} ${words} ${text.length}`} ${firstOp}` };
        }
        case 'echo':
          return { ok: true, output: joinRest.replace(/^["']|["']$/g, '') };
        case 'grep': {
          const pattern = operands[0] ?? '';
          const file = operands[1];
          if (!pattern) return { ok: false, output: 'grep: missing pattern' };
          const sources = file ? [file] : (await walkAll('.')).slice(0, 200);
          const results: string[] = [];
          for (const src of sources) {
            try {
              const text = await readAgentFile(src, 1024 * 1024);
              text.split('\n').forEach((line, i) => {
                if (line.toLowerCase().includes(pattern.toLowerCase().replace(/^["']|["']$/g, ''))) {
                  results.push(`${file ? '' : `${src}:`}${i + 1}: ${line}`);
                }
              });
            } catch {
              /* skip unreadable */
            }
          }
          return { ok: results.length > 0, output: results.slice(0, 100).join('\n') || '(no matches)' };
        }
        case 'touch': {
          if (!firstOp) return { ok: false, output: 'touch: missing operand' };
          await writeAgentFile(firstOp, '').catch(async () => writeAgentFile(firstOp, ''));
          return { ok: true, output: `touched ${firstOp}` };
        }
        case 'mkdir':
          return { ok: true, output: await mkdirAgent(firstOp) };
        case 'rm': {
          const target = operands[0];
          if (!target) return { ok: false, output: 'rm: missing operand' };
          return { ok: true, output: await deleteAgentPath(target) };
        }
        case 'mv':
        case 'cp': {
          const [from, to] = operands;
          if (!from || !to) return { ok: false, output: `${cmd}: needs <src> <dst>` };
          const content = await readAgentFile(from, 1024 * 1024);
          await writeAgentFile(to, content);
          if (cmd === 'mv') await deleteAgentPath(from);
          return { ok: true, output: `${cmd === 'mv' ? 'Moved' : 'Copied'} ${from} → ${to}` };
        }
        case 'find': {
          const all = await walkAll(firstOp || '.');
          return { ok: true, output: all.slice(0, 300).join('\n') || '(no files)' };
        }
        case 'help':
          return {
            ok: true,
            output:
              'Built-in shell (sandboxed): ls cat head tail wc echo grep touch mkdir rm mv cp find pwd help.\nFull native execution unlocks with an executor grant on Android.',
          };
        default:
          return {
            ok: false,
            output: `${cmd}: command not available in the sandboxed shell. Built-ins: ls cat head tail wc echo grep touch mkdir rm mv cp find pwd help.`,
          };
      }
    } catch (e) {
      return { ok: false, output: `${cmd}: ${(e as Error).message}` };
    }
  })();
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
  const walk = async (dir: string) => {
    const listing = await listAgentDir(dir);
    for (const line of listing.split('\n').slice(1)) {
      const [kind, ...rest] = line.trim().split(/\s+/);
      const name = rest.join(' ');
      if (!name) continue;
      const child = dir === '.' || dir === '' ? name : `${dir}/${name}`;
      if (kind === 'd') await walk(child);
      else files.push(child);
    }
  };
  try {
    await walk(safeRelPath(rel) || '.');
  } catch {
    /* root may be empty */
  }
  return files;
}
