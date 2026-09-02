/**
 * Danger classification for shell commands and tool calls.
 *
 * One list, two consumers, so the agent and the interactive terminal can never
 * disagree about what "destructive" means:
 *  - `src/agent/loop.ts` parks a tool call in the confirmation store when
 *    "Confirm dangerous actions" is on.
 *  - `src/components/TerminalView.tsx` asks before running the same commands
 *    when the terminal's own guard is on.
 *
 * Levels:
 *  - **destructive** — loses data or rewrites history. Always worth a tap to
 *    confirm, even for an experienced user.
 *  - **caution** — publishes, renames or edits in place. Confirmed too, but
 *    worded differently so it does not cry wolf.
 *
 * Deliberately conservative on false positives: a wrong "are you sure?" costs
 * one tap, a missed `rm -rf` costs the project.
 */

export type DangerLevel = 'destructive' | 'caution';

export interface DangerMatch {
  level: DangerLevel;
  /** Plain-English reason shown in the confirmation sheet. */
  reason: string;
  /** The fragment that matched, for the audit log. */
  matched: string;
}

interface Rule {
  re: RegExp;
  level: DangerLevel;
  reason: string;
}

/**
 * Ordered: the first match wins, so the most specific/most damaging patterns
 * come first.
 */
const COMMAND_RULES: Rule[] = [
  // ---- data loss -----------------------------------------------------------
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, level: 'destructive', reason: 'Fork bomb — it will exhaust the device and kill the app.' },
  { re: /\b(rm|rmdir|unlink)\b/, level: 'destructive', reason: 'Deletes files permanently — there is no trash in the sandbox.' },
  { re: /\bshred\b|\bwipefs\b|\bmkfs(\.\w+)?\b|\bdd\s+if=/, level: 'destructive', reason: 'Destroys disk contents irrecoverably.' },
  { re: /\btruncate\s+-s\s*0\b|>\s*\/dev\/[sh]d[a-z]/, level: 'destructive', reason: 'Empties a file or device.' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/, level: 'destructive', reason: 'Tears down the machine the app is running on.' },

  // ---- git: history and working tree --------------------------------------
  { re: /git\s+push\s+[^|;&]*(--force\b|-f\b)(?!-with-lease)/, level: 'destructive', reason: 'Force-push overwrites the remote branch — other clones lose commits.' },
  { re: /git\s+push\s+[^|;&]*--force-with-lease/, level: 'caution', reason: 'Force-push (with lease) still rewrites the remote branch.' },
  { re: /git\s+reset\s+--hard/, level: 'destructive', reason: 'Discards every uncommitted change in the working tree.' },
  { re: /git\s+clean\s+-\w*f/, level: 'destructive', reason: 'Deletes untracked files permanently.' },
  { re: /git\s+(checkout|restore)\s+(--|\.)\b/, level: 'destructive', reason: 'Reverts working-tree edits with no undo.' },
  { re: /git\s+(filter-branch|filter-repo|update-ref\s+-d)/, level: 'destructive', reason: 'Rewrites repository history.' },
  { re: /git\s+rebase\b/, level: 'caution', reason: 'Rebase rewrites commit history.' },
  { re: /git\s+branch\s+-D|git\s+tag\s+-d|git\s+stash\s+(drop|clear)/, level: 'destructive', reason: 'Deletes a branch, tag or stash entry.' },
  { re: /git\s+commit\s+--amend/, level: 'caution', reason: 'Amend rewrites the last commit.' },
  { re: /git\s+push\b/, level: 'caution', reason: 'Publishes local commits to the remote.' },
  { re: /git\s+(merge|cherry-pick|revert)\b/, level: 'caution', reason: 'Alters the current branch history.' },
  { re: /git\s+remote\s+(remove|set-url)/, level: 'caution', reason: 'Changes where pushes and fetches go.' },

  // ---- remote code / infra -------------------------------------------------
  { re: /\b(curl|wget)\b[^|;&]*\|\s*(ba|z|da)?sh\b/, level: 'destructive', reason: 'Pipes a remote script straight into a shell.' },
  { re: /\beval\b|\bsource\s+<\(/, level: 'caution', reason: 'Executes dynamically built code.' },
  { re: /docker\s+(system\s+prune|volume\s+(rm|prune)|rm\s+-f|rmi)/, level: 'destructive', reason: 'Removes containers, images or volumes.' },
  { re: /\b(terraform\s+destroy|kubectl\s+delete|helm\s+(uninstall|delete))\b/, level: 'destructive', reason: 'Tears down deployed infrastructure.' },
  { re: /\bnpm\s+publish\b|\byarn\s+publish\b|\bcargo\s+publish\b/, level: 'caution', reason: 'Publishes a package to a public registry.' },
  { re: /\bkill(all)?\s+(-9|-KILL|-TERM)\b/, level: 'caution', reason: 'Force-kills processes.' },

  // ---- in-place edits ------------------------------------------------------
  { re: /\bsed\s+(-\w*i|--in-place)/, level: 'caution', reason: 'Edits files in place, with no backup.' },
  { re: /\b(chmod|chown)\s+-R\b/, level: 'caution', reason: 'Recursively changes permissions across the tree.' },
  { re: /\bmv\b/, level: 'caution', reason: 'Moves or overwrites — the source path disappears.' },
  { re: /\b(npm|yarn|pnpm)\s+(i|install)\s+-g\b|\bpip3?\s+install\b/, level: 'caution', reason: 'Installs packages globally.' },
];

