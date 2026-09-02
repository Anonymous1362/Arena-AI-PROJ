/**
 * Dependency-free syntax highlighter.
 *
 * One master regex per language family, built once and cached. Every match is
 * classified by *which alternative* captured, gaps between matches are plain
 * text. It is a lexer, not a parser: it colours what code looks like, which is
 * exactly what a chat bubble or a file reader needs — and it costs nothing to
 * ship (no grammars, no WASM, no native modules).
 *
 * Designed to stay fast on a phone: token count is capped, regexes are linear,
 * and callers memoise per code string.
 */

export type TokType =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'fn'
  | 'type'
  | 'prop'
  | 'tag';

export interface Tok {
  t: TokType;
  s: string;
}

/** Safety valve: a 10k-line paste should never freeze the message list. */
const MAX_TOKENS = 6000;
const MAX_CHARS = 200_000;

/* ------------------------------ keyword sets ------------------------------- */

const KW = {
  js: 'abstract arguments async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface let new of package private protected public return set static super switch this throw try typeof var void while yield true false null undefined NaN Infinity',
  py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self cls print match',
  clike: 'auto bool break case catch char class const continue default delete do double else enum extern final float for friend func goto if inline int interface long namespace new operator override private protected public return sealed short signed sizeof static struct suspend switch template this throw try typedef typename union unsigned using val var virtual void volatile while func package import range defer go chan select map trait impl pub mod use match loop move unsafe dyn mut ref where async await let fun object when companion data guard weak strong init deinit protocol extension typealias enum struct const constexpr noexcept virtual operator delete new friend template typename namespace std string vector',
  sh: 'if then else elif fi for while until do done case esac function select in time return break continue export local readonly shift source alias echo cd ls sudo apt npm npx git curl wget',
  sql: 'select from where insert into values update set delete create table view index alter drop join left right inner outer full on group by order having limit offset union all as and or not null primary key foreign references distinct case when then else end exists between like asc desc',
  css: 'important inherit initial unset none auto',
  json: 'true false null',
} as const;

type GroupId = keyof typeof KW | 'yaml' | 'html' | 'none';

/**
 * Plugin-registered language packs (see src/agent/plugins.ts). A plugin can
 * teach the highlighter a new language with just keywords + a comment style —
 * data, not code, which is what a sealed JS bundle allows.
 */
interface DynamicLang {
  keywords: string;
  comment: 'c' | 'hash' | 'none';
}
const dynamic = new Map<string, DynamicLang>();

export function registerLanguage(id: string, def: { keywords: string; comment?: 'c' | 'hash' | 'none' }): void {
  const key = (id || '').trim().toLowerCase();
  if (!key) return;
  dynamic.set(key, { keywords: def.keywords ?? '', comment: def.comment ?? 'c' });
  cache.delete(key as GroupId);
}

function groupOf(lang: string): GroupId {
  const l = (lang || '').trim().toLowerCase();
  if (dynamic.has(l)) return l as GroupId;
  if (/^(js|javascript|jsx|ts|tsx|typescript|javascriptreact|typescriptreact|mjs|cjs|vue|svelte)$/.test(l)) return 'js';
  if (/^(py|python)$/.test(l)) return 'py';
  if (/^(java|kt|kotlin|swift|c|cc|cpp|cxx|h|hpp|cs|csharp|go|golang|rs|rust|dart|zig|nim)$/.test(l)) return 'clike';
  if (/^(sh|bash|zsh|shell|console|shell-session)$/.test(l)) return 'sh';
  if (/^sql$/.test(l)) return 'sql';
  if (/^(css|scss|less)$/.test(l)) return 'css';
  if (/^(json|jsonc|json5)$/.test(l)) return 'json';
  if (/^(ya?ml|toml|ini|env|properties|conf)$/.test(l)) return 'yaml';
  if (/^(html|xml|svg|plist|jsx-html)$/.test(l)) return 'html';
  if (/^(md|markdown|text|txt|diff)$/.test(l)) return 'none';
  // Unknown fence: C-family is the most forgiving guess.
  return 'clike';
}

/* ------------------------------ regex fragments ---------------------------- */

