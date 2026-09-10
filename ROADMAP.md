# Copper Runtime — Device Readiness Roadmap

> **Current gate: Phase 0, real arm64 phone stabilization.** Copper has a
> Copper-branded arm64 runtime built from pinned Termux-derived sources, an
> atomic installer, and a persistent native PTY. It is **not** device-ready or
> releasable until the physical-phone checklist below passes without bootstrap,
> session-lifecycle, keyboard, or panel-dismissal failures.

This is the durable product/status tracker for work on
`arena/01a06159-arena-ai-proj`. Read `docs/AGENT-HANDOFF.md` before changing
runtime code, native terminal code, CI, or this checklist.

## Status vocabulary

- **CI source/build evidence** proves a specific source tree built and the
  Android installer accepted its artifact. It does not prove first-launch
  postinst behavior on arm64 hardware.
- **Physical-device evidence** is required for a real Copper Bash claim.
- **Candidate** means a personal, non-release APK artifact. It never means a
  public runtime distribution, package update channel, or replacement for a
  release/source-delivery process.

## Non-negotiable runtime contract

- Copper is a GPLv3-compatible, Copper-branded, Termux-derived runtime; it
  does not require or impersonate the separately installed Termux app.
- The runtime is built for `com.copper.chat`, arm64 (`aarch64` / `arm64-v8a`),
  and `/data/data/com.copper.chat/files/usr`.
- Executable packages live in Copper private storage. Projects and exports live
  on shared/removable storage; Android does not allow an unrooted app to run
  the package runtime from the SD card.
- The Manual Terminal is a user-approved persistent PTY. AI file tools remain
  independently limited to the selected SAF workspace and must not receive the
  unrestricted terminal session API.
- The managed private runtime budget is 2 GiB. The bootstrap installer enforces
  its extraction limit; ongoing package-operation monitoring is later work.
- Do not silently substitute Android `/system/bin/sh` for Copper Bash.

---

## Completed foundations (evidence retained)

- [x] Copper identity, pinned upstream input, package prefix patching, GPL
  notices/source instructions, and an arm64-only runtime design.
- [x] Native PTY lifecycle bridge, atomic archive installer/repair/remove flow,
  runtime status and storage UI, and explicit Android All files approval for
  the Manual Terminal.
- [x] Manual terminal / AI SAF workspace separation.
- [x] Same-run candidate chain: native module compile + Android emulator PTY
  checks, arm64 source bootstrap, emulator installer validation, then a
  personal arm64 APK containing that exact archive.
- [x] CI run [`34241766195`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/34241766195), commit `2064665`, completed that chain. Its personal artifact was
  `Copper-runtime-device-candidate`, ID `10067075336`, with GitHub
  artifact-envelope digest
  `sha256:d857958f25da53e6c36e8774b3690c8b80604f99cb93f1b8b7e21b42de98b2ad`.

The candidate above is historical evidence only: real-phone testing found a
first-launch failure, so it must not be re-promoted as ready.

---

## Phase 0 — Real arm64 phone stabilization **← CURRENT**

### Real-phone result that blocks completion

The historical candidate starts an interactive Copper Bash PTY and accepts
normal typing/Enter/output. During its fallback first-launch bootstrap,
`dpkg-perl.postinst` runs `cpan -Ti Locale::gettext` and fails:

```text
/apex/com.android.runtime/bin/linker64 Makefile.PL
error: expected absolute path: "Makefile.PL"
```

This is **not** the earlier Salsa/dpkg mirror problem. The pinned Termux
packages checkout is `e480d5053cdb260babda82d3d863393b70833c18`; its
`dpkg-perl` subpackage is the source of the CPAN postinst.

### Root cause and repair — CI verified; physical-device evidence outstanding

- [x] Root cause: Android system-linker execution makes `/proc/self/exe` name
  `linker64`. Perl 5.42.2 uses that proc link to initialize `$^X`; CPAN then
  invokes linker64 as if it were Perl and gives it relative `Makefile.PL`.
