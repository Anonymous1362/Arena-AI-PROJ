# Copper — Roadmap

**Direction locked:** API-models only (no on-device LLMs). Claude-style agent inside the app: dynamic thinking plan, tool calling, terminal panel, file tools, auto-continue. Warm editorial design.

---

## Phase 0 — The pivot ✅ (this update)
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

## Phase 3 — Delight (small, autonomous)
- [x] Voice input + read-aloud (shipped in Phase 1)
- [ ] Prompt library + per-chat system prompt override
- [ ] Export agent transcripts as markdown run logs
- [ ] Haptic refinement on plan-step completion

## Phase 4 — Copper Runtime (authorized; in progress)
- [x] Confirm GPLv3-compatible Termux-derived approach, Copper branding, arm64-first target, 2 GiB persistent runtime cap, and SD-card projects
- [x] Pin upstream source inputs and add reproducible source-preparation workflow
- [ ] Rebuild the Termux bootstrap and packages for `com.copper.chat`; do not use `com.termux` binaries unchanged
- [ ] Add GPL notices/source-release workflow for every bundled runtime/package artifact
- [ ] Add runtime installer, package storage meter/cap, and cleanup controls
- [ ] Replace the Android system-shell terminal with persistent PTY-backed Copper Runtime sessions
- [ ] Add optional temporary build mirror with guaranteed cleanup after builds
- [ ] Add a distinct workspace-bound agent runner; never expose unrestricted manual terminal sessions to the AI

See [Copper Runtime implementation plan](docs/COPPER-RUNTIME.md).

## Your calls still open
- Light theme as default (currently system-adaptive, light is the signature look)
