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

## Phase 5 — Feel & connection fixes ✅
- [x] Fix Gemini “not found”: Google’s OpenAI-compat base is `…/v1beta/openai` — the client no longer appends a second `/v1` to chat/models paths; live model listing now works and feeds the picker with the newest official ids
- [x] Refresh suggested models across providers (Gemini 2.5 Pro/Flash/Flash-Lite + 3.x previews, Claude Opus 4.5, Grok-4 family) — picker still live-syncs from `/models`
- [x] Manual model-id entry in the model sheet (preview / thinking variants not yet listed)
- [x] Animated splash (spring pop + ripple + wordmark, buttery dissolve) in `app/_layout.tsx`
- [x] Haptics reworked: single vibration per gesture, press-in dedupe window on Android, “every click” buzz removed (defaults to no haptic, opt-in per control)
- [x] Keyboard no longer overlaps the composer or follows you around: Android `adjustResize`, blur-dismiss on back/tab leave, KAV height behaviour + inset
- [x] Live context/token bar under the chat header (green → amber 70% → red 90%)
- [x] New-message entry animation (FadeInDown), smoother springs/easing presets, sheet + overlay polish
- [x] Settings regrouped into color-coded sections (Agent & models / Chat / App / About) with gradient active-engine card
- [x] Chats tab: prominent gradient “New chat”, empty-state CTA, tab cross-fade, keyboard-aware tab bar
- [ ] Built-in real Linux terminal (Termux-class) — not feasible inside a sandboxed APK without bundling a Linux userspace or a remote shell; see notes
- [ ] GitHub connector (clone/repo-aware coding from a repo) — design + OAuth/PAT flow documented, pending implementation

## Your calls still open
- Name "Copper" — keep or rename (one-line change + assets)
- Light theme as default (currently system-adaptive, light is the signature look)
