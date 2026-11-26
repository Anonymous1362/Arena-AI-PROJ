# Copper Runtime — Agent Handoff

Read this file and [`../ROADMAP.md`](../ROADMAP.md) before changing Copper
Runtime, Terminal, CI, storage boundaries, or runtime delivery.

## Branch and collaboration rule

- **Session branch:** `arena/01a06159-arena-ai-proj`
- Do not merge, release, tag, or open a pull request unless the user explicitly
  requests it. Commit and push cohesive verified work on this branch; that
  commit history is the cross-agent handoff.
- Start each continuation with:

  ```bash
  git fetch origin arena/01a06159-arena-ai-proj
  git status -sb
  git log --oneline -10
  gh run list --branch arena/01a06159-arena-ai-proj --limit 10
  ```

- The user does not need to repeat ordinary prompts. They must provide physical
  device results, screenshots/logs, unpushed local work, or a different
  branch/commit when relevant.

## Product constraints that must not weaken

1. Copper is a **Copper-branded, GPLv3-compatible, Termux-derived** local
   runtime. Do not call it official Termux or require a separately installed
   Termux app.
2. Runtime target: `com.copper.chat`, arm64/aarch64,
   `/data/data/com.copper.chat/files/usr`, and
   `/data/data/com.copper.chat/files/home`.
3. Runtime executables, package databases, symlinks, and sockets remain in
   private app storage. Shared/removable storage is for projects/artifacts, not
   executable package files.
4. The Manual Terminal is a persistent user-approved PTY with Android All files
   access. AI tools remain independently restricted to the selected SAF
   `COPPER Projects` tree; do not expose the Manual Terminal API to the AI tool
   registry.
5. Copper has a 2 GiB **managed** private runtime budget. Bootstrap extraction
   is capped; package-operation preflight/monitoring remains later work.
6. Do not silently fall back to `/system/bin/sh` and call it Copper Bash.
7. The owner explicitly changed scope: complete the broader Copper app before
   returning to Terminal/runtime physical-device work. Preserve all Phase 0
   facts and unchecked rows; runtime/device release work remains blocked until
   the deferred final-hardening phone checklist passes.

## Active execution order after owner scope change

1. Audit and complete the broader app feature, quality, and test backlog now;
   use [`APP-COMPLETION-ROADMAP.md`](APP-COMPLETION-ROADMAP.md) as the active
   simple tracker.
2. Do not spend implementation cycles on the Terminal/runtime topic unless the
   owner re-prioritizes it or broader-app work directly depends on it.
3. The personal artifact from run `45476235786` is still a non-release
   candidate and will expire. At final hardening, issue a fresh same-commit
   candidate and perform every unchecked Phase 0 phone test before release.
4. Never call Phase 0, the runtime, or a product release complete merely
   because the terminal work was intentionally deferred.

## Prior CI evidence — accurate but insufficient for Phase 0

| Evidence | Result | Scope |
| --- | --- | --- |
| Fresh same-commit candidate chain | [`34241766195`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/34241766195), commit `2064665` — passed | Native compile/PTY gate, full arm64 source bootstrap, Android x86_64 installer validation, and personal APK construction. |
| Historical candidate artifact | `Copper-runtime-device-candidate`, ID `10067075336`, envelope digest `sha256:d857958f25da53e6c36e8774b3690c8b80604f99cb93f1b8b7e21b42de98b2ad` | Personal device-test artifact only; never a release. |
| Physical arm64 outcome | **Failed Phase 0** | Interactive Bash/type/Enter/output worked, but fallback bootstrap failed during `dpkg-perl` CPAN work. |

The x86_64 emulator proves archive/installer behavior only. It cannot execute
an app-private arm64 ELF through its native bridge, so it must never be cited
as successful arm64 Bash execution.

## Root cause: bootstrap failure on the real phone

