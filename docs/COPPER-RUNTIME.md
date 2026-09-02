# Copper Runtime — Android terminal implementation plan

**Status:** design and source inputs are pinned. Copper does **not** yet include the Termux-derived runtime, bootstrap archive, PTY bridge, or a Copper package repository. The existing Terminal tab still runs Android's small system shell and must not be described as a full Linux/package environment.

## Product decision

Copper will pursue a **Copper-branded, GPLv3-compatible, Termux-derived runtime**. It will be part of the Copper Android build and will not require the separately installed Termux app.

This document intentionally calls it **Copper Runtime**, not Termux. Termux is the upstream project; its name and branding are not used to imply endorsement.

## User-facing storage contract

| Data | Location | Why |
| --- | --- | --- |
| Copper projects, generated artifacts, downloads, exports | `/storage/0123-4567/Download/COPPER Projects` (or a folder the user selects) | Visible, removable SD-card storage. |
| Executable runtime, `pkg`/APT database, Bash, Node/Python/Git/compiler packages, libraries, sockets, symlinks, shell settings | Copper's private app directory, headed by `/data/data/com.copper.chat/files/usr` and `/data/data/com.copper.chat/files/home` | Android's shared and removable storage is `noexec` and does not provide the Unix filesystem features the runtime needs. |
| Future temporary build mirror | Private app storage, only when a user opts in to a build that needs executable project dependencies | It is synced back to the SD project and deleted after success, failure, or cancellation. It is not enabled by default. |

The initial product budget is **2 GiB maximum persistent runtime data**. This is a cap, not an initial download: a minimal architecture-specific bootstrap is much smaller, then usage grows when a user installs tools. Copper must show the exact package/cache/tool breakdown before and after installs, warn near the cap, and refuse an install that would cross it. `pkg uninstall` and runtime-cache cleanup must reclaim space.

A normal unrooted Android device cannot run a complete Termux-like runtime wholly under `/storage/...`, including removable SD cards. A portable SD card is therefore the project/data drive, not the executable Unix root.

## Licensing and source obligations

The full upstream `termux/termux-app` project is GPLv3-only. Its `terminal-emulator` and `terminal-view` libraries have Apache-2.0 exceptions, but those exceptions do not change the GPLv3 status of the complete application/runtime. See upstream `LICENSE.md`.

Before the first upstream source is imported, the Copper distribution must:

1. Be distributed under GPL-3.0-only (this repository is being converted to that license by product decision).
2. Retain copyright and license notices for Termux, `termux-shared`, terminal-emulator/view, and every bundled package.
3. Publish the exact Copper runtime source, patches, build scripts, bootstrap-generation inputs, and corresponding source for every distributed GPL-covered binary.
4. Build with a Copper package name and runtime prefix; do not ship binaries that assume `com.termux`.
5. Use a Copper package repository/metadata signed and maintained by this project. Do not claim official Termux package-repository support.

The pinned inputs are recorded in [`runtime/copper-runtime.lock.json`](../runtime/copper-runtime.lock.json). That lock records source revisions only; it does not vendor or redistribute the upstream source yet.

## Architecture

```text
React Native Copper UI
  ├─ Chat / selected AI workspace (SAF): COPPER Projects on SD
  ├─ Manual Terminal screen
  │    └─ Copper Runtime Expo native module
  │          ├─ Session manager with a PTY per terminal session
  │          ├─ Bootstrap installer (atomic staging -> prefix)
  │          ├─ Runtime storage meter and package-install guard
  │          └─ Persistent streaming stdout/stderr and resize/signal input
  └─ Agent command adapter
       └─ Separate, workspace-bound command/file API

Copper private runtime root
  ├─ files/usr        $PREFIX: executable packages and libraries
  ├─ files/home       shell config, package-user state, storage links
  └─ cache/runtime    removable package archives/build cache

Removable SD card
  └─ Download/COPPER Projects
       ├─ named-project-a/
       ├─ named-project-b/
       └─ artifacts/
```

The runtime must use an **architecture-specific arm64-v8a bootstrap** for the Redmi 9 class of device, rather than putting four ABI bootstraps in a universal APK. The installer must extract to a staging prefix, set executable modes/symlinks, validate the result, and atomically promote it—never run binaries from the SD card.

