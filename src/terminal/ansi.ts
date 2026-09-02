/**
 * ANSI / VT-100 escape-sequence renderer for the in-app terminal.
 *
 * Why this exists: a terminal *emulator* is half shell, half parser. The shell
 * half is `simulateShell` / the native executor; this is the other half — it
 * turns byte streams that contain SGR colour codes, bold/underline and the
 * usual cursor noise into styled runs React Native can draw. With it,
 * `ls --color`, `grep --color`, gradle, git and anything else the native
 * executor runs render the way they would in Termux instead of as `ESC[31m`
 * garbage.
 *
 * Scope, stated plainly: we render *lines*, not a cursor-addressable screen.
 * Full-screen TUIs (vim, htop) move the cursor hundreds of times a second and
 * need a real PTY plus a screen model — that is the native module in
 * `modules/copper-pty`, not this file. Everything line-oriented works here.
 */

export interface AnsiRun {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  faint?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const CSI = '\x1b[';

/* ------------------------------ 16-colour map ------------------------------ */

const BASIC = [
  '#1F1E1B', '#B3261E', '#2E7D52', '#B07C22', '#2F5FD0', '#7A4E8C', '#2E7D6E', '#9B988E',
  '#5E5C55', '#E5664F', '#5CBF86', '#D19A3D', '#7FA6FF', '#C79BD1', '#7FCBB4', '#F2F0E9',
];

function color256(n: number): string {
  if (n < 16) return BASIC[n];
  if (n < 232) {
    const i = n - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor((i % 36) / 6);
    const b = i % 6;
    const v = (x: number) => (x === 0 ? 0 : 55 + x * 40);
    return `#${[v(r), v(g), v(b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  }
  const g = 8 + (n - 232) * 10;
  const h = g.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

/* --------------------------------- parsing --------------------------------- */

interface State {
  fg?: string;
  bg?: string;
  bold?: boolean;
  faint?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** Removes escape sequences without interpreting them (agent context, logs). */
export function stripAnsi(input: string): string {
  return input
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC (titles, hyperlinks)
    .replace(/\x1b\[[0-9;:?]*[ -/]*[@-~]/g, '') // CSI — before 2-byte: '[' is in that range
    .replace(/\x1b[[@-Z\\-_]/g, ''); // 2-byte escapes
}

/**
 * Parses a chunk of terminal output into styled runs. Unrecognised control
 * sequences are dropped; printable text never is.
 */
export function parseAnsi(input: string): AnsiRun[] {
  if (!input) return [];
  if (!input.includes('\x1b') && !input.includes('\r')) return [{ text: input }];

  const runs: AnsiRun[] = [];
  let cur: State = {};
  let buf = '';

  const flush = () => {
    if (!buf) return;
    runs.push({ text: buf, ...cur });
    buf = '';
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch !== '\x1b') {
      // \r at end of line ("progress bar" style) → keep only what follows
      if (ch === '\r') {
        const rest = input.slice(i + 1);
        if (!rest.includes('\n')) {
          flush();
          runs.length = 0;
          buf = '';
          i++;
          continue;
        }
      }
      buf += ch;
      i++;
      continue;
    }
    const next = input[i + 1];
    if (next === ']') {
      const end = input.indexOf('\x07', i);
      const alt = input.indexOf('\x1b\\', i);
      const stop = end >= 0 ? end : alt >= 0 ? alt : input.length;
      i = stop + (end >= 0 ? 1 : 2);
      continue;
    }
    if (next === '[') {
      const m = /^(\x1b\[[0-9;:?]*[ -/]*[@-~])/.exec(input.slice(i));
      if (!m) {
        i++;
        continue;
      }
      const seq = m[1];
      const final = seq[seq.length - 1];
      if (final === 'm') {
        flush();
        const params = seq.slice(2, -1).split(';').map((p) => (p === '' ? 0 : Number(p)));
        for (let p = 0; p < params.length; p++) {
          const v = params[p];
          switch (v) {
            case 0: cur = {}; break;
            case 1: cur.bold = true; break;
            case 2: cur.faint = true; break;
            case 3: cur.italic = true; break;
            case 4: cur.underline = true; break;
            case 22: cur.bold = false; cur.faint = false; break;
            case 23: cur.italic = false; break;
            case 24: cur.underline = false; break;
            case 39: cur.fg = undefined; break;
            case 49: cur.bg = undefined; break;
            case 38:
            case 48: {
              const mode = params[p + 1];
              if (mode === 5) {
                const c = color256(params[p + 2] ?? 0);
                if (v === 38) cur.fg = c; else cur.bg = c;
                p += 2;
              } else if (mode === 2) {
                const c = `#${[params[p + 2] ?? 0, params[p + 3] ?? 0, params[p + 4] ?? 0]
                  .map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0'))
                  .join('')}`;
                if (v === 38) cur.fg = c; else cur.bg = c;
                p += 4;
              }
              break;
            }
            default:
              if (v >= 30 && v <= 37) cur.fg = BASIC[v - 30];
              else if (v >= 90 && v <= 97) cur.fg = BASIC[v - 90 + 8];
              else if (v >= 40 && v <= 47) cur.bg = BASIC[v - 40];
              else if (v >= 100 && v <= 107) cur.bg = BASIC[v - 100 + 8];
              break;
          }
        }
      }
      // Cursor moves / erases: meaningless in a scrolling log — dropped.
      i += seq.length;
      continue;
    }
    // 2-byte escape (e.g. ESC(B): charset) — skip
    i += 2;
  }
  flush();
  return runs.length ? runs : [];
}

/** True when a string carries colour codes worth rendering. */
export function hasAnsi(input: string): boolean {
  return input.includes(CSI) || input.includes('\x1b]');
}