- [x] Repair added: the generated pinned Perl package now patches `caretx.c`
  to recognize termux-exec's documented, absolute
  `TERMUX_EXEC__PROC_SELF_EXE` linker-launch contract and use Perl's preserved
  `argv[0]` for `$^X`. This matters because the contract can name the original
  `bin/cpan` script while `argv[0]` remains the real `bin/perl` interpreter.
  The native first-Bash launch also supplies the contract because it
  intentionally enters through linker64 before termux-exec can intercept the
  first `execve`.
- [x] Regression gates added: generated-input validation requires the exact Perl
  patch; post-build archive validation requires the direct `bin/perl` launcher
  plus its compiled `CORE/libperl.so` to carry the contract marker (the patched
  `caretx.c` is linked into the shared core); a direct-linker PTY test asserts
  that the target receives its own `argv[0]`, and the arm64 runtime test probes
  that `$^X` reports Copper's real `bin/perl` path.
- [x] Source-level repair evidence: the exact patch applied cleanly after
  perl-cross 1.6.4 preparation, and generated-input verification passed
  against the exact locked Termux packages checkout.
- [x] Candidate CI native evidence: [run `34276222236`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/34276222236), commit `0f81a07`, passed the native PTY compilation/instrumentation gate,
  including the direct-linker target-`argv[0]` assertion. This is compile/test
  evidence only; it is not arm64 phone evidence.
- [x] Candidate CI root cause: that same run's **source bootstrap** failed while
  fetching pinned `attr-2.6.0`: static
  `download-mirror.savannah.gnu.org` exhausted curl's retry budget with
  connection timeouts. Installer validation and APK construction were correctly
  skipped, so there is no new artifact to test or reuse.
- [x] Follow-up source repair: `attr` and next dependency `libacl` use the
  independently hosted Open Computing Facility HTTPS endpoints listed in
  Savannah's active `00_MIRRORS.txt`. Their release versions and existing
  SHA-256 pins are unchanged; the package builder still verifies the exact
  source bytes before extraction.
- [x] Candidate CI root cause: [run `34365287051`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/34365287051), commit `0c73a83`, passed native validation and progressed beyond the source-download
  problem, but its completed archive was rejected by an incorrect evidence
  gate. Perl builds with `-Duseshrplib`; `caretx.c` is in shared
  `CORE/libperl.so`, while the gate searched only the thin `bin/perl` launcher
  for the marker. Installer validation and APK construction were correctly
  skipped, so there is no new artifact.
- [x] Follow-up gate repair: archive verification now checks that `bin/perl`
  is a direct ELF launcher and finds exactly one direct
  `lib/perl5/.../*-android/CORE/libperl.so` ELF member containing
  `TERMUX_EXEC__PROC_SELF_EXE`. It does not accept a marker from an unrelated
  archive member.
