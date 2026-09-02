# Terminal & coding agents — how Copper works on a phone, and what it can't do

Copper ships a terminal and a coding agent **inside the app**. No Termux, no
second multi-GB sandbox app, no downloaded runtime, no root. This document is
the honest engineering write-up: what each layer actually is, what it is not,
and what it would take to make it stronger.

If you only read one table, read this one.

| Capability | Copper today | Termux | WebContainers | Native exec module |
|---|---|---|---|---|
| Install required | **none** | ~1 GB app + packages | none (but Node/WASM) | rebuild the app |
| Interactive shell | **yes** (app terminal) | yes | no (Node only) | yes |
| Real `/system/bin/sh` | only if a device exposes an exec module | yes | no | yes |
| `git` binary | no — GitHub over REST instead | yes | limited | yes |
| `node`, `npm`, compilers | no | yes | Node yes, native no | yes |
| Reads/writes your files | yes (sandbox or your granted folder) | yes (its own home) | in-memory FS | yes |
| Works on a stock retail phone | **yes** | yes | yes (browser) | only on a custom build |
| Agent tool calls | **yes — 8 sandbox + 9 GitHub tools** | via wrappers | n/a | yes |

---

## 1. Why the terminal is built in

Android enforces **W^X** on app-private storage: a normal app cannot execute a
binary it wrote to disk. That single rule kills the obvious designs.

- **Bundling Termux** — not possible. Termux is its own app with its own
  package manager; you cannot embed it, and asking the user to install it
  defeats the point.
- **Downloading a Node/toolchain at runtime** — same W^X wall, plus hundreds of
  megabytes and a first-run experience measured in minutes.
- **WebContainers** — impressive, but it is a browser technology (WASM + a
  virtualised POSIX layer in a Service Worker). Inside React Native there is no
  browser to run it in, and it still only gives you Node, not a phone-native
  toolchain.
- **A native exec module** — the real answer for people who want `git` and
  `node` on-device. It requires compiling an Expo module and shipping a custom
  dev client / release build. Copper is architected so that this drops in
  without changing a line of app code (see §2), but the default download can't
  assume you have it.

So the shipped default is a **pure-JS shell** that is honest about being one:
it covers inspection and file manipulation against a jailed storage root, and
the UI never pretends it is a Linux userland.

---

## 2. The two executor tiers

`src/agent/tools.ts` probes for a native executor **once per call** and never
assumes:

```
globalThis.CopperExec?.exec
globalThis.expo?.modules?.CopperExec?.exec
globalThis.AuroraExec?.exec          (legacy name, still honoured)
globalThis.expo?.modules?.ExpoFileSystem?.exec
```

| Tier | When | What runs | UI label |
|---|---|---|---|
| `native` | Android device exposes one of the probes above | the command is wrapped as `cd "<cwd>" 2>/dev/null …; <cmd>; echo "__EXIT:$?"` and handed to `/system/bin/sh` | **copper-exec · native shell** |
| `builtin` | everything else, incl. iOS and web | `simulateShell()` — the JS shell described below | **built-in sandbox shell** |

The Terminal tab shows which tier is live as a status LED, and Settings → Shell
& sandbox explains it in words. Nothing is labelled "real shell" unless it is.

**Native-tier details that matter:** stdout is captured, the exit code is read
back from a sentinel echo (so pipes and `&&` chains report the *last* command's
status correctly), output over 32 KB is head+tail truncated with an explicit
`…[truncated]…` marker, and a watchdog rejects the promise at `timeout + 1.5 s`
so a hung command can't wedge the agent loop.

---

## 3. The built-in shell (`copper-sh`)

A small POSIX-flavoured interpreter over the jailed storage root. Implemented
in `src/agent/tools.ts` (`simulateShell` → `execOne`).

**Structure**

- `a && b` — run `b` only if `a` succeeded; `a ; b` — always run `b`. Sequences
  are split with a quote-aware scanner, so `;` inside `"…"` is literal.
- `a | b` — a single pipe stage. The right-hand side receives the left's stdout
  (`wc -l`, `head`, `tail`, `grep`, `sort`, `uniq`).
