# Copper — The agent that finishes the job.

A production-ready **AI agent app** for **iOS, Android and Web/PWA**, built with React Native + Expo (SDK 57). Any OpenAI-compatible model — wrapped in a Claude-style agent that plans, runs commands, reads & writes files, and verifies its own work.

- 🧠 **Agent mode** — dynamic thinking plans with AI-named steps, tool calling, auto-continue on token/tool limits
- 🖥️ **Terminal panel** — watch commands run live: command, output, exit status, one-tap copy
- 📁 **File tools** — sandboxed read/write/list/delete inside the app sandbox or a user-granted folder (Android SAF), revocable
- ☁️ **Any provider** — Anthropic, OpenAI, Gemini (free tier), Groq, OpenRouter, Together, Mistral, DeepSeek, xAI, Ollama/LM Studio on your LAN, or anything OpenAI-compatible
- 👁️ **Vision** — attach images for multimodal models
- ✨ **Premium feel** — springy haptics, gesture sheets, swipeable rows, streaming markdown, warm light/dark themes
- 🔒 **Private by design** — no backend, no accounts, no telemetry. Keys and chats stay on-device.

<p align="center"><img src="assets/icon.png" width="120" alt="Copper icon" /></p>

---

## Feature matrix

| | iOS | Android | Web / PWA |
|---|---|---|---|
| Agent mode (plan + tools + terminal) | ✅ | ✅ | ✅ |
| Vision (image input) | ✅ | ✅ | ✅ |
| Storage file tools (granted folder) | ✅ sandbox | ✅ SAF grant | — |
| Installable app | ✅ (PWA / SideStore) | ✅ (APK) | ✅ |

## Quick start (development)

```bash
npm install
npx expo start          # press i (iOS) / a (Android) with a device or simulator
```

- **Typecheck:** `npm run typecheck`
- **Native builds:** `npm run ios` / `npm run android` (prebuilds native projects via CNG)

## Getting a working brain (2 minutes)

1. Open **Providers** tab → add a provider (Google Gemini and Groq have free API keys; OpenRouter covers everything else) → paste key.
2. New chat → pick a model from the pill in the header → send.
3. Toggle **Agent & storage** (Settings) to give it tools: terminal, file read/write, plans.

## Install & build (no paid Apple account needed)

See **[docs/BUILD-AND-INSTALL.md](docs/BUILD-AND-INSTALL.md)** for the complete, honest, up-to-date matrix of free install paths:

- **PWA** (zero Apple involvement) — install from the GitHub Pages build, works on every iOS/Android browser.
- **Unsigned IPA CI pipeline** → sign on-device with **SideStore/AltStore** (free Apple ID, auto-refresh). Works on current iOS versions.
- **Android APK** built automatically by CI (debug-signed release build) — sideload in one tap.
- **Termux** on-device build instructions for Android.

## CI/CD (already wired)

| Workflow | Trigger | Output |
|---|---|---|
| `android-apk.yml` | tag `v*` or manual | `Copper-android.apk` artifact |
| `ios-ipa.yml` | tag `v*` or manual | `Copper-unsigned.ipa` artifact |
| `web.yml` | push to `main` | GitHub Pages PWA deployment |
| `ci.yml` | every push/PR | typecheck + web & android bundle smoke-tests |

## Architecture

```
app/                     expo-router routes
  (tabs)/                chats · models · settings
  chat/[id]/             conversation screen
  settings/              api · generation · appearance · data · about
src/
  ai/                    engine layer
    remote.ts            OpenAI-compatible SSE client, tool calls, presets
    session.ts           orchestrator: send/stop/retry/edit/regenerate/auto-title
    engine.ts            target resolution + prompt packing
    assembler.ts         <think>-aware streaming assembler (throttled paints)
  agent/                 the agent
    loop.ts              tool-calling loop, [PLAN] parsing, auto-continue
    prompts.ts           master prompt (Claude-style behavior contract)
    tools.ts             tool registry: files + run_command
    fs.ts                jailed storage root (app sandbox / SAF grant)
  components/            design system (PressableScale, Sheet, AgentPanels, …)
  store/                 zustand + AsyncStorage persistence (settings, chats)
  theme/                 tokens, warm light/dark palettes, motion language
  utils/                 haptics facade, share/export, image, formatting, ids
public/                  PWA: manifest + service worker + icons
scripts/                 web dist patcher (PWA head tags)
```

**Streaming:** `expo/fetch` (WHATWG streams over native networking) with an automatic non-streaming fallback, feeding a `<think>`-aware assembler that batches UI updates to a steady throttle. The agent loop reuses the same pipe per turn, executing tool calls and feeding results back until the task is done.

## Privacy model

- API keys are stored in AsyncStorage **on device only** and sent only to the endpoint you configure.
- File tools are jailed to one storage root (app sandbox by default; a folder you explicitly grant). Every path is normalized and escape-checked.
- The app ships **zero analytics**. Export/import is user-initiated only.
- MIT licensed.

## License

MIT — see [LICENSE](LICENSE). Local model licenses are listed on each model card in the app (Apache-2.0, MIT, Llama Community, Gemma Terms).
