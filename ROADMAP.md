# Copper — Plain-English Delivery Roadmap

> **Where we are now:** Copper has a real, Copper-branded arm64 runtime built from pinned Termux-derived sources, a native PTY bridge, a secure atomic installer, and a Terminal screen connected to persistent Copper Bash sessions. The source bootstrap and the Android installer have both been validated in CI.
>
> **What is not done yet:** a normal user APK still does not contain the verified runtime bundle, so it correctly shows **“runtime bundle missing”** rather than pretending Android's system shell is Copper Bash.

## How to read this roadmap

- `[x]` **Done and evidenced** — implemented and checked by a real build, CI run, or device/emulator test.
- `[ ]` **Still required** — not being represented as complete.
- **Current phase** is the next dependency-ordered work. We do not skip ahead and call an incomplete terminal “finished.”

---

## Phase 1 — Copper app foundation ✅

- [x] Copper brand, app identity, navigation, chat experience, provider settings, model selection, and usage tracking.
- [x] Cloud/API-model approach — no bundled local LLM models using the device's storage or RAM.
- [x] Agent file tools with a selected Android SAF workspace and path-jail checks.
- [x] Voice input and spoken replies where the platform supports them.
- [x] Clear confirmation for destructive agent file operations.
- [x] Separate manual-terminal and AI-tool boundaries in the app design.

**Meaning for you:** the ordinary Copper AI app foundation is already in place. The runtime work below adds a real local developer terminal without turning the AI into an unrestricted device shell.

---

## Phase 2 — Storage rules and safety contract ✅

- [x] **AI workspace:** restrict AI project/file work to the folder selected as `COPPER Projects`.
- [x] **Multiple projects:** support named project folders inside that selected workspace.
- [x] **Manual Terminal:** require the user to explicitly approve Android **All files access** before it can browse shared `/storage/...` locations.
- [x] Prefer `/storage/0123-4567/Download/COPPER Projects` on the removable SD card as the manual terminal's starting directory when it exists.
- [x] Keep the executable runtime and installed packages in Copper's private app storage, not on the SD card.
- [x] Preserve the SD card for projects, generated artifacts, downloads, exports, and user-visible files.

**Important Android reality:** arm64 compilation does **not** bypass Android sandboxing, SELinux, SAF/FUSE restrictions, or shared-storage execution limits. An unrooted device cannot safely run a full package runtime from `/storage/0123-4567/...`. The SD card is the project/data drive; Copper private storage is the executable Unix root.

---

## Phase 3 — Build a real Copper Runtime ✅

- [x] Adopt a Copper-branded, GPLv3-compatible, Termux-derived runtime approach without requiring the separate Termux app.
- [x] Pin the upstream Termux source revisions, Copper patches, architecture, package name, and runtime prefix.
- [x] Build a real arm64 (`aarch64`) bootstrap for Copper's `com.copper.chat` identity.
- [x] Run the focused native PTY compile/emulator preflight before the expensive source build.
- [x] Fix real upstream source-download failures with checksum-preserving, narrow repairs.
- [x] Successfully complete the full arm64 source-bootstrap build in CI: [run `33871619836`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/33871619836).
- [x] Retain the successful temporary bootstrap artifact and its manifest as build evidence.

**What this proves:** Copper produced its own arm64 runtime input from the pinned source recipe. It does **not** yet mean that every user APK includes that input.

---

## Phase 4 — Connect and verify the Android runtime ✅

- [x] Native pseudo-terminal (PTY): persistent process, terminal input/output stream, resize, Ctrl-C/process-group hangup, and exit events.
- [x] Copper Terminal UI connected to real persistent Copper Bash sessions — no one-shot Android `/system/bin/sh` is presented as a package terminal.
- [x] Atomic installer: verify manifest hash, extract to staging, restore safe symlinks/executable modes, validate required files, then promote to the live prefix.
- [x] Repair/remove controls, visible missing/ready/repair state, and runtime storage meter.
- [x] Bootstrap extraction respects the managed 2 GiB cap and uses a linear-time quota check.
- [x] Validate the exact successful arm64 artifact through the real Android installer in CI: [run `33914196546`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/33914196546).
- [x] Add a reusable verified-asset staging command that rejects mismatched ZIPs/manifests and refuses to stage the current non-publishable artifact as a release asset.
- [x] Make the earlier full-source-build provenance visible as a separate CI success check before installer validation begins.

### Why a source-build row can say “skipped” while runtime validation passes

The CI job **Copper Runtime arm64 source build (opt-in)** intentionally runs only for commits marked `[runtime-preflight]` or `[runtime-bootstrap]`. It is a long Docker/source build and must not be blindly repeated for every UI or installer change.

For runtime-asset validation commits, CI instead checks:

1. the prior source-bootstrap run finished successfully;
2. its exact commit, artifact name, artifact ID, and outer SHA-256 match the lock;
3. the ZIP inside the artifact matches its own JSON manifest;
4. the Android installer can install that exact ZIP.