- [x] Same-commit candidate CI: [run `34396030483`](https://github.com/Anonymous1362/Arena-AI-PROJ/actions/runs/34396030483), commit `da321a4`, passed **all** required gates: native
  PTY compilation/instrumentation, fresh arm64 source bootstrap including the
  corrected compiled-Perl archive gate, bundled-runtime installer validation,
  and personal arm64 APK construction. Failure-diagnostics steps were skipped.
  The new personal-test artifact is `Copper-runtime-device-candidate`, ID
  `10125842639`, GitHub artifact-envelope digest
  `sha256:f53a3a41b2b489329b8d3d6a8de0979977ce90cda009bdecb8c4467a3eb89a37`.
  It expires at `2026-09-23T21:31:10Z`; download it from that CI run. It is not
  a public release and must not be redistributed as one.
- [ ] Required final evidence: install that **new** candidate on the physical
  arm64 phone and complete every unchecked Phase 0 row below. In particular,
  confirm a clean fallback bootstrap with no linker `Makefile.PL` error and no
  hidden/suppressed postinst failure.

The pinned `guillemj/dpkg` 1.22.6 GitHub mirror and exact commit validation
remain required. Do not remove or weaken that independent source-fetch repair.

### Terminal interaction/lifecycle acceptance

- [x] Source repair: exit detail is recorded before an exited session leaves the
  native active map; a stale write now has a meaningful exit code instead of
  the opaque `Terminal session was not found` race.
- [x] Source repair: the UI keeps failed write feedback next to **Send**, strips
  Expo bridge wrapper text, and no longer mirrors the same raw rejection in a
  non-error notice above terminal output.
- [x] Automated native regression: the Android PTY test sends byte `0x03` to a
  foreground shell and requires its `INT` trap / exit 130.
- [ ] On phone: send a normal multi-character command, special characters,
  editing/backspace, and Enter/**Send**; confirm live output and the retained
  working directory.
- [ ] On phone: run `sleep 30`, tap **Ctrl C**, wait for `^C`/prompt before any
  other command, and record the result.
- [ ] On phone: deliberately end/exit the shell, then tap Send once; verify a
  clear single session-ended explanation—not an Expo bridge exception and not
  duplicate/mismatched notices.

### Keyboard, sheet, and mobile-polish acceptance

- [x] Source repair: Terminal uses Android resize mode without a second
  KeyboardAvoidingView padding pass; it no longer reserves navigation/tab
  space below the composer while the IME is visible.
- [x] Source repair: opening a Sheet dismisses the software keyboard; a
  full-screen native Pressable now owns the outside-tap backdrop; sheet travel
  distance updates during keyboard resize without restarting the opening
  animation.
- [ ] On phone: Terminal composer remains fully visible and directly attached
  to the keyboard—no gray gap and no terminal input hidden under the IME.
- [ ] On phone: open Chat overflow while the chat composer keyboard is visible;
  the keyboard must dismiss before the non-input panel settles.
- [ ] On phone: tap the dimmed area outside every Sheet and verify a smooth
  single dismissal; drag-cancel must spring back without jumping or closing.
- [ ] On phone: confirm close/open haptics and transitions feel responsive at
  the device's normal refresh rate, without blocking input.

### Phase 0 exit rule

**Do not mark Phase 0 complete** until the user confirms every unchecked
real-phone item for a newly built candidate. CI/emulator results are necessary
but not substitutes for that confirmation.

---

## Next phases (blocked until Phase 0 passes)

### Phase 1 — Managed package operations and terminal resilience

- [ ] Package-operation preflight/monitoring for the 2 GiB managed budget.
- [ ] Foreground/background lifecycle stress tests and clear recovery state.
- [ ] Richer ANSI/alternate-screen rendering and scrollback controls, only
  after the persistent terminal path is stable.

### Phase 2 — Copper package/update delivery

- [ ] Establish a Copper-controlled HTTPS package endpoint.
- [ ] Generate an offline archive signing key; commit/publicize only its public
  fingerprint/keyring, never its private material.
- [ ] Publish signed package metadata and verify it independently.

### Phase 3 — Permanent runtime release readiness

- [ ] Create immutable Copper-controlled HTTPS locations for the exact runtime
  ZIP/manifest and corresponding GPL source bundle.
- [ ] Run the existing fail-closed promotion gate against the exact promoted
  bytes.
- [ ] Explicitly authorize a release only after the above and Phase 0 are done.

No web-workflow work belongs in this roadmap unless the user explicitly changes
scope.

---

## Continuation protocol

1. Fetch `origin/arena/01a06159-arena-ai-proj`, inspect `ROADMAP.md`,
   `docs/AGENT-HANDOFF.md`, `git status -sb`, recent commits, and relevant CI
   before editing.
2. Diagnose from real evidence; do not mask a package/bootstrap error or claim
   a test passed when hardware has not run it.
3. For a cohesive repair, run the strongest available local checks, commit and
   push on this branch, then use **one** `[runtime-device-candidate]` marker
   only when preflight evidence warrants the full same-commit candidate chain.
4. Update this roadmap and the handoff with run/artifact IDs, physical results,
   remaining blockers, and exact next commands. The user only needs to provide
   real-device results, screenshots/logs, unpushed changes, or a different
   branch/commit when applicable.
