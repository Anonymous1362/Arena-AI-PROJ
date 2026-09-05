# Copper Runtime — Agent Handoff

Read this file before changing Copper Runtime, Terminal, CI, storage boundaries, or runtime delivery.

## Branch and merge rule

- **Working branch:** `arena/01a06159-arena-ai-proj`
- **Do not merge, release, tag, or open a pull request** unless the user explicitly asks.
- Commits on this branch are pushed and are the durable handoff mechanism. A future Agent Mode session can continue from this branch without needing the earlier chat transcript.
- Start every continuation with `git status -sb`, `git log --oneline -8`, and the current CI status.

## Product contract that must not be weakened

1. Copper is a **Copper-branded, GPLv3-compatible, Termux-derived** local runtime. Do not call it official Termux and do not require the separately installed Termux app.
2. The runtime is arm64-first and compiled for application ID `com.copper.chat` with prefix `/data/data/com.copper.chat/files/usr`.
3. Projects, artifacts, downloads, and exports belong on the removable SD-card workspace, normally `/storage/0123-4567/Download/COPPER Projects`.
4. Executable runtime files, package databases, symlinks, sockets, and installed packages stay in Copper private storage. Do not claim arm64 can make `/storage/...` executable on normal unrooted Android.
5. AI file/project tools remain jailed to the selected SAF `COPPER Projects` tree. The Manual Terminal is a separate user-approved capability and may access `/storage/...` only after Android All files access approval.
6. Copper has a strict **2 GiB managed persistent-runtime budget**. Bootstrap extraction is enforced now; managed live package-operation preflight/monitoring is still unfinished.
7. Never silently fall back to `/system/bin/sh` and call it a Copper package terminal.

## Verified evidence

| Evidence | Result | Why it matters |
| --- | --- | --- |
| Full arm64 Copper source bootstrap | CI run [`33871619836`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/33871619836) — passed | Copper produced a real `aarch64` bootstrap from pinned sources and Copper patches. |
| Bootstrap artifact | `copper-runtime-bootstrap-aarch64`, ID `9939259618` | Temporary verification input; it expires on 2026-09-18 and is not an end-user delivery channel. |
| Artifact envelope digest | `sha256:e1ded88255b22637683e2a32592ccbb0647e66ab86cc3b9ae6f9a769aa6b76de` | GitHub enclosing-artifact digest only; do not mislabel it as the contained runtime ZIP hash. |
| Installer + provenance validation | CI run [`33917070236`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/33917070236) — passed | Checks successful source-build provenance, artifact identity, contained ZIP/manifest relationship, temporary Android staging, atomic install, required files, symlinks, and executable modes. |
| Native PTY validation | Included in run `33917070236` — passed | Native C/JNI PTY compile and Android emulator transport test passed before the asset-installer job. |

## What is implemented

- `app/(tabs)/terminal.tsx` connects only to persistent native Copper Runtime sessions. It reports true missing/install/repair/ready state, streams output, accepts input/Ctrl-C, and does not portray Android system shell as Copper Bash.
- AI access is now **hard limited** to a user-selected SAF workspace: `src/agent/fs.ts` has no automatic-external fallback, `src/agent/tools.ts` exposes only the built-in workspace file shell, Settings has no opt-out, and settings migration v5 repairs any historical persisted `workspaceOnly: false`. The Manual Terminal's Android-approved shared-storage access remains separate.
- `modules/copper-exec/android/src/main/java/com/copper/copperexec/CopperRuntimeInstaller.kt` performs manifest hash verification, safe staged extraction, symlink restoration, required-entry validation, atomic promotion, repair/removal, and bootstrap quota enforcement.
- `CopperRuntimeSessions.kt` owns persistent Bash PTYs.
- `CopperExecModule.kt` starts the Manual Terminal at the removable volume's `Download/COPPER Projects` directory when present, after the explicit All files access grant.
- `scripts/build-copper-runtime-bootstrap.mjs` produces the verified bootstrap and manifest from pinned source.
- `scripts/stage-copper-runtime-android-assets.mjs` validates and atomically stages an already-supplied bootstrap ZIP/manifest for Android module assets. It has two modes:
  - `ci-validation` — only for temporary installer testing;
  - `release` — refuses a non-publishable manifest and refuses until a Copper HTTPS repo URL and public signing-key fingerprint are configured.
