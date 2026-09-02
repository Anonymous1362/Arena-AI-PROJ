/**
 * Declaration outline — the pure, dependency-free half of the repo map.
 *
 * No React Native, no expo-file-system, no tree-sitter: given a path and the
 * file's text, it returns the declarations worth showing an agent, with line
 * numbers. Kept separate from `repomap.ts` (which owns the walking and the
 * formatting) so it can be reasoned about — and tested — on its own.
 *
 * Honest scope: these are line-oriented patterns, not a parser. They find
 * *where things are declared*; they do not resolve types, imports or call
 * graphs. That is the trade for shipping a repo map with zero native modules.
 */

/** Cap on declarations reported per file — a 3000-line file should not eat the map. */
export const MAX_SYMBOLS_PER_FILE = 24;

export type Lang =
  | 'ts' | 'py' | 'go' | 'rs' | 'java' | 'swift' | 'c' | 'rb' | 'php' | 'sh'
  | 'sql' | 'md' | 'json' | 'yaml' | 'ini' | 'css' | 'html' | 'other';

export function langOf(path: string): Lang {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'mjs': case 'cjs': case 'vue': case 'svelte': return 'ts';
    case 'py': return 'py';
    case 'go': return 'go';
    case 'rs': return 'rs';
    case 'java': case 'kt': case 'kts': case 'cs': case 'dart': return 'java';
    case 'swift': return 'swift';
    case 'c': case 'h': case 'cc': case 'cpp': case 'hpp': case 'zig': case 'nim': return 'c';
    case 'rb': return 'rb';
    case 'php': return 'php';
    case 'sh': case 'bash': case 'zsh': return 'sh';
    case 'sql': return 'sql';
    case 'md': case 'markdown': return 'md';
    case 'json': return 'json';
    case 'yaml': case 'yml': return 'yaml';
    case 'toml': case 'ini': case 'env': case 'cfg': case 'conf': case 'properties': return 'ini';
    case 'css': case 'scss': return 'css';
    case 'html': case 'htm': case 'xml': case 'plist': return 'html';
    default: return 'other';
  }
}

/* ------------------------------ symbol patterns ----------------------------- */

export interface SymbolHit {
  line: number;
  text: string;
}

const P = (src: string, flags = '') => new RegExp(src, flags);

/** Per-language declaration matchers, in priority order. */
const RULES: Record<Lang, RegExp[]> = {
  ts: [
    P('^\\s*export\\s+(?:default\\s+)?(?:declare\\s+)?(?:async\\s+)?function\\s*\\*?\\s*([A-Za-z0-9_$]+)'),
    P('^\\s*(?:async\\s+)?function\\s*\\*?\\s*([A-Za-z0-9_$]+)'),
    P('^\\s*export\\s+(?:default\\s+)?(?:abstract\\s+)?class\\s+([A-Za-z0-9_$]+)'),
    P('^\\s*(?:abstract\\s+)?class\\s+([A-Za-z0-9_$]+)'),
    P('^\\s*export\\s+(?:interface|type|enum|namespace)\\s+([A-Za-z0-9_$]+)'),
    P('^\\s*(?:interface|type|enum)\\s+([A-Za-z0-9_$]+)'),
    P('^\\s*export\\s+(?:const|let|var)\\s+([A-Za-z0-9_$]+)'),
    // Arrow / function-expression bindings. The `=>` (or `function`) must be
    // *there* — otherwise `const key = (model ?? '').trim()` reads as a declaration.
    P('^\\s*(?:const|let|var)\\s+([A-Za-z0-9_$]+)\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:\\([^)]*\\)\\s*(?::[^=]*?)?=>|[A-Za-z0-9_$]+\\s*=>|function\\b)'),
    // bare method / object-literal shorthand — keywords excluded so `if (x) {`
    // and `for (…)` never show up as declarations.
    P('^\\s*(?!(?:if|for|while|switch|catch|return|else|do|try|with|typeof|new|await|case|function|const|let|var|yield|throw|import|export)\\b)([A-Za-z0-9_$]+)\\s*\\([^)]*\\)\\s*(?::[^{]+)?\\{\\s*$'),
  ],
  py: [
    P('^\\s*(?:async\\s+)?def\\s+([A-Za-z_][A-Za-z0-9_]*)'),
    P('^\\s*class\\s+([A-Za-z_][A-Za-z0-9_]*)'),
    P('^([A-Z][A-Z0-9_]{2,})\\s*='), // module-level constants
  ],
  go: [
    P('^func\\s+(?:\\([^)]*\\)\\s*)?([A-Za-z_][A-Za-z0-9_]*)'),
    P('^type\\s+([A-Za-z_][A-Za-z0-9_]*)'),
    P('^(?:var|const)\\s+([A-Za-z_][A-Za-z0-9_]*)'),
  ],
  rs: [
    P('^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:async\\s+)?fn\\s+([A-Za-z_][A-Za-z0-9_]*)'),
    P('^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:struct|enum|trait|mod|type|union)\\s+([A-Za-z_][A-Za-z0-9_]*)'),
    P('^\\s*(?:pub\\s+)?(?:static|const)\\s+([A-Z_][A-Z0-9_]*)'),
  ],
  java: [
    P('^\\s*(?:(?:public|private|protected|internal|open|abstract|sealed|final|static|data|override|suspend|async|virtual)\\s+)*(?:class|interface|enum|record|struct|object|protocol)\\s+([A-Za-z_][A-Za-z0-9_]*)'),
    P('^\\s*(?!return\\b|new\\b|throw\\b|else\\b|if\\b|for\\b|while\\b|switch\\b|catch\\b|package\\b|import\\b)(?:(?:public|private|protected|internal|static|final|open|override|suspend|virtual|synchronized|native|sealed|strictfp)\\s+)*[\\w<>\\[\\],.?]+\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\('),
  ],
  swift: [
    P('^\\s*(?:(?:public|private|internal|fileprivate|open|final|static|mutating|@\\w+)\\s+)*func\\s+([A-Za-z_][A-Za-z0-9_]*)'),
    P('^\\s*(?:public|private|internal|open|final)*\\s*(?:class|struct|enum|protocol|extension|actor)\\s+([A-Za-z_][A-Za-z0-9_]*)'),
  ],
  c: [
    P('^\\s*(?:typedef\\s+)?(?:struct|enum|union|class)\\s+([A-Za-z_][A-Za-z0-9_]*)'),
    P('^\\s*(?:static\\s+|inline\\s+|extern\\s+|constexpr\\s+|template\\s*<[^>]*>\\s*)*[\\w:*&<>\\s]+?\\s\\*?([A-Za-z_][A-Za-z0-9_]*)\\s*\\([^;]*\\)\\s*\\{?\\s*$'),
    P('^\\s*#define\\s+([A-Z_][A-Z0-9_]*)'),
  ],
  rb: [
    P('^\\s*def\\s+(?:self\\.)?([A-Za-z_][A-Za-z0-9_!?]*)'),
    P('^\\s*(?:class|module)\\s+([A-Za-z_][A-Za-z0-9_:]*)'),
  ],
  php: [
    P('^\\s*(?:abstract\\s+|final\\s+)?(?:class|interface|trait|enum)\\s+([A-Za-z_][A-Za-z0-9_]*)'),
    P('^\\s*(?:public|private|protected|static)?\\s*function\\s+([A-Za-z_][A-Za-z0-9_]*)'),
  ],
  sh: [
    P('^\\s*function\\s+([A-Za-z_][A-Za-z0-9_-]*)'),
    P('^\\s*([A-Za-z_][A-Za-z0-9_-]*)\\s*\\(\\)\\s*\\{?'),
    P('^\\s*alias\\s+([A-Za-z_][A-Za-z0-9_-]*)='),
  ],
  sql: [P('^\\s*CREATE\\s+(?:OR\\s+REPLACE\\s+)?(TABLE|VIEW|INDEX|FUNCTION|PROCEDURE)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?([`"\\[]?[\\w.]+)', 'i')],
  md: [P('^(#{1,4})\\s+(.+?)\\s*#*\\s*$')],
  json: [],
  yaml: [P('^([A-Za-z0-9_.\\-/][^:#]*?):')],
  ini: [P('^\\[([^\\]]+)\\]'), P('^([A-Za-z0-9_.-]+)\\s*=')],
  css: [P('^\\s*([^@/{}\\s][^{}]*?)\\s*\\{\\s*$'), P('^\\s*@(media|keyframes|font-face|supports)\\s*([^{]*)\\{')],
  html: [P('^\\s*<(section|main|article|header|footer|nav|template|body|head|script|style)\\b', 'i')],
  other: [],
};