- Quoting — single and double quotes are honoured by the tokeniser; `cd`
  persists across calls in `cwdState`, shared with the agent, so `cd src` in the
  terminal changes the directory the agent's next `run_command` uses.

**Built-ins** (`SHELL_BUILTINS`, also the tab-completion dictionary and the list
rendered in Settings → Shell & sandbox):

| Group | Commands |
|---|---|
| Navigation | `cd` `pwd` `ls` `tree` `find` `du` `stat` |
| Project | `map [dir] [filter]` — repo outline (see §5) |
| Files | `cat` `head` `tail` `wc` `touch` `write` `mkdir` `rm` `mv` `cp` |
| Text | `echo` `grep` `sort` `uniq` `basename` `dirname` |
| Misc | `date` `whoami` `uname` `env` `which` `true` `false` |
| Terminal | `clear` `history` `help` |

Everything is jailed: paths are normalised by `safeRelPath()` and a `..` that
would escape the root throws instead of resolving.

**Not implemented, on purpose:** job control, backgrounding, redirection to
files, environment mutation, globbing beyond `find`, and any package manager.
Those need a kernel-level shell, i.e. tier 1.

---

## 4. Storage tiers

`src/agent/fs.ts` keeps two roots and never mixes them up.

| Tier | Path | Permissions | When |
|---|---|---|---|
| `sandbox` | `<documentDirectory>/files/` | none — app-private | default, always available, iOS only option |
| `granted` | Android SAF tree URI | user picks a folder once | Settings → Shell & sandbox → "Grant a folder" |

SAF navigation is the expensive part (document URIs must be resolved segment by
segment), so `safResolve()` caches directory listings in `uriCache`, cleared on
every write. `listAgentEntries()` is the structured listing both tiers expose —
the repo mapper walks that, not the human-formatted `listAgentDir()`.

---

## 5. Repo map — orientation without tree-sitter

Aider and OpenCode build a "repo map" with **tree-sitter**: a C parser plus a
grammar blob per language. On a phone that means native modules per language,
tens of MB of grammars, and a build step nobody can run from Expo Go.

Copper ships a **regex declaration outline** instead (`src/agent/outline.ts` —
pure, no React Native imports; `src/agent/repomap.ts` — walking and formatting).
It answers the question an agent actually has before editing: *where do things
live?* It does **not** resolve types, imports or call graphs, and the output
says so in its own header so the model never mistakes it for a semantic index.

**How it's produced**

1. Walk from `root` (default `.`), depth ≤ 9, skipping `node_modules`, `.git`,
   `dist`, `build`, `Pods`, `__pycache__`, `.gradle`, lockfiles and ~25 more.
2. Files are read in batches of 6 (SAF round-trips dominate the cost), each
   capped at 128 KB; bigger or non-mappable files are listed by name only.
3. Per language, line-oriented patterns extract declarations: functions,
   classes, interfaces/types/enums, arrow-function bindings, methods, Go/Rust
   impls, Java/Kotlin/C# members, Swift funcs, C structs and `#define`s, shell
   functions, SQL DDL, markdown headings, YAML/INI top-level keys, CSS
   selectors and at-rules, JSON key shapes.
4. Keywords are excluded so control flow never shows up as a declaration — `if`,
   `for`, `while`, `switch`, `catch`, `return` are all blacklisted, and an arrow
   binding must actually contain `=>` or `function` (otherwise
   `const key = (model ?? '').trim()` reads as a declaration).

**Two ways in**

- Agent tool `repo_map` with `{ root, filter, max_files = 300, max_chars = 12000 }`.
  The system prompt tells the model to call it *first* in an unfamiliar project
  rather than crawling file by file.
- Shell command `map [dir] [filter]` — same code path, also in the Terminal's
  quick-command chips.

**Real output** — `map src/agent` run against this repository:

