# Aurora — Roadmap

Phase-by-phase plan. Small improvements are executed autonomously; items marked **⚑ YOUR CALL** need approval (design/major features).

---

## Phase 1 — Reliability & feel (in progress)
- [x] Engine status store — show "Loading model…" while llama.cpp warms up (instead of silent dots)
- [x] Time dividers between messages (>5 min gaps) — premium chat pattern
- [x] Chat search (title + message content) on the Chats tab
- [x] Friendly, actionable error mapping (401/402/404/429/5xx/timeout/LAN hints)
- [x] iOS ATS exception for LAN endpoints (so `http://192.168.x.x` Ollama/LM Studio works in release builds)
- [x] Free RAM on background: unload on-device model when app is backgrounded (mid-stream safe)

## Phase 2 — On-device AI hardening
- [ ] Download integrity: verify final size vs Content-Length; resume partial downloads
- [ ] Context usage meter (tokens used / context window) in chat header
- [ ] Model details sheet (file path, quant, params, source URL, load time, last tok/s)
- [ ] Warm benchmark on first load → show expected tok/s on the model card
- [ ] Auto-suggest context size based on device RAM
- [ ] Optional: keep model warm for N minutes in background before unload

## Phase 3 — PWA (the zero-friction iOS path)
- [ ] "Add to Home Screen" coach banner on iOS Safari (detects browser, guides install)
- [ ] PWA update toast ("New version — tap to reload") on service worker update
- [ ] ⚑ YOUR CALL: **WebLLM (WebGPU) on-device models in the PWA** — experimental, behind a flag; big win but heavy work

## Phase 4 — Distribution & release automation
- [ ] Push CI workflows (blocked on GitHub connection with `workflows` permission — files are committed locally)
- [ ] Release checklist: tag → APK + IPA artifacts + Pages deploy in one push
- [ ] Landing page with QR codes for PWA + artifact links

## Phase 5 — Delight (each is small-to-medium)
- [ ] ⚑ YOUR CALL: **Voice input + read-aloud TTS** (expo-speech is free/offline on-device)
- [ ] ⚑ YOUR CALL: **Image attachments for vision models** (API engines only)
- [ ] ⚑ YOUR CALL: **Rebrand?** (name "Aurora", icon, accent colors are placeholders — say the word and I'll re-skin)
- [ ] Prompt library (save/reuse prompts)
- [ ] Per-chat system prompt override
- [ ] Message-level token estimates before send

## Continuous (no permission needed)
- Strict typecheck stays at 0 errors; web+android bundle smoke tests before every push
- Keep iOS/Android/PWA feature parity except where platforms physically differ
- Dependency updates within SDK 57 line

---

## Decisions log (small things done without asking)
- Bottom sheets are a purpose-built Reanimated component (smaller, smoother than the heavy popular lib)
- Native HTTP streaming via `expo/fetch` with non-streaming fallback (older engines)
- Titles auto-generated via the *active remote* model only; local models use truncation (saves RAM)
- `Persist` versioning from day one (`aurora/settings/v1`, `aurora/chats/v1`) so future migrations are safe
