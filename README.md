# Copper — The agent that finishes the job.

A production-ready **AI agent app** for **iOS, Android and Web/PWA**, built with React Native + Expo (SDK 57). Any OpenAI-compatible model — wrapped in a Claude-style agent that plans, runs commands, reads & writes files, and verifies its own work.

- 🧠 **Agent mode** — dynamic thinking plans with AI-named steps, tool calling, auto-continue on token/tool limits
- 🖥️ **Terminal panel** — watch commands run live: command, output, exit status, one-tap copy
- 📁 **Project-safe file tools** — on Android, the AI is confined to a selected external/SD-card project workspace; the separate manual terminal can be granted all shared-storage access
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
| Storage file tools | ✅ sandbox | ✅ selected external/SD project workspace | — |
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
    fs.ts                jailed storage root (Android external / optional SAF grant)
  components/            design system (PressableScale, Sheet, AgentPanels, …)
  store/                 zustand + AsyncStorage persistence (settings, chats)
  theme/                 tokens, warm light/dark palettes, motion language
  utils/                 haptics facade, share/export, image, formatting, ids
public/                  PWA: manifest + service worker + icons
modules/copper-exec/     Android bridge: external-volume selection + shell cwd
scripts/                 web dist patcher (PWA head tags)
```

**Streaming:** `expo/fetch` (WHATWG streams over native networking) with an automatic non-streaming fallback, feeding a `<think>`-aware assembler that batches UI updates to a steady throttle. The agent loop reuses the same pipe per turn, executing tool calls and feeding results back until the task is done.

## Android external / SD-card storage

Copper does **not** need `termux-setup-storage` for its own workspace. A custom Android build locates `getExternalFilesDirs()` at launch, chooses a mounted removable card first, then falls back to Android’s primary **external** volume. The automatic workspace is the app-specific folder, for example:

```text
/storage/B1C2-3D4E/Android/data/com.copper.chat/files/   # removable SD card
/storage/emulated/0/Android/data/com.copper.chat/files/  # primary external storage
```

By default, **AI file tools and their exports require a project workspace selected through SAF** — for example `/storage/0123-4567/Download/COPPER Projects`. This is a hard boundary: the AI can create any number of named project folders within that workspace, but cannot use folders outside it. If the workspace is not selected, agent file operations stop with a clear setup message rather than silently using `/data/data/...`.

The **manual Terminal tab is separate**. It can be given Android’s special **All files access** from Settings, allowing commands *you type* to use device storage and mounted SD cards under `/storage/`. This permission never grants raw access to Android’s protected `/data` area, and it does not remove the AI workspace boundary. It is intended for personal/sideload builds; Google Play limits use of this permission.

**Need a different AI location?** In **Settings → Agent & storage**, select **COPPER Projects folder**. Android’s system picker opens at the removable card when it can; select an SD-card, Downloads, or Documents folder and Copper persists access through SAF. Turn off **Limit AI to selected workspace** only if you deliberately want the AI to use the automatic card-first app-specific external root.

> Android still keeps required app metadata such as settings, keys, databases, and OS caches in its protected internal app area. Moving those would make keys unsafe and is not supported by Android. The external-first guarantee applies to the user-visible workspace, terminal cwd, and exports.

## Privacy model

- API keys are stored in AsyncStorage **on device only** and sent only to the endpoint you configure.
- On Android, AI file tools are jailed to one project workspace folder you explicitly grant. The separately permissioned manual terminal can use shared storage only when you enable it. Every AI path is normalized and escape-checked.
- The app ships **zero analytics**. Export/import is user-initiated only.
- GPL-3.0-only licensed.

## License

GPL-3.0-only — see [LICENSE](LICENSE). Copper Runtime is planned as a GPLv3-compatible Termux-derived component; its required upstream and package notices, pinned sources, and implementation plan are documented in [docs/COPPER-RUNTIME.md](docs/COPPER-RUNTIME.md).