```
REPO MAP — src/agent
tier: app sandbox · files: 9 · dirs: 0 · 99 KB scanned
outline: regex declarations, not a semantic index — line numbers are 1-based; open a file to read it.

· src/agent/confirm.ts — ts, 35 lines
       8  PendingConfirmation
      18  ConfirmState
      24  useConfirmStore
· src/agent/danger.ts — ts, 135 lines
      21  DangerLevel
      23  DangerMatch
      31  Rule
     104  classifyCommand
     115  classifyTool
     125  dangerHeadline
     132  isDangerous
· src/agent/fs.ts — ts, 324 lines
      16  FsTier
      18  FsPermissionInfo
      39  setGrantedTree
      47  currentRoot
      52  requestStorageAccess
      78  safeRelPath
     …
```

Output is capped (`max_chars`, default 12 KB) and truncation is announced with
the count of files not shown plus advice to narrow with `root`/`filter`.

**Honest limits:** no cross-file resolution, no type inference, no
comment-stripping beyond line prefixes (so a declaration inside a block comment
can slip through), and languages outside the pattern table produce a bare
`path — lang, N lines` entry. It is an index of *where to look*, not an AST.

---

## 6. GitHub connector — `git` without the `git` binary

`src/agent/github.ts` talks to the **GitHub REST API v3** directly. No binary,
no credentials helper, no keychain: a personal access token stored on-device in
the settings store (never sent anywhere but `api.github.com`).

