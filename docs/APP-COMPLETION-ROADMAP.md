# Copper — Broader App Completion Roadmap

> **Active product work:** complete Copper's general app experience first.
> Terminal/runtime physical-device hardening is intentionally deferred to final
> release hardening; it is tracked separately in [`../ROADMAP.md`](../ROADMAP.md).

## Simple position

| Area | Status | What that means |
| --- | --- | --- |
| App shell and navigation | **Active** | Chat, Providers, Settings, and Terminal tabs exist; ordinary app work may proceed. |
| Provider setup | **Active audit** | Provider presets, custom endpoints, connection test, and model picker exist; verify first-run and failure paths. |
| Chat experience | **Active audit** | Streaming, edit/retry, attachments, exports, prompt library, speech, search, pinning, and per-chat prompts exist; verify behavior and edge cases. |
| Agent/workspace | **Active audit** | Tool controls and Android SAF workspace boundaries exist; verify clear setup and permission/recovery flows. |
| Data/privacy | **Active audit** | Local chat persistence plus JSON export/import and erase controls exist; verify malformed-backup handling and data lifecycle. |
| Cross-platform polish | **Queued after core-flow fixes** | Exercise Android, iOS/PWA, mobile keyboard, accessibility, offline/error states, and build/install paths. |
| Terminal/runtime/device gate | **Deferred** | Not complete or releasable. Resume with a fresh candidate during final hardening. |

## Execution order

1. **First-run and provider readiness**
   - Validate welcome → provider → model → first message, including bad URL/key,
     empty model list, and cancelled setup paths.
   - Keep provider credentials local and make errors actionable.
2. **Chat and agent reliability**
   - Validate send/stop/retry/edit, long conversations, attachments, exports,
     prompt library, tool confirmations, and agent recovery.
3. **Data safety and settings**
   - Make backup import/export and destructive actions robust against malformed
     data, duplicates, cancellation, and partial state.
   - Validate appearance, generation, usage, and privacy settings persist.
4. **Cross-platform product quality**
   - Run real build/export evidence and fix functional, layout, accessibility,
     and error-state defects across supported platforms.
5. **Final runtime hardening**
   - Rebuild a fresh arm64 candidate, complete every unchecked physical-phone
     row in `ROADMAP.md`, then evaluate release readiness.

## Current completed evidence

- [x] User-authorized scope change recorded: general app work is allowed before
  terminal hardening.
- [x] Terminal/runtime Phase 0 is explicitly preserved as a deferred release
  gate rather than falsely marked complete.
- [x] First-run **Connect a provider** action now intentionally opens the
  direct provider-configuration screen (`/settings/api`) rather than requiring
  an extra navigation step through the provider overview.
- [x] TypeScript and a production Expo web export passed for that onboarding
  routing change.

## Near-term active work

- [ ] Produce and verify a concrete provider/first-message flow checklist.
- [ ] Harden backup import validation before accepting arbitrary JSON into the
  persisted conversation store.
- [ ] Continue the broader-app audit as cohesive, tested fixes; record each
  result here and in `docs/AGENT-HANDOFF.md`.

## Completion rule

General app work is complete only when the core flows above have real build and
interaction evidence. Product release remains blocked until the deferred
Terminal/runtime physical-device gate in `ROADMAP.md` also passes.