The only eligible historical candidate starts Copper Bash, then its fallback
second-stage bootstrap reaches `dpkg-perl.postinst`:

```text
cpan -Ti Locale::gettext
/apex/com.android.runtime/bin/linker64 Makefile.PL
error: expected absolute path: "Makefile.PL"
```

Source diagnosis against the **exact lock**
`termux-packages@e480d5053cdb260babda82d3d863393b70833c18` established:

- The fault comes from `packages/dpkg/dpkg-perl.subpackage.sh`; Perl's own
  recipe does not run CPAN during cross-build.
- The second-stage script invokes `*.postinst` lexically, so `dpkg-perl` occurs
  before `termux-exec`. This remains a useful initialization fact but is not
  the repair being used: termux-exec's default direct preload variant already
  supports system-linker execution during installation.
- Android system-linker execution makes `/proc/self/exe` resolve to linker64.
  Perl 5.42.2 `caretx.c` uses that path for `$^X`; CPAN then tries to execute
  linker64 with a relative `Makefile.PL` argument. That is the direct cause.
- termux-exec already sets its absolute `TERMUX_EXEC__PROC_SELF_EXE`
  contract when it intercepts an app-private child. For a script launch that
  value can name the original script (for example `bin/cpan`), while Android's
  post-linker `argv[0]` is the real interpreter (`bin/perl`).

### Repair is CI-proven; real arm64 hardware remains the required evidence

- `scripts/patch-copper-runtime-upstream.mjs` writes a deterministic pinned
  Perl patch, `packages/perl/0001-termux-exec-caret-x.patch`. On Android it
  uses absolute `TERMUX_EXEC__PROC_SELF_EXE` only to recognize a system-linker
  launch, then assigns `$^X` from preserved `PL_origargv[0]` (the actual Perl
  interpreter, including when the original target was `bin/cpan`).
- `CopperRuntimeSessions.environment()` supplies the same documented contract
  for the initial Bash, because native code intentionally invokes linker64
  before termux-exec can intercept that initial `execve`.
- `scripts/verify-copper-runtime-generated-inputs.mjs` fails closed unless the
  exact patch is present. `scripts/build-copper-runtime-bootstrap.mjs` verifies
  a direct `bin/perl` launcher and the one direct shared
  `lib/perl5/.../CORE/libperl.so` member that actually contains `caretx.c`.
- The direct-linker PTY test now asserts the target receives its own `argv[0]`,
  not linker64. The arm64 bundled-runtime instrumentation test then probes
  `copper-runtime-perl-caret-x:<prefix>/bin/perl`. It is intentionally skipped
  in x86_64 CI and is real-device/arm64 evidence only.

Do **not** remove or weaken the independent pinned `dpkg` repair: use the
`guillemj/dpkg` GitHub maintainer mirror and verify exact 1.22.6 revision
`b2f9600ead232a2dd3c27f8b52807a9ca5854d17` after clone. It fixes the earlier
Salsa transport failure, not this CPAN/runtime defect.

## Candidate CI results and current archive-gate repair

- Candidate CI [run `34276222236`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/34276222236) for commit `0f81a07` passed TypeScript, Android/web smoke checks, and the
  native PTY compile/instrumentation gate. Its arm64 source bootstrap failed
  while `attr-2.6.0` repeatedly timed out at static
  `download-mirror.savannah.gnu.org`; bundled installer validation and personal
  APK jobs were skipped. There is no artifact.
- Commit `0c73a83` moved only `attr` and next dependency `libacl` to
  `https://mirrors.ocf.berkeley.edu/nongnu/...`. Open Computing Facility is an
  active official Savannah mirror listed in `releases/00_MIRRORS.txt`; the
  existing upstream SHA-256 values remain the final byte-level acceptance gate.
  Its endpoints were independently confirmed to return the expected release
  streams.
- Candidate CI [run `34365287051`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/34365287051) passed native validation and progressed beyond the source-download
  failure. The completed archive was then rejected by the post-build marker
  gate; installer/APK jobs were skipped and no artifact exists.