So a **skipped** source-build row on an installer-validation commit means **“not requested again,” not “missing or failed.”** The separate green **bootstrap provenance** check is the direct evidence that the earlier source build is the one being consumed.

---

## Phase 5 — Make it usable on real arm64 phones **← CURRENT PHASE**

- [ ] Create a durable Copper-controlled delivery location for verified runtime ZIPs/manifests. The current successful CI artifact is temporary evidence, not an end-user download channel.
- [ ] Define the reviewed promotion record for an asset: source-build run, exact source commit, runtime ZIP SHA-256, manifest, retention, and Copper release version.
- [ ] Build an arm64 Copper device-candidate APK containing **only** a verified promoted asset — never silently substitute an upstream/Termux bootstrap.
- [ ] Install the candidate on a real arm64 Android phone and run `runsCopperBashThroughPtyOnArm64WhenBundled`.
- [ ] Confirm manually in Copper Terminal that Bash starts, accepts interactive input, streams output, handles Ctrl-C, and starts in the SD-card `COPPER Projects` directory after Android permission approval.
- [ ] Keep the UI honest if the bundle is absent, corrupt, mismatched, unsupported, or needs repair.

**Why the phone test is still needed:** GitHub's API-35 x86_64 emulator successfully validates the artifact and installer, but Android denies executing an app-private arm64 ELF through that emulator's native bridge. Copper therefore skips the arm64 Bash execution test there instead of falsely claiming that it ran. A real arm64 phone is the correct execution environment.

---

## Phase 6 — Safe package updates and the 2 GiB runtime budget

- [ ] Create Copper's own HTTPS package repository endpoint.
- [ ] Generate an offline archive signing key; publish only its public key/fingerprint and never commit the private key.
- [ ] Publish signed Copper package metadata and packages built from the documented source/patch inputs.
- [ ] Configure the runtime to use Copper's signed repository, not an unofficial or implied official Termux package service.
- [ ] Add managed package-operation preflight: show expected download/install impact before `pkg`/APT changes.
- [ ] Monitor active package operations and stop managed operations before the 2 GiB persistent runtime cap is crossed.
- [ ] Show a useful storage breakdown: installed packages, APT archives/cache, build cache, shell/user state, remaining budget.
- [ ] Make uninstall and cache cleanup reclaim space clearly.

**Cap wording:** this is an honest app-managed 2 GiB limit. Normal unrooted Android does not provide Copper a kernel-enforced per-directory quota, so Copper will not pretend otherwise.

---

## Phase 7 — SD-card project development workflow

- [ ] Add safe manual-terminal links/conveniences for the selected `COPPER Projects` tree.
- [ ] Preserve per-chat project selection and context across chats.
- [ ] Add an opt-in temporary internal build mirror only for tools whose executable dependencies cannot run from SD storage.
- [ ] Sync changed source files and artifacts back to the selected SD-card project.
- [ ] Guarantee temporary-mirror cleanup after success, failure, or cancellation.
- [ ] Test SD-card removal/ejection, low storage, bad paths, cancellation, and recovery.

---

## Phase 8 — AI project runner (separate from Manual Terminal)

- [ ] Keep AI operations restricted to the selected SAF `COPPER Projects` tree.
- [ ] Define an explicit workspace-runner capability manifest for AI commands.
- [ ] Do **not** expose the unrestricted Manual Terminal PTY to the AI tool registry.
- [ ] Add visible confirmation, command logs, artifact records, and cancellation behavior for AI actions.
- [ ] Test workspace escape attempts and permission/storage failure cases.

---

## Phase 9 — Release gate

Copper can call this a complete in-app local package terminal only when all of these are checked:

- [ ] A verified runtime asset is deliberately included in a Copper APK.
- [ ] Copper Bash, `pkg`, and `apt` execute on a real arm64 phone without the separately installed Termux app.
- [ ] At least one real package operation is performed through Copper's signed package repository.
- [ ] Interactive PTY sessions work through the visible Terminal UI, including input, output, resize, Ctrl-C, and cleanup.
- [ ] Runtime/package storage is measured and the 2 GiB managed limit is enforced honestly.
- [ ] AI workspace access remains jailed to `COPPER Projects`; broad manual terminal access remains a separately approved capability.
- [ ] GPL/source, notices, signing-key, and package-repository obligations are complete for all distributed artifacts.
- [ ] Physical-device, storage, package failure, and recovery tests pass.

---

## Current truth in one sentence

**Copper has a genuinely built and installer-validated arm64 runtime foundation; the next job is to promote that verified runtime into a durable, testable arm64 device build, then complete signed packages, live quota controls, and the separate AI workspace runner.**

For the detailed technical design, source provenance, and CI evidence, see [`docs/COPPER-RUNTIME.md`](docs/COPPER-RUNTIME.md).
