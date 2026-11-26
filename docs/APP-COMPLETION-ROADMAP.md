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
| Data/privacy | **Active audit** | JSON imports are schema-sanitized and deduplicated before persistence; verify end-to-end data lifecycle and destructive-action recovery. |
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
- [x] Backup import now accepts Copper full and single-chat JSON exports while
  copying only validated conversation fields into persistence. It discards
  malformed records, duplicate conversation/message ids, unsupported nested
  data, and raw provider tool-call payloads; the UI reports imported versus
  ignored records.
- [x] A chat whose saved provider is missing now opens model recovery before a
  send, rather than appending a failed turn or sending that model name through
  an unrelated configured provider.
- [x] Provider setup now uses Gemini's OpenAI-compatibility root correctly,
  no longer advertises an unsupported direct Anthropic integration, and lets a
  user save/select a model ID when a compatible endpoint does not list models.
  Editing an endpoint, key, or headers clears only that provider's stale model
  cache.
- [x] Provider save, model discovery, and first-message target resolution now
  share HTTP(S) endpoint validation, so malformed or credential-in-URL entries
  are explained before a fetch. LAN presets require a real LAN address rather
  than pre-filling a phone-local loopback address, and editing a field clears
  stale connection feedback.
- [x] Automatic chat titling now makes its second provider request only after a
  successful turn; failed, aborted, or stopped first messages retain their
  visible error without silently retrying the broken provider for a title.
- [x] Agent auto-continuation and multi-step tool turns now preserve already
  streamed assistant text when a later provider request starts, rather than
  replacing the visible answer with only the final continuation segment.
- [x] Stopping an agent now interrupts its transient 429/5xx retry backoff
  immediately instead of leaving the chat in a several-second pending state.
- [x] Clearing, deleting, or resetting chat data now aborts affected in-flight
  provider requests first, avoiding hidden continued work/usage after the
  conversation or provider configuration has been removed. Editing or removing
  a provider likewise cancels only that provider's active conversations before
  replacing its in-memory endpoint/key.
- [x] Prompt-library row management controls are now separate from selecting a
  prompt, so Edit/Delete no longer risk selecting and closing the sheet at the
  same time on touch devices.
- [x] The Android chat composer now relies on the app's configured native
  keyboard resize mode instead of layering `KeyboardAvoidingView` padding on
  top; iOS retains native padding avoidance. Android/Hermes and web exports
  passed, while physical-phone IME interaction remains a required check.
- [x] The agent's workspace `touch` command now preserves an existing file
  instead of truncating it. It creates only a missing file and rejects a
  directory operand; controlled shell behavior and web export passed.
- [x] GitHub CI completed successfully for the endpoint validation and five
  provider/chat reliability commits: `c3e3383` (run `45759143860`), `75436da`
  (`45759282945`), `6c86c5f` (`45759405007`), `2549319` (`45759483024`),
  `c2d37c9` (`45759604547`), and `4276e63` (`45759701463`). This supplements,
  but does not replace, required real-provider and physical-device evidence.

## Near-term active work

- [ ] Produce and verify a concrete provider/first-message flow checklist,
  including invalid credentials, endpoints, model discovery, cancellation, and
  recovery after changing providers.
- [ ] Exercise chat JSON export/import and erase/reset controls through the
  actual mobile and web UI, including an imported chat with an unavailable
  provider.
- [ ] Continue the broader-app audit as cohesive, tested fixes; record each
  result here and in `docs/AGENT-HANDOFF.md`.

## Completion rule

General app work is complete only when the core flows above have real build and
interaction evidence. Product release remains blocked until the deferred
Terminal/runtime physical-device gate in `ROADMAP.md` also passes.