- `.github/workflows/ci.yml` has an opt-in `[runtime-asset-validation]` path. It requires a native PTY gate and a successful earlier source-bootstrap provenance attestation; it does not rerun the expensive source bootstrap unless a commit explicitly requests `[runtime-preflight]` or `[runtime-bootstrap]`.

## Important validation limitation

The API-35 x86_64 GitHub emulator can validate installer behavior for the real arm64 archive, but Android refuses to execute an app-private arm64 ELF through that emulator native bridge (`Permission denied`).

- The installer test is therefore valid and passing on x86_64 CI.
- `runsCopperBashThroughPtyOnArm64WhenBundled` is intentionally skipped on x86_64 CI.
- Actual Copper Bash PTY execution must be tested on a real arm64 Android device containing a verified runtime asset. Do not represent the emulator installer result as a successful Bash command execution.

## Current visible app state

No normal Copper APK currently embeds a verified runtime ZIP. The Terminal's `bundle_missing` state is correct. Do not claim the user can yet install packages from a standard released build.

## Current next phase — durable arm64 device delivery

Proceed in this order:

1. Establish a Copper-controlled durable runtime asset delivery/promotion process with immutable ZIP + JSON manifest provenance. Do not use the expiring GitHub Actions artifact as an end-user channel.
2. Complete the GPL/source and release-artifact obligations for distribution.
3. Configure Copper's HTTPS package repository and offline-generated signing key. Commit only the public key/fingerprint.
4. Promote only a verified, publishable runtime asset into an arm64 device-candidate APK.
5. On a real arm64 phone, run the Copper Bash PTY test and manually verify terminal input/output/Ctrl-C plus SD-card project start directory.
6. Add managed preflight/monitoring for live `pkg`/APT operations under the 2 GiB budget.
7. Add the remaining explicit workspace-runner manifest, action logs, confirmations, cancellation, and escape/failure tests without weakening the already-enforced SAF boundary or exposing the Manual Terminal PTY to AI tools.

## Commands worth running before a change

```bash
npm ci --ignore-scripts
npm run typecheck
node --check scripts/stage-copper-runtime-android-assets.mjs
npx expo export --platform android --output-dir /tmp/copper-android-smoke
git diff --check
```

For a source bootstrap only after the native gate and an investigated reason:

```bash
npm run runtime:upstream -- --dir /absolute/path/copper-runtime-source
npm run runtime:patch -- --workspace /absolute/path/copper-runtime-source
npm run runtime:verify-inputs -- --workspace /absolute/path/copper-runtime-source
npm run runtime:bootstrap -- --workspace /absolute/path/copper-runtime-source --out /absolute/path/copper-runtime-artifacts
```

## Do not repeat these dead ends

- Do not rerun a full bootstrap merely because a later installer/UI commit marks the opt-in source-build job as skipped.
- Do not substitute Debian or arbitrary upstream archives for the pinned Copper-built ZIP.
- Do not broaden the Savannah source-mirror patch without a real closure/failure reason.
- Do not claim the GitHub artifact-envelope digest is the runtime ZIP digest.
- Do not execute the arm64 runtime from external/shared/SD storage.
- Do not use an x86_64 Android emulator result as proof that arm64 Copper Bash executed.

For a user-friendly status view, see [`../ROADMAP.md`](../ROADMAP.md). For the technical runtime design and phase checklist, see [`COPPER-RUNTIME.md`](COPPER-RUNTIME.md).