- That failure is a gate implementation bug, not evidence that Perl did not
  compile or that the patch did not apply. The pinned Perl recipe passes
  `-Duseshrplib`, and upstream `Makefile.SH` places `caretx.o` in
  `perllib_objs`, which builds `lib/perl5/.../CORE/libperl.so`. The old gate
  searched the thin `bin/perl` launcher for the source-marker string.
- The corrected repair requires `bin/perl` to be a direct ELF, then requires
  exactly one direct Android `CORE/libperl.so` archive member to be an ELF
  containing `TERMUX_EXEC__PROC_SELF_EXE`. It rejects a missing, ambiguous,
  non-ELF, or unpatched core library rather than accepting an unrelated archive
  member.
- Candidate CI [run `34396030483`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/34396030483) for commit `da321a4` passed native PTY validation, fresh arm64
  source build, corrected archive validation, bundled arm64 installer
  validation, and personal arm64 APK construction. No failure-diagnostic step
  ran. Its personal-device artifact is `Copper-runtime-device-candidate`, ID
  `10125842639`, envelope digest
  `sha256:f53a3a41b2b489329b8d3d6a8de0979977ce90cda009bdecb8c4467a3eb89a37`.
  Its 14-day retention elapsed before physical testing, so it is no longer
  available. It was only for the owner's test and never a release.
- Candidate CI [run `45428745456`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/45428745456) for reissue commit `cecdcb6` passed native PTY,
  TypeScript, Android/web smoke, and release-gate checks. It failed **before**
  the full bootstrap at focused `attr` preflight; installer/APK jobs were
  skipped. The new raw final-log annotations established the exact cause:
  `ERROR: NDK (/home/builder/lib/android-ndk-r29) not pointing at a directory!`
  The issue is floating `ghcr.io/termux/package-builder:latest` image drift,
  not `attr` source availability or a checksum failure: the pinned packages
  revision explicitly selects NDK r29 but the current latest image lacks it.
- The follow-up repair builds `copper-termux-package-builder:<pinned-revision>`
  from the **same exact pinned** checkout's `scripts/Dockerfile` and setup
  scripts, then supplies it through `TERMUX_BUILDER_IMAGE_NAME` to every
  focused preflight/full bootstrap. Its `setup-android-sdk.sh` downloads and
  SHA-256 verifies NDK r29. The repair is fail-closed: if the exact image cannot
  build, the bootstrap fails before it can use a floating image. Candidate CI
  [run `45464263481`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/45464263481), commit `001d7a8`, passed that former NDK/attr/libacl blocker.
- That same run then stopped at `termux-am` Gradle dependency resolution: many
  Maven Central POM requests returned HTTP `429 Too Many Requests`. It is a
  transient external Maven rate limit, not a source/compiler/NDK failure.
  Generated `termux-am` now runs one Gradle worker and retries only a log-proven
  Maven HTTP-429 failure up to five times with 30/60/120/240-second backoff;
  the retained Gradle cache is reused. A non-429 Gradle failure is immediately
  fatal. CI still emits bounded raw final log context; no validation is loosened.
- Candidate CI [run `45476235786`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/45476235786), commit `830f663`, passed the entire same-commit chain:
  native PTY, exact pinned builder image, fresh arm64 source bootstrap,
  installer validation, and personal arm64 APK construction. The green run
  passed `termux-am`; it does not claim that a 429 happened on that run. Its
  personal artifact is `Copper-runtime-device-candidate`, ID `14970840364`,
  envelope digest
  `sha256:0c6dd8b69244806f6ca941a79121dd3587e1d5397de769f25dd79ae2045fe0c8`,
  retained until `2026-12-08T22:10:17Z`. It is only for the owner's physical
  test and never a release.

## Terminal and mobile repair contained in candidate commit `0f81a07`