const COMMENT_C = String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`;
const COMMENT_HASH = String.raw`#[^\n]*`;
const COMMENT_HTML = String.raw`<!--[\s\S]*?-->`;
const STR_BASIC = String.raw`"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?`;
const STR_JS = STR_BASIC + String.raw`|` + '`(?:[^`\\\\]|\\\\.)*`?';
const NUM = String.raw`\b0[xXbBoO][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?\b`;
const TYPE = String.raw`\b[A-Z][A-Za-z0-9_]*\b`;
const FN = String.raw`\b[A-Za-z_$][A-Za-z0-9_$]*(?=\s*\()`;
const PROP_BARE = String.raw`\b[A-Za-z_$][A-Za-z0-9_$-]*(?=\s*:)`;
const PROP_QUOTED = String.raw`"[^"\n]+"(?=\s*:)`;
const TAG = String.raw`<\/?[A-Za-z][A-Za-z0-9_.:-]*|\/?>`;
const ATTR = String.raw`\b[A-Za-z-]+(?==")`;

interface Piece {
  t: TokType;
  src: string;
}

function piecesFor(group: GroupId): Piece[] {
  const kw = (words: string): Piece => ({ t: 'keyword', src: `\\b(?:${words.split(/\s+/).join('|')})\\b` });
  const out: Piece[] = [];

  const dyn = dynamic.get(group as string);
  if (dyn) {
    if (dyn.comment === 'c') out.push({ t: 'comment', src: COMMENT_C });
    else if (dyn.comment === 'hash') out.push({ t: 'comment', src: COMMENT_HASH });
    out.push({ t: 'string', src: STR_BASIC });
    out.push({ t: 'number', src: NUM });
    if (dyn.keywords.trim()) out.push(kw(dyn.keywords));
    out.push({ t: 'fn', src: FN });
    out.push({ t: 'type', src: TYPE });
    out.push({ t: 'prop', src: PROP_BARE });
    return out;
  }

  switch (group) {
    case 'none':
      return out;
    case 'html':
      out.push({ t: 'comment', src: COMMENT_HTML });
      out.push({ t: 'string', src: STR_BASIC });
      out.push({ t: 'tag', src: TAG });
      out.push({ t: 'prop', src: ATTR });
      break;
    case 'yaml':
      out.push({ t: 'comment', src: COMMENT_HASH });
      out.push({ t: 'string', src: STR_BASIC });
      out.push({ t: 'prop', src: String.raw`^[ \t-]*([A-Za-z0-9_.\-/]+)(?=\s*:)` });
      out.push({ t: 'number', src: NUM });
      out.push(kw(KW.json));
      break;
    case 'json':
      out.push({ t: 'prop', src: PROP_QUOTED });
      out.push({ t: 'string', src: STR_BASIC });
      out.push({ t: 'number', src: NUM });
      out.push(kw(KW.json));
      break;
    case 'css':
      out.push({ t: 'comment', src: COMMENT_C });
      out.push({ t: 'string', src: STR_BASIC });
      out.push({ t: 'prop', src: String.raw`[-a-zA-Z]+(?=\s*:)` });
      out.push({ t: 'number', src: String.raw`[-.]?\d[\d.]*(?:px|rem|em|%|vh|vw|s|ms|fr|deg)?\b` });
      out.push(kw(KW.css));
      out.push({ t: 'fn', src: String.raw`@[a-z-]+` });
      break;
    case 'py':
      out.push({ t: 'comment', src: COMMENT_HASH });
      out.push({ t: 'string', src: String.raw`(?:[rbfu]{1,2})?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)` });
      out.push({ t: 'number', src: NUM });
      out.push(kw(KW.py));
      out.push({ t: 'fn', src: FN });
      out.push({ t: 'type', src: TYPE });
      out.push({ t: 'prop', src: String.raw`\b[A-Za-z_]\w*(?=\s*=(?!=))` });
      break;
    case 'sh':
      out.push({ t: 'comment', src: COMMENT_HASH });
      out.push({ t: 'string', src: STR_BASIC });
      out.push({ t: 'number', src: NUM });
      out.push(kw(KW.sh));
      out.push({ t: 'fn', src: FN });
      out.push({ t: 'prop', src: String.raw`\$\{?[A-Za-z_@#?0-9][A-Za-z0-9_]*\}?` });
      break;
    case 'sql':
      out.push({ t: 'comment', src: String.raw`--[^\n]*|\/\*[\s\S]*?\*\/` });
      out.push({ t: 'string', src: STR_BASIC });
      out.push({ t: 'number', src: NUM });
      out.push(kw(KW.sql));
      out.push({ t: 'fn', src: FN });
      break;
    case 'js':
      out.push({ t: 'comment', src: COMMENT_C });
      out.push({ t: 'string', src: STR_JS });
      out.push({ t: 'number', src: NUM });
      out.push(kw(KW.js));
      out.push({ t: 'fn', src: FN });
      out.push({ t: 'type', src: TYPE });
      out.push({ t: 'prop', src: PROP_BARE });
      break;
    default: // clike
      out.push({ t: 'comment', src: COMMENT_C });
      out.push({ t: 'string', src: STR_BASIC });
      out.push({ t: 'number', src: NUM });
      out.push(kw(KW.clike));
      out.push({ t: 'fn', src: FN });
      out.push({ t: 'type', src: TYPE });
      out.push({ t: 'prop', src: PROP_BARE });
      break;
  }
  return out;
}

