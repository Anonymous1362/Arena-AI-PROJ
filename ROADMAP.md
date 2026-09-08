# Copper — Roadmap

**Direction locked:** API-models only (no on-device LLMs). Claude-style agent inside the app: dynamic thinking plan, tool calling, terminal panel, file tools, auto-continue. Warm editorial design.

---

## Agent handoff protocol (read before starting work)

This file is the single shared source of truth for both the Arena coding agent and Claude (chat). Whoever picks up work next:

1. Read the most recent entries in **Phase 0 (re-opened) — Physical-device validation** (near the bottom) and any phase with unchecked `- [ ]` items — that's the current state, no separate status message needed.
2. Check items off (`- [x]`) only after actually building/running and observing real evidence (build output, log, screenshot) — never from assumption, per the no-fake-success rule this project already follows.
3. Add a new **dated round** under Physical-device validation instead of overwriting old rounds, so history isn't lost between handoffs.
4. If blocked, write exactly what's blocking and what's needed directly under the relevant item instead of leaving it silently unchecked.

---

## Phase 0 — The pivot ✅
- [x] Removed the entire local-LLM stack (llama.rn, GGUF catalog, downloader, model files) — no RAM/GPU/storage use
- [x] Rebrand: **Copper** — warm ivory/charcoal palette, terracotta accent, custom asterisk icon, zero "AI-slop" gradients
- [x] **Agent core**: master prompt (Claude-style behavior), `[PLAN]` protocol with AI-named steps, tool-calling loop, auto-continue on token/tool limits
- [x] **Tools**: read_file, write_file, list_dir, mkdir, delete_path, stat, run_command
- [x] **Terminal panel**: real-time command cards with output, exit status, copy — honest labels for real vs sandboxed shell
- [x] **Plan panel**: collapsible, per-step vector icons (pending/active/done), progress count, live step highlighting
- [x] **Storage sandbox**: app-private by default; user-granted folder (Android SAF) with revoke; jail-checked paths
- [x] **Image attachments** for vision models (Gemini/Claude/GPT/Grok) via + button
- [x] Categorized model panel per provider with live model lists
- [x] Provider presets: Anthropic, OpenAI, Gemini, Groq, OpenRouter, Together, Mistral, DeepSeek, xAI, Ollama/LM Studio (LAN), custom

## Phase 1.5 — Polish & tracking ✅
- [x] Custom SVG icon set (`Icons.tsx`): 25+ hand-drawn glyphs — send arrow, paperclip, stop, chevrons, terminal, wrench, plan, brand asterisk — used in composer, tab bar, agent panels, empty state
- [x] Android smoothness: BlurView replaced with solid translucency on Android (blur was the jank source), explicit native screen transitions (slide_from_right / modals slide_from_bottom), swipe-back gestures enabled, removeClippedSubviews on long chats
- [x] Provider pricing categories: Free tier (Gemini, Groq, Cerebras) / Free+paid (OpenRouter, Mistral) / Pay-as-you-go / Your-machine (Ollama, LM Studio) — badges in the picker
- [x] Live usage tracking: rolling 1h/24h request windows, tokens today/7d, per-provider breakdown, editable soft limits, SVG bar charts, lifetime totals (Usage & limits screen + Providers summary card)

## Phase 1 — Agent hardening & voice ✅
- [x] **Confirm-before-danger**: sheet asks permission for `delete_path` / `rm -rf` (toggle in Agent settings); denial is fed back to the agent so it adapts
- [x] **Transient-error auto-retry**: one silent retry on 429 / 502 / 503 (4s for rate limits) when nothing streamed yet — long agent runs survive rate limits
- [x] **Run stats per message**: tool-run count chip + duration + tokens in the bubble footer
- [x] **Shell status chip**: Agent & storage screen shows `native · full access` vs `sandboxed built-ins` with a status LED
- [x] **Voice input (approved)**: on-device dictation via expo-speech-recognition (mic button with pulsing state; Web Speech fallback on PWA; feature-detected — button hides if unsupported)
- [x] **Read-aloud (approved)**: on-device TTS (expo-speech) — "Read aloud" / "Stop reading" in message actions + auto-read-every-reply toggle; markdown stripped before speaking

