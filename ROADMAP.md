# Copper — Roadmap

**Direction locked:** API-models only (no on-device LLMs). Claude-style agent inside the app: dynamic thinking plan, tool calling, terminal panel, file tools, auto-continue. Warm editorial design.

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

## Your calls still open
- Name "Copper" — keep or rename (one-line change + assets)
- Light theme as default (currently system-adaptive, light is the signature look)
