# Building & installing Copper — iOS and Android, the free ways

This document is the honest, complete playbook for getting Copper onto devices **without paying Apple anything**. Read the iOS section fully — it explains what is and isn't possible, because Apple's platform has rules no build trick can bypass.

---

## The 60-second summary

| Platform | Best free path | Effort | Lifetime |
|---|---|---|---|
| **Android** | CI-built APK → sideload | one tap | forever |
| **iOS (any version, zero Apple ID)** | **PWA from GitHub Pages** | one tap | forever, auto-updating |
| **iOS (native app, free Apple ID)** | unsigned IPA + **SideStore/AltStore** | moderate | 7-day cert, auto-refreshed |
| **iOS (EU, iOS 17.4+)** | AltStore PAL / marketplace path | n/a today | — |

> **Reality check:** every native iOS app in the world must be cryptographically signed by *some* certificate to launch. There is no compilation flag that removes this — it's enforced by the kernel. What the free paths do is either (a) skip native code entirely (PWA), or (b) get a *free* certificate and automate its renewal. Both are 100% free. Details below.

---

## 1. Android — trivial

### Option A: let CI build the APK (recommended)
1. Push a tag: `git tag v1.0.0 && git push origin v1.0.0` (or run **Android APK** from the Actions tab).
2. Download `Copper-android` artifact from the run.
3. Copy to phone, tap the APK, allow "install unknown apps" once. Done — installs like any app, runs forever.

The APK is a release build signed with the generated debug keystore (fine for personal/sideload use).

### Option B: build on-device with Termux
```bash
pkg update
pkg install nodejs-lts openjdk-17 git a-binutils
git clone https://github.com/Anonymous1362/Arena-AI-PROJ.git aurora && cd aurora
npm install
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

> `termux-setup-storage` only grants **Termux** access to Android storage. Copper does not depend on that grant: its Android build automatically uses its own app-specific folder on a removable SD card when one is mounted, otherwise primary external storage. See [the Android external / SD-card storage notes](../README.md#android-external--sd-card-storage) for the exact paths and optional folder picker.

Tip: phones need lots of RAM for Gradle — close other apps or add swap. CI (Option A) is usually faster.

---

## 2. iOS — Method A: PWA (zero cost, zero certificates, every iPhone)

The repo ships a first-class PWA build (service worker + manifest, offline app shell). This is the only path that involves **no Apple ID, no certificate, no sideloading, no expiry** — because it doesn't run native code; it runs the same JS app in a standalone Safari shell.

1. Push to `main` → the **Web / PWA** workflow deploys to
   `https://<user>.github.io/<repo>/`.
2. On any iPhone (or Android): open that URL in Safari.
3. **Share → Add to Home Screen**. Copper now launches full-screen from its own icon, keeps its data locally (AsyncStorage), works offline for the UI, and reconnects to whatever API you configured when you're online.

What you give up in the browser: on-device GGUF inference (browsers can't load llama.cpp). Everything else — streaming chat, markdown, providers like Groq/OpenRouter/Ollama, themes, export — is identical. (WASM/WebGPU on-device inference via wllama/WebLLM is a tracked roadmap item.)

**LAN-only mode:** you don't even need Pages — `npm run export:web && npx serve dist` on any computer serves the PWA on your home network.

---

## 3. iOS — Method B: the real native app, signed with a *free* Apple ID (SideStore / AltStore)

Free Apple IDs can create free personal signing certificates, valid for **7 days** per signing. Tools automate the renewal so it's effectively invisible:

### One-time setup
1. **Get an unsigned IPA**: run the **iOS unsigned IPA** workflow (Actions tab or tag `v*`) and download `Copper-ios-unsigned`. The IPA is built with code signing *disabled* — no certificates are involved at build time.
2. Install **SideStore** (recommended, refreshes without a computer) or **AltStore**:
   - SideStore: <https://sidestore.io> — pairs with your Apple ID, resigns *on-device*, and refreshes apps via a tiny VPN profile (data stays local; it's just the refresh mechanism).
   - AltStore: <https://altstore.io> — needs AltServer on a computer on the same Wi-Fi for refreshes.
3. Sign the IPA with your Apple ID (SideStore can sign IPAs directly; AltStore users: sideload the IPA via Sideloadly <https://sideloadly.io> or AltServer's custom-app option).
4. iOS Settings → General → VPN & Device Management → trust your developer profile.

### Living with the 7-day limit
- SideStore refreshes all your apps on a schedule automatically (background refresh via the VPN slot). You only re-enter the Apple ID password occasionally when Apple expires the free cert itself.
- Free Apple ID limits: 3 active sideloaded apps per device, 10 App IDs per week. Copper is 1 app — fine.

> iOS 17+ note: sideloading tools work, but first-time provisioning with a free account is smoother from a computer (Sideloadly/AltServer), then SideStore takes over renewals.

---

## 4. iOS — the official routes (not free, listed for completeness)

- **Apple Developer Program ($99/yr)** — TestFlight (external, 90-day builds) or Ad-Hoc (device UDID list, 1-year certs). The only "install once, never touch again, worldwide" option.
- **EU only (iOS 17.4+)**: alternative app marketplaces / web distribution for developers with verified entitlements — not relevant for personal free distribution today.

---

## Building the unsigned IPA yourself (macOS)

```bash
npm ci
npx expo prebuild -p ios
xcodebuild -workspace ios/Copper.xcworkspace -scheme Copper -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""
mkdir Payload && cp -r build/Build/Products/Release-iphoneos/Copper.app Payload/
zip -qry Copper-unsigned.ipa Payload
```
The CI workflow (`ios-ipa.yml`) does exactly this on GitHub's macOS runners.

---

## Local servers (fully offline chat without any cloud)

Copper speaks to anything OpenAI-compatible, including servers on your own network — no key, no internet:

```bash
# Ollama
OLLAMA_HOST=0.0.0.0 ollama serve
# llama.cpp
llama-server -m model.gguf --host 0.0.0.0 --port 8080
# LM Studio: start the local server, note the port
```
Then in Copper → Settings → API providers → pick the preset and enter your computer's LAN IP (e.g. `http://192.168.1.20:11434/v1`). iOS note: local-network HTTP needs the same Wi-Fi and (on the native app) the local-network permission.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Network request failed` on Groq/OpenRouter | Check base URL preset, key, and that the device has connectivity. Local servers: same Wi-Fi + correct LAN IP + `0.0.0.0` binding. |
| Model loads slowly / phone gets hot | Use smaller quants (0.5B–1.5B) and keep context ≤ 2048 on older devices. |
| SideStore "maximum of 3 apps" | Remove another sideloaded app — free accounts cap at 3 active. |
| "Unable to verify app" after signing | Trust the profile in Settings → VPN & Device Management, then reopen. |
| Expo prebuild fails | Delete `ios/`/`android/` and rerun with `--clean`. |
