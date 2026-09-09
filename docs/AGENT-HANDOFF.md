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

### Repair staged in the working tree (not yet CI proven)

- `scripts/patch-copper-runtime-upstream.mjs` writes a deterministic pinned
  Perl patch, `packages/perl/0001-termux-exec-caret-x.patch`. On Android it
  uses absolute `TERMUX_EXEC__PROC_SELF_EXE` only to recognize a system-linker
  launch, then assigns `$^X` from preserved `PL_origargv[0]` (the actual Perl
  interpreter, including when the original target was `bin/cpan`).
- `CopperRuntimeSessions.environment()` supplies the same documented contract
  for the initial Bash, because native code intentionally invokes linker64
  before termux-exec can intercept that initial `execve`.
- `scripts/verify-copper-runtime-generated-inputs.mjs` fails closed unless the
  exact patch is present; `scripts/build-copper-runtime-bootstrap.mjs` fails
  unless compiled `bin/perl` contains `TERMUX_EXEC__PROC_SELF_EXE`.
- The direct-linker PTY test now asserts the target receives its own `argv[0]`,
  not linker64. The arm64 bundled-runtime instrumentation test then probes
  `copper-runtime-perl-caret-x:<prefix>/bin/perl`. It is intentionally skipped
  in x86_64 CI and is real-device/arm64 evidence only.

Do **not** remove or weaken the independent pinned `dpkg` repair: use the
`guillemj/dpkg` GitHub maintainer mirror and verify exact 1.22.6 revision
`b2f9600ead232a2dd3c27f8b52807a9ca5854d17` after clone. It fixes the earlier
Salsa transport failure, not this CPAN/runtime defect.

## Latest candidate CI result and follow-up source repair

- Candidate CI [run `34276222236`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/34276222236) for commit `0f81a07` passed TypeScript, Android/web smoke checks, and the
  native PTY compile/instrumentation gate. It then failed its arm64 source
  bootstrap; bundled installer validation and personal APK jobs were skipped.
  There is no new artifact.
- The source failure is not a Kotlin, C, archive, or Perl-patch compile failure.
  Its check annotations show `attr-2.6.0` repeatedly timing out at static
  `download-mirror.savannah.gnu.org` until curl exhausted its retry budget.
- The working-tree follow-up changes only `attr` and the next dependency,
  `libacl`, to `https://mirrors.ocf.berkeley.edu/nongnu/...`. Open Computing
  Facility is an active official Savannah mirror listed in the project's
  `releases/00_MIRRORS.txt`; both recipes retain their upstream pinned
  SHA-256 checksums, so the mirror changes availability only, not source trust.
- The official OCF endpoints were independently confirmed to return the expected
  `attr-2.6.0` and `acl-2.4.0` release streams. The package builder's existing
  SHA-256 verification remains the final byte-level acceptance gate.

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

These source changes require CI and physical-device evidence; do not call them
complete just because TypeScript passes.

## Checks already performed for the staged repair

| Check | Result |
| --- | --- |
| `node --check` for modified runtime scripts | Passed |
| Exact locked-source patch + `runtime:verify-inputs` | Passed against `/tmp/copper-runtime-patch-phase0-test` using pinned packages/app revisions |
| Perl patch application after perl-cross 1.6.4 preparation | Passed (perl-cross does not overwrite `caretx.c`) |
| `npm ci --ignore-scripts` + `npm run typecheck` | Passed |
| `npx expo prebuild --platform android --clean` | Passed; Expo emitted pre-existing configuration advisories only |
| `git diff --check` | Passed at the time of the Phase 0 candidate commit; rerun after the OCF mirror follow-up |
| Candidate CI `34276222236`: native PTY compilation/instrumentation | **Passed** on commit `0f81a07`, including raw Ctrl-C and direct-linker target-`argv[0]` coverage |
| Candidate CI `34276222236`: arm64 source bootstrap | **Failed** only at pinned `attr-2.6.0` download: static `download-mirror.savannah.gnu.org` timed out until curl exhausted its retry budget. No archive/APK was produced. |
| Local Gradle native compile | Not available: this sandbox has no Java/JDK; installing `openjdk-17-jdk-headless` failed because the Debian mirror was unreachable. This is an environment limitation, **not** a local compile pass; CI has now supplied native compilation evidence. |

## Required next actions

1. Re-run `npm run typecheck`, `node --check` for changed scripts, generated
   exact-lock patch/verify test, and `git diff --check` after the official OCF
   mirror follow-up. Confirm generated `attr` and `libacl` recipes retain the
   exact OCF URL plus original SHA-256 pins.
2. Commit/push the cohesive source-availability repair using **exactly one**
   `[runtime-device-candidate]` marker only after those preflights pass. The
   marker drives a fresh same-commit native compile, full arm64 source build,
   compiled-Perl gate, installer validation, and personal APK. Do not dispatch
   ordinary workflows; this integration returns 403 for manual dispatch.
3. Watch the candidate CI. If it fails, retrieve the retained failure log or
   inspect job/check annotations and fix the root cause before another marker.
   Do not rerun unchanged, use failed-run output as success evidence, or use the
   old APK.
4. If CI is green, give the user the new run/artifact ID and request only the
   Phase 0 physical checklist from `ROADMAP.md`: clean fallback bootstrap,
   normal send/input/output, Ctrl-C (`sleep 30`, wait for interruption),
   stale-session feedback, Terminal keyboard attachment, Chat overflow keyboard
   dismissal, and outside-tap/sheet animation.
5. Update this handoff and `ROADMAP.md` with real results. Phase 0 stays blocked
   until the user confirms every device row.

## Do not repeat these dead ends

- `34232466141` failed before same-run artifact creation; it is never an
  installable candidate.
- `34276222236` passed native validation but failed later on the static Savannah
  `attr` connection timeout; installer/APK jobs were skipped. Do not treat it as
  an artifact candidate or rerun its unchanged source URLs.
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