export function outline(lang: Lang, text: string): SymbolHit[] {
  const lines = text.split('\n');

  if (lang === 'json') return jsonKeys(text);

  const rules = RULES[lang];
  if (!rules.length) return [];

  const hits: SymbolHit[] = [];
  for (let i = 0; i < lines.length && hits.length < MAX_SYMBOLS_PER_FILE; i++) {
    const line = lines[i];
    if (!line || line.length > 400) continue;
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#!')) continue;

    for (const re of rules) {
      const m = re.exec(line);
      if (!m) continue;
      let label = '';
      if (lang === 'md') {
        const depth = (m[1] as string).length;
        label = `${'#'.repeat(depth)} ${m[2]}`;
      } else if (lang === 'sql') {
        label = `CREATE ${m[1].toUpperCase()} ${m[2]}`;
      } else if (lang === 'css') {
        label = (m[2] !== undefined ? `@${m[1]} ${m[2]}` : m[1] ?? '').trim().slice(0, 90);
      } else if (lang === 'html') {
        label = `<${m[1]}>`;
      } else if (lang === 'ini') {
        label = m[1].startsWith('[') ? m[0].trim() : `${m[1]}`;
      } else {
        label = m[1];
      }
      if (!label || label.length > 110) break;
      // Drop noise: single-letter locals, CSS property lines, obvious fragments.
      if (lang === 'ts' && /^[a-z]$/.test(label)) break;
      hits.push({ line: i + 1, text: label });
      break;
    }
  }
  return hits;
}

/** Top-level (and one level down) keys of a JSON document, without a full dump. */
function jsonKeys(text: string): SymbolHit[] {
  if (text.length > 64 * 1024) return [];
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return [];
    const hits: SymbolHit[] = [];
    const walk = (obj: unknown, prefix: string, depth: number) => {
      if (depth > 1 || hits.length >= MAX_SYMBOLS_PER_FILE) return;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const name = prefix ? `${prefix}.${k}` : k;
        const kind = Array.isArray(v) ? `[${v.length}]` : typeof v === 'object' && v !== null ? '{…}' : typeof v;
        hits.push({ line: 1, text: `${name}: ${kind}` });
        if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, name, depth + 1);
      }
    };
    walk(parsed, '', 0);
    return hits;
  } catch {
    return [];
  }
}