- Native exit detail is recorded before removing the active session, closing the
  remove→record race that surfaced as `Terminal session was not found`.
- Send errors remain beside the composer with one `Could not send:` presentation
  and strip Expo async bridge wrapper text; raw errors are no longer duplicated
  in the general terminal notice.
- Ctrl-C writes byte `0x03` through the active PTY. A new Android native test
  proves it reaches a foreground shell's INT trap and exits 130.
- Terminal disables the duplicate Android KeyboardAvoidingView padding (the app
  is already `softwareKeyboardLayoutMode: resize`) and removes stale navigation
  inset/tab-bar spacing while the IME is visible.
- `Sheet` now uses a full-screen native Pressable backdrop, dismisses the
  keyboard on open, keeps touch interception through close animation, and does
  not restart its opening animation when Android resizes after keyboard
  dismissal.

The required CI chain has now passed; physical-device evidence is still
mandatory. Do not call Phase 0 complete just because CI/emulator checks pass.

## Checks and candidate-chain evidence

| Check | Result |
| --- | --- |
| `node --check` for modified runtime scripts | Passed |
| Exact locked-source patch + `runtime:verify-inputs` | Passed against `/tmp/copper-runtime-patch-phase0-test` using pinned packages/app revisions |
| Perl patch application after perl-cross 1.6.4 preparation | Passed (perl-cross does not overwrite `caretx.c`) |
| `npm ci --ignore-scripts` + `npm run typecheck` | Passed |
| `npx expo prebuild --platform android --clean` | Passed; Expo emitted pre-existing configuration advisories only |
| `git diff --check` | Passed before commit `da321a4` |
| Candidate CI `34276222236`: native PTY compilation/instrumentation | **Passed** on commit `0f81a07`, including raw Ctrl-C and direct-linker target-`argv[0]` coverage |
| Candidate CI `34276222236`: arm64 source bootstrap | **Failed** only at pinned `attr-2.6.0` download: static `download-mirror.savannah.gnu.org` timed out until curl exhausted its retry budget. No archive/APK was produced. |
| Candidate CI `34365287051`: source build through archive validation | **Reached the final marker gate** after the OCF source repair; the old gate incorrectly searched thin `bin/perl` instead of the shared CORE `libperl.so` that contains `caretx.c`. Installer/APK were skipped; no artifact was produced. |
| Candidate CI `34396030483`: complete same-commit chain | **Passed** on `da321a4`: native PTY compile/instrumentation, fresh arm64 source bootstrap and corrected CORE-libperl gate, bundled arm64 installation validation, and personal arm64 APK build/upload. Its 14-day personal artifact has since expired. |
| Candidate CI `45428745456`: reissue | **Failed before full bootstrap** at focused `attr` preflight. Native PTY/typecheck/Android/web/release-gate jobs passed; installer/APK jobs were skipped. Raw check-log context proved the floating package-builder image lacked the pinned revision's required NDK r29 directory. |
| Builder-image compatibility repair | **Passed** in candidate CI `45464263481`: image from the exact pinned Dockerfile/setup scripts restored the locked NDK r29 and progressed beyond attr/libacl. |
| Candidate CI `45464263481`: termux-am preflight | **Failed** only while Gradle resolved legacy dependencies from Maven Central, which returned HTTP 429. Installer/APK jobs were skipped. |
| Generated termux-am HTTP-429 handling | Passed: exact-lock verifier and `bash -n` passed; a controlled Gradle double verified a 429 retries using retained cache and a non-429 failure stops at its first attempt. |
| Candidate CI `45476235786`: complete same-commit chain | **Passed** on `830f663`: native PTY, exact builder image, fresh arm64 source build, bundled arm64 installation validation, and personal APK upload. Artifact `14970840364` is retained until `2026-12-08T22:10:17Z`. |
| Local Gradle/native package compile | Not available: this sandbox has no Java/JDK or Docker daemon. This is an environment limitation, **not** a local compile pass; GitHub candidate CI supplies native compilation evidence. |

