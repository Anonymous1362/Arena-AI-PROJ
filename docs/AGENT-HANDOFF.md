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
7. Work only on arm64 runtime/Phase 0 unless the user explicitly changes scope;
   do not divert to web workflows.

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
  `sha256:f53a3a41b2b489329b8d3d6a8de0979977ce90cda009bdecb8c4467a3eb89a37`,
  retained until `2026-09-23T21:31:10Z`. It is only for the owner's physical
  test and is not a release.

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
| Candidate CI `34396030483`: complete same-commit chain | **Passed** on `da321a4`: native PTY compile/instrumentation, fresh arm64 source bootstrap and corrected CORE-libperl gate, bundled arm64 installation validation, and personal arm64 APK build/upload. |
| Local Gradle native compile | Not available: this sandbox has no Java/JDK; installing `openjdk-17-jdk-headless` failed because the Debian mirror was unreachable. This is an environment limitation, **not** a local compile pass; the complete candidate CI now supplies native compilation evidence. |

## Required next actions

1. Download `Copper-runtime-device-candidate` (artifact `10125842639`) from
   [run `34396030483`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/34396030483) before `2026-09-23T21:31:10Z`. Its outer GitHub artifact-envelope
   digest is `sha256:f53a3a41b2b489329b8d3d6a8de0979977ce90cda009bdecb8c4467a3eb89a37`.
   Install only its contained `Copper-runtime-device-candidate.apk`; the
   accompanying manifest/receipt identify the exact source-built runtime. Do
   not redistribute it or call it a release.
2. Request and record **only** the real-phone Phase 0 checklist from
   `ROADMAP.md`: clean fallback bootstrap, normal Send/input/output, Ctrl-C
   (`sleep 30`, wait for interruption before another command), stale-session
   feedback, Terminal keyboard attachment, Chat overflow keyboard dismissal,
   and outside-tap/sheet animation/haptics.
3. If the new physical candidate fails, obtain the exact visible error,
   screenshots, and reproduction steps; diagnose the actual failure before any
   next marker commit. Do not reuse either failed historical run or suppress a
   bootstrap/postinst error.
4. Update this handoff and `ROADMAP.md` with the real-device result. Phase 0
   stays blocked until the user confirms every device row.

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