## Manual terminal vs. AI boundary

- **Manual Terminal:** a user-approved, persistent interactive shell. It has the installed Copper Runtime package environment and, after Android's All files access approval, shared-storage paths under `/storage/`.
- **AI project tools:** paths and generated artifacts are limited to the selected SAF workspace. The AI tool registry must not be given the manual terminal's unrestricted session/command API.

An app-level path guard is essential, but it is not a kernel-grade sandbox once the same Android app has broad storage access. Android does not provide a normal unrooted `chroot`/mount namespace that makes an arbitrary native shell both fully capable and provably confined to one externally selected folder. Copper must communicate this honestly and avoid presenting unrestricted shell access as a hard AI containment mechanism.

## Implementation phases

### R0 — Runtime source and compliance

- [x] Add GPLv3 `LICENSE`, third-party notices, and source-release instructions.
- [x] Add a reproducible upstream fetch workflow using the pinned revisions (`npm run runtime:upstream`).
- [ ] Establish a Copper package namespace and prefix (`com.copper.chat`) in the Termux package build configuration.
- [ ] Configure arm64-v8a-only debug/release builds and record expected bootstrap size.

### R1 — Bootstrap and package distribution

- [ ] Fork the bootstrap build inputs and produce a Copper-prefix arm64 bootstrap containing the minimal package manager, shell, core utilities, TLS/certificates, and storage-link setup.
- [ ] Host/version Copper package repository metadata and packages; add signature/key rotation policy.
- [ ] Add atomic first-run bootstrap installation, validation, repair, and removal.
- [ ] Add 2 GiB runtime quota accounting and install preflight checks.

### R2 — Actual terminal sessions

- [ ] Replace the one-shot `/system/bin/sh` API with a PTY session manager.
- [ ] Stream bidirectional terminal data; support terminal resize, Ctrl-C, foreground/background sessions, exit status, and scrollback limits.
- [ ] Connect the React Native Terminal UI to sessions without putting raw terminal output into normal chat messages.
- [ ] Expose a visible runtime status: missing, installing, ready, repairing, low storage, or error.

### R3 — SD projects and build ergonomics

- [ ] Create safe storage links to the selected `COPPER Projects` location for manual use.
- [ ] Add project selection and per-chat project context.
- [ ] Implement optional, consented temporary internal build mirrors for build tools whose project-local executable dependencies cannot run from the SD card.
- [ ] Sync changed sources/artifacts back to the SD tree and guarantee cleanup after success/failure/cancel.

### R4 — Agent integration

- [ ] Preserve the existing SAF file jail for AI file tools.
- [ ] Define a workspace-runner API with an explicit capability manifest rather than exposing the manual PTY.
- [ ] Add visible confirmation and command/artifact audit records for agent actions.
- [ ] Test escape attempts, storage ejection, cancellation, package failures, low disk, and process termination.

## Acceptance criteria for calling it a real runtime

Copper may say it has a full local package terminal only after all of the following are true:

1. `pkg`, `apt`, Bash, and a real package install execute in Copper without the Termux app being installed.
2. Terminal sessions persist and stream interactively through a PTY.
3. The runtime is built for Copper's package name/prefix, not copied prebuilt for `com.termux`.
4. Package/bootstrapping data is accounted for, capped, removable, and GPL/source compliant.
5. SD-card projects remain user-visible and editable; no executable binary is claimed to run from external storage.
6. Manual all-files terminal access and AI workspace access remain separate APIs with accurate UI wording.

## Sources consulted

- `termux/termux-app` `LICENSE.md` — GPLv3-only application license and Apache exceptions for the terminal libraries.
- `termux/termux-app` source revision `3b66f8799635a4dba4a206563048ff0e6792c487` — bootstrap installer, terminal modules, and native bootstrap embedding.
- `termux/termux-packages` source revision `e480d5053cdb260babda82d3d863393b70833c18` — package name/prefix build configuration.
- [Termux execution environment](https://github.com/termux/termux-packages/wiki/Termux-execution-environment) — external-storage execution constraints and prefix requirement.
- [Termux bootstrap maintainer documentation](https://github.com/termux/termux-packages/wiki/For-maintainers) — bootstrap build/distribution model and footprint details.