interface Compiled {
  re: RegExp;
  types: TokType[];
}

/** SQL is conventionally UPPERCASE, so its keywords match case-insensitively. */
const GROUP_FLAGS: Partial<Record<GroupId, string>> = { sql: 'gmi' };

const cache = new Map<GroupId, Compiled>();

function compile(group: GroupId): Compiled {
  const hit = cache.get(group);
  if (hit) return hit;
  const pieces = piecesFor(group);
  const re = new RegExp(pieces.map((p) => `(${p.src})`).join('|'), GROUP_FLAGS[group] ?? 'gm');
  const compiled: Compiled = { re, types: pieces.map((p) => p.t) };
  cache.set(group, compiled);
  return compiled;
}

/** Splits source into coloured tokens. Gaps and uncaptured text are `plain`. */
export function tokenize(code: string, lang: string): Tok[] {
  const group = groupOf(lang);
  const src = code.length > MAX_CHARS ? `${code.slice(0, MAX_CHARS)}\n…` : code;
  if (group === 'none' || !src) return [{ t: 'plain', s: src }];

  const { re, types } = compile(group);
  re.lastIndex = 0;
  const toks: Tok[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  const push = (t: TokType, s: string) => {
    if (!s) return;
    const prev = toks[toks.length - 1];
    if (prev && prev.t === t) prev.s += s;
    else toks.push({ t, s });
  };

  while ((m = re.exec(src))) {
    if (toks.length > MAX_TOKENS) break;
    if (m.index > last) push('plain', src.slice(last, m.index));
    const gi = m.slice(1).findIndex((g) => g !== undefined);
    push(types[gi] ?? 'plain', m[0]);
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++; // never spin on an empty match
  }
  if (last < src.length) push('plain', src.slice(last));
  return toks.length ? toks : [{ t: 'plain', s: src }];
}

/** Human label for a fence language, used in code-block headers. */
export function langLabel(lang: string | undefined): string {
  const l = (lang || '').trim().toLowerCase();
  const nice: Record<string, string> = {
    js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX', py: 'Python', python: 'Python',
    sh: 'Shell', bash: 'Bash', zsh: 'Zsh', json: 'JSON', jsonc: 'JSON', yaml: 'YAML', yml: 'YAML',
    html: 'HTML', xml: 'XML', css: 'CSS', scss: 'SCSS', sql: 'SQL', md: 'Markdown', markdown: 'Markdown',
    java: 'Java', kt: 'Kotlin', kotlin: 'Kotlin', swift: 'Swift', go: 'Go', golang: 'Go', rs: 'Rust',
    rust: 'Rust', c: 'C', cpp: 'C++', cs: 'C#', rb: 'Ruby', php: 'PHP', dart: 'Dart', toml: 'TOML',
    diff: 'Diff', text: 'Text', txt: 'Text',
  };
  return nice[l] || (l ? l.toUpperCase() : 'code');
}