/** Tool names that are inherently destructive, with their own wording. */
const TOOL_RULES: { name: RegExp; level: DangerLevel; reason: (args: Record<string, unknown>) => string }[] = [
  {
    name: /^delete_path$/,
    level: 'destructive',
    reason: (a) => `Deletes “${String(a.path ?? '?')}” permanently — no trash, no undo.`,
  },
  {
    name: /^github_delete$/,
    level: 'destructive',
    reason: (a) => `Deletes “${String(a.path ?? '?')}” in the remote repository${a.branch ? ` on ${String(a.branch)}` : ''}.`,
  },
  {
    name: /^github_write$/,
    level: 'caution',
    reason: (a) =>
      `Commits a change to “${String(a.path ?? '?')}”${a.branch ? ` on ${String(a.branch)}` : ' on the current branch'} in the remote repository.`,
  },
];

/**
 * Classifies a shell command line. Returns null when nothing in it is risky.
 *
 * Only the first (most severe) match is reported — one reason reads better in a
 * sheet than a list.
 */
export function classifyCommand(command: string): DangerMatch | null {
  const cmd = (command ?? '').trim();
  if (!cmd) return null;
  for (const rule of COMMAND_RULES) {
    const m = rule.re.exec(cmd);
    if (m) return { level: rule.level, reason: rule.reason, matched: m[0].trim() };
  }
  return null;
}

/** Classifies a tool call by name. `run_command` is handled by `classifyCommand`. */
export function classifyTool(name: string, args: Record<string, unknown> = {}): DangerMatch | null {
  for (const rule of TOOL_RULES) {
    if (rule.name.test(name)) return { level: rule.level, reason: rule.reason(args), matched: name };
  }
  // A shell command smuggled through run_command still gets classified.
  if (name === 'run_command') return classifyCommand(String(args.command ?? ''));
  return null;
}

/** Headline for the confirmation sheet. */
export function dangerHeadline(hit: DangerMatch, toolName?: string): string {
  return hit.level === 'destructive'
    ? `Destructive${toolName ? ` · ${toolName}` : ''}: ${hit.reason}`
    : `Needs your OK${toolName ? ` · ${toolName}` : ''}: ${hit.reason}`;
}

/** True when a command matched any rule at all. */
export function isDangerous(command: string): boolean {
  return classifyCommand(command) !== null;
}