## Broader-app progress (2026-09-02)

- `src/store/chatImport.ts` now makes Data & privacy import a boundary: it
  accepts Copper full-backup and single-chat exports, constructs only the
  supported persisted conversation shape, drops malformed and duplicate
  conversation/message records, and strips raw tool-call payloads from replay
  tails. The UI reports records imported versus ignored.
- Importing a chat whose provider does not exist locally can no longer cause a
  silent fallback through another provider. Target resolution fails explicitly,
  while the chat send flow opens model recovery before mutating the transcript.
- Local evidence passed for this increment: clean `npm ci --ignore-scripts`,
  TypeScript typecheck, controlled sanitizer/duplicate-store/provider-resolution
  behavior tests, and an Expo web export. These checks do not replace later
  mobile UI interaction evidence.
- Provider follow-up: the Gemini preset now targets the OpenAI-compatibility
  root and URL construction recognizes that root without adding an extra `/v1`.
  The unsupported direct Anthropic preset was removed rather than advertising a
  protocol Copper does not implement. The model sheet now permits a user to
  persist/select a manual model ID for compatible endpoints that omit `/models`;
  changing a provider's endpoint, key, or headers drops only its stale model
  cache. TypeScript, controlled URL/cache behavior checks, and an Expo web
  export passed for this increment; actual credential/network/mobile flows
  remain required evidence.

## Required next actions

1. Start with a broader-app audit: inspect the current product surface,
   existing TODOs, untested flows, configuration, and CI evidence; then propose
   and execute cohesive feature/quality increments. This work is explicitly
   authorized outside the prior runtime-only scope.
2. Defer Terminal/runtime physical-device execution. Preserve the successful
   candidate evidence but expect artifact `14970840364` to expire; at final
   hardening create a fresh candidate rather than reusing an expired artifact.
3. When the owner returns to Terminal/runtime hardening, request and record the
   complete Phase 0 physical checklist from `ROADMAP.md`. If it fails, obtain
   the exact visible error, screenshots, and reproduction steps before a new
   repair/candidate cycle.
4. Update this handoff and `ROADMAP.md` with broader-app progress and eventual
   real-device results. The runtime/release gate remains blocked until every
   physical-device row passes.

## Do not repeat these dead ends

- `34232466141` failed before same-run artifact creation; it is never an
  installable candidate.
- `34276222236` passed native validation but failed later on the static Savannah
  `attr` connection timeout; installer/APK jobs were skipped. Do not treat it as
  an artifact candidate or rerun its unchanged source URLs.
- `34365287051` reached final archive verification after the OCF mirror repair,
  but was rejected by the old thin-`bin/perl` marker check. It is not evidence of
  an absent Perl patch and has no artifact; do not rerun its unchanged gate.
- `gh workflow run` is HTTP 403 here; use the controlled marker only after
  preflight evidence.
- `gh run download` of historical artifact `10067075336` returned GitHub/Azure
  Results Receiver `EOF`. Do not retry it unchanged or infer archive contents
  from the empty local download directory. The artifact is ~169 MB and must not
  be stored/committed in this workspace.
- Do not reapply `/tmp/copper-worktree-before-phase0-device-fix-20260908T201826Z/`;
  it is a discarded stale-worktree safety snapshot.
- Do not claim emulator installer success equals arm64 runtime execution.
- Do not suppress CPAN/postinst errors, loosen archive validation, or replace
  the pinned runtime with arbitrary Termux/Debian binaries.

For broader architecture and later delivery requirements, see
[`COPPER-RUNTIME.md`](COPPER-RUNTIME.md) and
[`BUILD-AND-INSTALL.md`](BUILD-AND-INSTALL.md). The roadmap is the current
physical-device gate; this handoff is the operational record.