## Phase 2 — Distribution
- [ ] Push CI workflows (local commit ready; needs GitHub reconnect with `workflows` permission)
- [ ] v1.0 tags → APK + unsigned IPA artifacts + PWA deploy
- [ ] iOS install guide stays PWA-first; SideStore path documented (no TrollStore)

## Phase 3 — Delight ✅
- [x] Voice input + read-aloud (shipped in Phase 1)
- [x] Prompt library + per-chat system prompt override
- [x] Export agent transcripts as markdown run logs
- [x] Haptic refinement on plan-step completion

## Phase 4 — Workspace UX ✅
- [x] copper-exec native bridge detection with safe built-in fallback
- [x] Dedicated terminal history tab
- [x] Project folders for grouping conversations
- [x] Generated artifact panel in agent replies
- [x] Animated plan timeline and responsive interaction motion
- [x] Android/iOS keyboard-safe chat composer
- [x] Correct Gemini OpenAI-compatible endpoint

## Phase 5 — Feel, terminal & coding agents ✅ (this update)

**Providers & models**
- [x] Fixed Gemini "not found": the model-list URL regex missed the OpenAI-compatible base, so requests went to `/v1/models` instead of `/v1beta/openai/models` — replaced with `modelListUrls()` + `normalizeBase()` self-healing, and a settings migration that repairs the truncated base URL already persisted on device
- [x] Catalog refreshed to the current official model IDs: Gemini 3.7/3.6/3.5-flash, 3.5-flash-lite, 3.1-pro-preview, 3.1-flash-lite, 2.5 pro/flash/flash-lite · OpenAI gpt-5.6 sol/terra/luna · Anthropic claude-fable-5 / opus-5 / sonnet-5 / haiku-4-5 · xAI grok-4-6 / 4-5 / code-fast-1 · DeepSeek chat/reasoner · Mistral medium-3.5/small-4 · Groq gpt-oss-120b, kimi-k2, qwen3.6-27b, compound · OpenRouter glm-5.2, deepseek-v4-flash
- [x] Per-family context windows and max output (1M in / 64K out for Gemini 3.x, 1M for Claude 5, 2M for grok-code) replace the old hardcoded 32K
- [x] Thinking levels done properly: Gemini 3.x `thinking_level` (the API equivalent of the Gemini app's "extended thinking"), Gemini 2.5 `thinking_budget`, OpenAI `reasoning_effort` — exactly one is sent (the docs forbid both), and a 400 that mentions the extension triggers a strip-and-retry so the request still lands
- [x] New **Models** settings screen: active model, thinking level with per-family notes, thinking-panel toggle, context window override, auto-compact threshold, live catalog reference

**Chat tab is a chat**
- [x] The Chat tab now *is* the conversation: embedded `ChatSurface` with the library as a left-edge drawer (drag-to-dismiss, grouped, staggered entrance). List-first mode still available in Appearance → Chat tab

**Keyboard (Android edge-to-edge)**
- [x] `adjustResize` + `softwareKeyboardLayoutMode: resize` in app.json
- [x] `useKeyboardInset()` measures the real IME frame on the UI thread, subtracts the bottom safe area, and detects window auto-resize so content is never lifted twice
- [x] Ducked UI now clears the floating tab bar (`tabBarClearance`) — the composer and terminal prompt are no longer behind it
- [x] `KeyboardGuard` dismisses the IME on any route/tab change and on backgrounding (opt-out in Motion & interaction)
- [ ] **Reopened 2026-09-09**: Terminal tab composer inset doesn't match Chat tab composer inset (visible grey gap above keyboard on Terminal only) — see "Phase 0 (re-opened)" below, Round 1, item 4

**Motion & haptics**
- [x] Splash animation on open (`SplashGate`) — staged reveal, not a hard cut
- [x] Motion vocabulary (`Durations` / `Ease` / `Spring`) + user-selectable motion level (reduced / balanced / full) with a live preview
- [x] Haptics rebuilt around events and levels (off / subtle / standard / rich) with coalescing and a per-gesture fired-guard — the "buzzes on every tap, sometimes twice" bug is gone
- [x] Animated segmented control (sliding pill) — one change, every settings screen feels it
- [x] Per-tab tints, sliding tab pill, staggered list entrances, cross-fading chat/list modes

**Settings, split up and coloured**
- [x] Hub rebuilt into four tinted groups (Model · Agent · Experience · Data) with a hero card showing the active model, provider, thinking level, window, agent status and compact threshold
- [x] Five new screens: **Appearance** (accent grid, theme previews, text size sample), **Models**, **Motion & haptics** (event test grid), **GitHub**, **Shell & sandbox** — each with its own tint, hero tile and section cards

**Terminal — built in, no Termux**
- [x] Interactive REPL (`TerminalView`): scrollback (setting-honoured), command history with up/down, **tab completion for commands and paths**, quick-command chips, copy-session, and "Ask the agent" which hands the transcript to a new chat
- [x] Two modes in the tab: **Shell** and **Agent log** (every command the agent ran, with real output and exit status)
- [x] Built-in shell grew: `map`, standalone `sort` / `uniq`, updated `help`
- [x] Executor status is honest everywhere: native `copper-exec` probe vs built-in JS shell, with a status LED and plain-language settings copy

**Coding-agent capabilities**
- [x] **Repo map** — Aider/OpenCode-style orientation without tree-sitter (which would need native modules per language): pure regex declaration outline (`outline.ts`) + tier-aware walker (`repomap.ts`), exposed as the `repo_map` tool and the `map` shell command
- [x] Agent prompt updated: orient with repo_map first, read before write, verify your own work with the project's real check, and never claim success you didn't observe
- [x] **Git safety**: stay on the branch, diff before/after, never force-push or rewrite published history, never commit unless asked
- [x] Shared danger classifier (`danger.ts`) — the agent and the terminal confirm the *same* commands (`rm`, `git reset --hard`, `git clean -f`, `push --force`, `dd`, fork bombs, `curl | sh`, `delete_path`, `github_delete`, …); denials are fed back to the model so it adapts
- [x] `executorReal` is no longer hardcoded false — the prompt reports the actual shell tier
- [x] **GitHub connector** (pure REST, no git binary): 9 tools — status, repos, tree, read, write (commit with blob-sha fetch so updates can't silently conflict), delete, code search, issues, PRs; repo + branch pickers, connection test with rate-limit readout, and "Pull repo into sandbox" (≤400 text files, ≤512 KB each) with live progress
- [x] `docs/TERMINAL-AND-CODING-AGENTS.md` — the honest write-up: why not Termux / WebContainers / a downloaded toolchain, what the two executor tiers do, the repo map's limits, the connector's limits (no object database, no local-diff commits), and the ranked upgrade path

## Phase 5.1 — device storage, artifacts & the Claude-style plan ✅ (this update)

- [x] **All-files-access storage tier** (`MANAGE_EXTERNAL_STORAGE`, still no root): real paths on internal *and* removable SD (`/storage/0123-4567/…`), alongside the SAF folder picker; one shared jail for agent + terminal, volume detection, verify flow, three root cards in Shell & sandbox
- [x] **Artifacts in chat**: file chips under the message that wrote them (zip → save/share on tap; md/txt/code → pull-down reader sheet with a three-dot save menu), plus a per-chat Files sheet for everything produced so far
- [x] **zip_dir tool** + dependency-free ZIP writer (store method, CRC32, verified against Python's zipfile); saves straight into `Download/` when allowed, share sheet otherwise, browser download on web
- [x] **Syntax highlighting** without dependencies: cached-regex lexer for 12 language groups, theme palettes for light/dark, used in code blocks and the file reader
- [x] **Claude-style plan**: square hand-drawn glyph tiles per step kind (code/write/read/run/find/craft), connector line that draws downward as steps complete, tap a step → sheet with the exact commands/tools it ran
- [x] **Model failover**: 404/429/503 automatically retries the provider's next recommended model, with a toast naming the swap
- [x] **Project folders**: `projects/<name>/` per chat (toggleable back to free organisation), workspace & deliverables rules in the system prompt (show code in chat, zip on request, stay inside the root)
- [x] De-Aurora'd: legacy `AuroraExec` probes removed (CopperExec only), the agent introduces itself as Copper, package renamed `copper`
- [x] Toast system for action feedback (saved paths, grants, copies)

## Phase 6 — terminal power: ANSI, plugins, `pkg`, symbol index ✅ (this update)

The four items previously declined as impossible got their honest-maximum
on-device equivalents instead of being left on the list:

- [x] **ANSI/VT-100 renderer** (`src/terminal/ansi.ts` + `AnsiText`): SGR 16/256/truecolour, bold/italic/underline, OSC + cursor-noise stripping, `\r` progress overwrites; interactive terminal runs in colour (`ls`/`tree`/`grep`), the agent's context never sees escape codes
- [x] **`modules/copper-pty`** — optional native module (auto-linked by `expo prebuild`, invisible in Expo Go): real `/system/bin/sh` exec (tools.ts probes it, run_command upgrades itself) + piped interactive sessions (`spawn/write/output/alive/kill`) for REPLs; labelled honestly as *not* a PTY — `vim`/`htop` need an NDK `forkpty()` follow-up
- [x] **Plugin system** (`src/agent/plugins.ts`): JSON manifests in `.copper/plugins/` adding shell aliases, syntax language packs (`registerLanguage` in the highlighter) and quick-chips; `plugin list|create|reload|enable|disable` builtins — the agent can write its own plugins. Runtime-code plugins remain impossible (sealed Hermes bundle + W^X) and the docs say so
- [x] **`pkg` package manager** (`src/agent/pkg.ts`): bundled pure-JS tools — `jq`, `bc`, `seq`, `tr`, `cut`, `rev`, `nl` — installed instantly/offline into `.copper/pkg.json` and hot-registered into the shell; downloading native binaries stays impossible on non-root Android
- [x] **Outline v2 + symbol index** (`src/agent/symindex.ts`): comments/strings masked before declaration matching (no more false positives from docblocks), outlines cached by content fingerprint (incremental repo-map), JS/TS import graph (`deps` builtin, `repo_map graph:true`), declaration search (`sym <name>` builtin)
- [x] Docs: §9 of `docs/TERMINAL-AND-CODING-AGENTS.md` rewritten from "upgrade wishlist" to "delivered + remaining honest limits"

---

## Phase 0 (re-opened) — Physical-device validation

Re-opened 2026-09-09 because a physical-device smoke test surfaced real bugs and one unresolved provenance question. **Do not mark this phase closed again until every item below is checked with real evidence.**

### ✅ RESOLVED — tested APK was built from the old `v1.0.0` tag, not current code

Root cause confirmed by comparing tags, not just guessed:

| Tag | Commit | Date (UTC) | Contains |
|---|---|---|---|
| `v1.0.0` | `70aa4d1` | 2026-09-02 02:31 | Phase 1 + CI/CD + Phase 3 **only** — predates Phase 4, 5, 5.1, 6 entirely |
| `v1.1.0` | `9b40aab` | 2026-09-02 10:31 | Everything through Phase 6 (Termux removal, `copper-pty`, keyboard-inset rework, ANSI terminal, all of it) |

The 161 MB APK almost certainly came from **`v1.0.0`**. That explains both open questions at once:
- **The Termux bootstrap / `writeRuntimeSession` output** — real leftover behavior from the original pre-Phase-5 terminal implementation (PR #1's install docs even mention "Termux" as a build path). It was fully replaced in Phase 5/6, which `v1.0.0` predates. Not a live bug — just old code.
- **"2 artifacts in the workflow section"** — pushing any `v*` tag fires **both** `android-apk.yml` and `ios-ipa.yml` simultaneously (each uploads exactly 1 artifact). Landing on the `v1.0.0` tag's checks page shows both runs together — 2 artifacts, only one of which (`Copper-android`) is Android's.

**Action, Android-only (per user's request, not touching iOS/web tags):**
- [ ] Don't reuse `v1.0.0` or cut a new tag (a new tag re-triggers iOS + web too). Instead, run `android-apk.yml` via **workflow_dispatch** directly off `main` — Actions tab → Android APK → Run workflow → branch `main`.
- [ ] Download the resulting `Copper-android` artifact, reinstall over the old APK, and re-run every check in Round 1 from scratch — Round 1's results below are against Phase-3-era code and don't reflect current keyboard/terminal work either way.

### ⚠️ New — user reports a failed Android workflow run (2026-09-09), log not yet captured

Claude has no GitHub Actions run/log API in its current toolset (only repo contents, commits, tags, PRs) — could not pull the failure output directly. Needs the actual error text pasted in, or Arena agent (which can run this locally) to reproduce.

- [ ] Paste the failing step name + error output from the run into this section (or have Arena agent fetch it) so the next pass can diagnose instead of guess
- [ ] Once logged: common failure points for *this exact* `android-apk.yml` pipeline (Node 22 + `expo prebuild -p android --clean` + `gradlew assembleRelease`, all Android-scoped, no iOS/web involved) worth checking first — Gradle/AGP version drift after `prebuild --clean` regenerates `android/`, a native module (`copper-pty`) missing an Android manifest entry or failing to autolink, `--no-daemon` OOM against the 4g heap cap, or a dependency lockfile mismatch surfacing only in `npm ci`'s stricter install

### Round 1 — 2026-09-08/09 (tested by user, physical arm64 phone)

- [x] **1. Terminal typed input & send** — multi-char commands, special characters, edit/backspace, and send all work; live bash output returns correctly. (One "syntax error near unexpected token `newline`" appeared from an unescaped `(` mid-input — that's correct bash parsing behavior, not a bug. No action needed.)
- [x] **2. Session lifecycle** — reported working, but `exit` doesn't actually appear anywhere in the captured session log. Needs a clean re-capture (screenshot or copied transcript) showing `exit` → next command before this can be marked fully confirmed.
- [ ] **3. Interrupt handling** — inconclusive. Several bare Ctrl-C presses appear in the log, but `sleep 30` was never actually run beforehand. Retest: run `sleep 30`, wait ~3 seconds, send Ctrl-C, confirm the prompt returns immediately rather than after the full 30s.
- [ ] **4. Keyboard occlusion** — failed, 3 distinct bugs:
  - [ ] Terminal tab composer sits noticeably higher than the keyboard with a visible grey gap between them; the Chat tab composer sits flush with no gap. Likely a `useKeyboardInset()` / `tabBarClearance()` value applied correctly on Chat but not (or double-applied) on the Terminal composer — diff the two composer components directly.
  - [ ] Chat tab: opening the header's overflow (⋮) menu while the keyboard is open shows the chat-settings sheet on top of the keyboard, with no input field reachable underneath. The sheet needs to dismiss/blur the IME on open, the way `KeyboardGuard` already does on route/tab change.
  - [ ] No sheet/panel dismisses on outside-tap (tapping the background scrim) anywhere tested — only swipe-down or an explicit close button works. Check the shared bottom-sheet/modal component for a missing backdrop-press handler; this is likely one shared component, so one fix should cover every panel.
- [x] **5. Pull-down/panel open, drag, dismiss animation** — smooth, no jump or glitchy closure. Confirmed working.

**Next agent picking this up:** Round 1 was run against `v1.0.0` (pre-Phase-4/5/6 code) — confirmed, not suspected, now. Items 1, 2, 5 (input/send, session lifecycle, panel animation) are still reasonably good signal since that plumbing hasn't changed much. Items 3 (interrupt) and 4 (keyboard occlusion) must be fully retested on a `main`-built APK before doing any fix work — Phase 5 already touched keyboard insets once and item 4's Terminal-vs-Chat composer gap may or may not still exist post-Phase-5.

---

## Your calls still open
- Name "Copper" — keep or rename (one-line change + assets)
- Light theme as default (currently system-adaptive, light is the signature look)