**Tools** (exposed to the agent when Settings → GitHub has a token and "agent
GitHub tools" is on):

| Tool | Does | Risk |
|---|---|---|
| `github_status` | verifies the token, reports login + rate limit remaining | read |
| `github_repos` | lists repos for you or an org | read |
| `github_tree` | recursive file listing at any ref | read |
| `github_read` | file contents at a ref (base64 decoded in JS) | read |
| `github_write` | create/update a file **with a real commit**; fetches the current blob sha first so an update can't silently conflict | `medium` → confirmation |
| `github_delete` | delete a file with a commit | `medium` → confirmation |
| `github_search` | code search inside a repo | read |
| `github_issue` | open an issue | `medium` → confirmation |
| `github_pr` | open a pull request (`head` → `base`) | `medium` → confirmation |

`danger: 'medium'` specs feed the same confirmation sheet as destructive shell
commands, so a write to your repo always costs one deliberate tap.

**Pull a repo into the sandbox** (Settings → GitHub → "Pull repo into
sandbox", `cloneRepoIntoSandbox()`): fetches the git tree recursively and
downloads **text blobs ≤ 512 KB, up to 400 files**, skipping binaries, into the
active storage root via `writeAgentFile`. It reports exactly what it did —
`{ files, bytes, skipped, error? }` — and the UI shows progress live.

**What this is not:** a `git clone`. There is no object database, no refs, no
history, no `git status` semantics. It is a working copy of the current tree.
Consequences, stated plainly:

- You cannot commit *local* sandbox state as a diff. To publish a change the
  agent uses `github_write`, which creates a single-file commit through the API.
- Multi-file atomic commits would need the Git Data API (`/git/trees` +
  `/git/commits`) — the natural next step, not shipped yet.
- Branch protection, PR review state and Actions are visible through
  `github_pr`/`github_search` but not manipulated beyond opening.

---

## 7. The coding agent loop

`src/agent/loop.ts` + `src/ai/session.ts`.

1. **Plan protocol.** The model may emit a `[PLAN] … [/PLAN]` block; the loop
   parses it into named steps, renders an animated timeline, and tracks
   `1/4 Read config` style progress. Steps are named by outcome, never
   "Step 1".
2. **Tool calls** through the OpenAI `tools` protocol (`openAITools()`), with
   results appended as `role: 'tool'` messages so the model sees real output.
3. **Auto-continue** on token or tool-call limits, using `CONTINUE_NUDGE`, so a
   long task finishes instead of stalling mid-plan.
4. **Context discipline.** `contextUsageFor()` measures against the *model's*
   window (1 M for Gemini 3.x, 200 K for Claude, …) and `maybeAutoCompact()`
   folds older turns into a Project Summary State, keeping the last 6 messages
   live.
5. **Verification requirement.** The system prompt is explicit: after changing
   code, run the project's check and report the real output; never claim success
   you did not observe.
6. **Git discipline.** Stay on the current branch, `git status`/`git diff`
   before and after edits, never force-push, never rewrite published history,
   never commit or push unless asked.

---

## 8. Safety model

One classifier, two consumers, so the agent and the interactive terminal can
never disagree about what "destructive" means: **`src/agent/danger.ts`**.

| Level | Examples | Behaviour |
|---|---|---|
| `destructive` | `rm`, `git reset --hard`, `git clean -f`, `git checkout -- .`, `git push --force`, `git branch -D`, `dd if=`, `mkfs`, fork bomb, `curl … \| sh`, `docker system prune`, `terraform destroy`, `delete_path`, `github_delete` | confirmation sheet before anything runs |
| `caution` | `git push`, `git commit --amend`, `git rebase`, `mv`, `sed -i`, `chmod -R`, `kill -9`, `npm publish`, `github_write`, `github_issue`, `github_pr` | confirmation sheet, softer wording |

- Agent side: gated by Settings → Agent → "Confirm dangerous actions".
- Terminal side: gated by Settings → Shell & sandbox → "Confirm destructive
  commands" (on by default).
- A **denial is fed back to the model** as a tool result ("the user declined —
  choose a different approach"), so it adapts instead of retrying blindly.
- Paths are jail-bound (§4); tokens stay on-device; the app never shells out to
  anything it did not just classify.

---

## 9. Known limits and the honest upgrade path

Ranked by value per unit of effort:

1. **Multi-file commits via the Git Data API** — pure REST, no native code,
   makes `github_write` able to publish a whole change set atomically.
2. **A `CopperExec` Expo module** — ~150 lines of Kotlin wrapping
   `Runtime.exec` with a working-directory argument. Unlocks tier 1 on custom
   builds: real `sh`, real pipes, and — if the user installs a git binary —
   real git. The app already detects and prefers it.
3. **Incremental repo map** — cache outlines keyed by path + size + mtime so a
   second `map` of a big project is free.
4. **tree-sitter via WASM** — only worth it if a language routinely defeats the
   patterns (C++ templates, Scala, Elixir). Costs MB and startup time; the
   regex outline covers the languages this app's users actually ship.
5. **PTY-style interaction** — a real pseudo-terminal would allow `vim`, `top`,
   REPLs. Requires tier 1 plus a native PTY; the built-in shell is
   request/response by design.

---

## 10. Performance notes

- The repo map reads 6 files at a time; on the SAF tier that is the difference
  between 4 s and 20 s for a 300-file project.
- Terminal scrollback is capped at 4000 lines in memory and by
  `terminal.scrollback` in the UI; long output is truncated head+tail, never
  silently.
- All terminal animation (keyboard lift, entrance, press response) runs in
  Reanimated worklets — no JS-thread round trips, which is what keeps a 60 fps
  Android device feeling like a 120 fps one.
- The built-in shell is synchronous-ish JS; a pathological `find` over a huge
  granted folder is the only realistic way to make it noticeable, which is why
  the walk has a depth cap and a file cap.

---

**Files**

| Path | What lives there |
|---|---|
| `src/agent/tools.ts` | tool specs, dispatch, executor probe, `simulateShell` |
| `src/agent/fs.ts` | two-tier jailed file system, SAF resolution + cache |
| `src/agent/repomap.ts` | repo-map walk, formatting, caps |
| `src/agent/outline.ts` | pure per-language declaration patterns |
| `src/agent/danger.ts` | shared destructive-command classifier |
| `src/agent/github.ts` | REST connector, 9 tools, `cloneRepoIntoSandbox` |
| `src/agent/loop.ts` | plan parsing, tool loop, auto-continue, confirmation gate |
| `src/agent/confirm.ts` | pending-confirmation store |
| `src/components/TerminalView.tsx` | interactive REPL: scrollback, history, tab completion |
| `app/(tabs)/terminal.tsx` | Terminal tab: Shell / Agent-log modes |
| `app/settings/shell.tsx` | executor status, storage grant, terminal preferences |
| `app/settings/github.tsx` | token, repo/branch picker, pull into sandbox |
