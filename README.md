# Aurora — Private AI, on your terms.

A production-ready, offline-first AI chat app for **iOS, Android and Web/PWA**, built with React Native + Expo (SDK 57).

- 📴 **Fully on-device inference** — download compact GGUF models (Qwen, Llama, Gemma, Phi) and chat with **zero internet**, powered by llama.cpp (`llama.rn`).
- ☁️ **Hybrid engine** — or connect **any OpenAI-compatible API** (OpenAI, Groq, OpenRouter, Together, Mistral, DeepSeek, Ollama, LM Studio, llama.cpp server, vLLM…). Your keys, your choice.
- 🧠 **Reasoning-model aware** — `<think>…</think>` traces stream into a collapsible "Thinking…" block.
- ✨ **Premium mobile UX** — springy pressables, haptic vocabulary, blur headers, gesture-driven bottom sheets, swipeable conversation rows, streaming markdown with copyable code blocks, dark/light/system themes.
- 🔒 **Private by design** — no backend, no accounts, no telemetry. Chats, keys and model files live only on your device. One-tap JSON export/import.

<p align="center"><img src="assets/icon.png" width="120" alt="Aurora icon" /></p>

---

## Feature matrix

| | iOS | Android | Web / PWA |
|---|---|---|---|
| Chat, streaming, markdown, history | ✅ | ✅ | ✅ |
| On-device GGUF models | ✅ | ✅ | — (use APIs) |
| OpenAI-compatible APIs | ✅ | ✅ | ✅ |
| Installable app, offline shell | ✅ (native) | ✅ (native) | ✅ (service worker) |
| Haptics | ✅ | ✅ | — |

## Quick start (development)

```bash
npm install
npx expo start          # press i (iOS) / a (Android) with a device or simulator
```

- **Typecheck:** `npm run typecheck`
- **Native builds:** `npm run ios` / `npm run android` (prebuilds native projects via CNG)

## Getting a working brain (2 minutes)

1. Open **Models** tab → either:
   - **Download** an on-device model (e.g. *Qwen2.5 1.5B Instruct* ~1 GB) → works offline forever, **or**
   - **API providers** → pick a preset (Groq has a generous free tier; Ollama/LM Studio run on your own computer) → paste key.
2. Start a new chat → pick the model from the pill in the header → send.

## Install & build (no paid Apple account needed)

See **[docs/BUILD-AND-INSTALL.md](docs/BUILD-AND-INSTALL.md)** for the complete, honest, up-to-date matrix of free install paths:

- **PWA** (zero Apple involvement) — install from the GitHub Pages build, works on every iOS/Android browser.
- **Unsigned IPA CI pipeline** → sign on-device with **SideStore/AltStore** (free Apple ID, auto-refresh) or permanently with **TrollStore** (supported iOS versions).
- **Android APK** built automatically by CI (debug-signed release build) — sideload in one tap.
- **Termux** on-device build instructions for Android.

## CI/CD (already wired)

| Workflow | Trigger | Output |
|---|---|---|
| `android-apk.yml` | tag `v*` or manual | `Aurora-android.apk` artifact |
| `ios-ipa.yml` | tag `v*` or manual | `Aurora-unsigned.ipa` artifact |
| `web.yml` | push to `main` | GitHub Pages PWA deployment |
| `ci.yml` | every push/PR | typecheck + web & android bundle smoke-tests |

## Architecture

```
app/                     expo-router routes
  (tabs)/                chats · models · settings
  chat/[id]/             conversation screen
  settings/              api · generation · appearance · data · about
src/
  ai/                    engines
    remote.ts            OpenAI-compatible SSE streaming client + presets
    local/               llama.cpp (llama.rn) adapter, GGUF catalog, downloader
    session.ts           orchestrator: send/stop/retry/edit/regenerate/auto-title
    assembler.ts         <think>-aware streaming assembler (throttled paints)
  components/            design system (PressableScale, Sheet, Markdown, …)
  store/                 zustand + AsyncStorage persistence (settings, chats)
  theme/                 tokens, dark/light palettes, motion language
  utils/                 haptics facade, share/export, formatting, ids
public/                  PWA: manifest + service worker + icons
scripts/                 web dist patcher (PWA head tags)
```

**Streaming:** remote engines use `expo/fetch` (WHATWG streams over native networking) with an automatic non-streaming fallback; on-device engines stream tokens from llama.cpp. Both feed the same `<think>`-aware assembler that batches UI updates to a steady throttle.

## Privacy model

- API keys are stored in AsyncStorage **on device only** and sent only to the endpoint you configure.
- On-device models run in a local llama.cpp context — they make **no network requests**.
- The app ships **zero analytics**. Export/import is user-initiated only.

## License

MIT — see [LICENSE](LICENSE). Local model licenses are listed on each model card in the app (Apache-2.0, MIT, Llama Community, Gemma Terms).
