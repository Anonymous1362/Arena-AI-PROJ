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
- [x] Model discovery no longer fails silently: `/models` errors (rejected key,
  unreachable host, missing endpoint) are shown per provider in the model sheet
  with a Retry control, and the list is re-fetched when that provider's base URL
  changes. An empty list is reported as "did not list any models" instead of a
  connection failure, so a compatible endpoint without `/models` can still be
  saved and used with a manually entered model ID.
- [x] A first send rejected before any request starts (no model, removed
  provider, invalid base URL) keeps the typed draft in the composer. `sendMessage`
  now returns whether the turn was accepted, and the composer clears only after
  acceptance; configuration errors still surface in the chat banner.
- [x] Removed the stale "choose an on-device model" empty-state copy left from
  the pre-API engine. Provider setup is the only path.
- [x] Persisted state is now rehydrated through per-store validation
  (`src/store/persisted.ts`): settings, chats, prompts and usage keep every
  valid record and fall back to defaults for a missing or wrong-typed field.
  Before this, a partial or corrupt AsyncStorage slice was spread over live
  state, and the theme provider reads `appearance.theme` before any screen
  can render an error, so the app could fail to boot with no recovery UI.
  Stored agent tool transcripts are preserved rather than stripped.
- [x] Regenerating a reply no longer destroys saved text before the send is
  validated: retry and the per-message Regenerate action route through
  `sendMessage`, which validates the model/provider first, and regenerating
  an older reply truncates that turn and everything after it instead of
  leaving stranded later messages. An imported chat whose provider is missing
  now shows the model picker with the original answer intact.
- [x] Backup import refuses files over 25 MB before reading them into memory
  and reports non-JSON files as such, instead of attempting an unbounded
  parse that can crash a phone. The reset-settings dialog no longer mentions
  a nonexistent "downloads list" and now states what is actually kept.
- [x] Retrying a failed reply now regenerates that exact turn. The message
  Retry control previously called `regenerate: true`, which only replaced the
  last assistant message, so retrying an older errored answer appended a new
  reply at the end and left the failure in place. It now passes that message's
  id through `regenerateFromId`.
- [x] Prompt-library insertion into the chat composer works repeatedly. The
  selection was applied through an `initialText` state change, so choosing the
  same prompt again after editing or clearing the field produced no update; the
  composer now exposes an imperative insert callback.
- [x] Auto-title requests are counted in Usage. The Usage screen states that it
  counts every request including auto-titles, but the title request bypassed the
  usage store, so the rolling window, per-provider totals and limits undercounted
  one request per titled conversation.
- [x] Generation and usage bounds are enforced where the values are stored, not
  only by the settings screens. `maxTokens` is clamped to 128–8192 before it can
  be sent as `max_tokens`, so a restored or hand-edited `10000000` is no longer
  forwarded verbatim (rejected by providers) and `1` no longer produces an
  unusable reply. Temperature, top-P and the hourly/daily soft limits use the
  same ranges their steppers allow; `patchGeneration` and `setLimits` apply the
  shared clamp, so a future caller cannot bypass the screens.
- [x] A reply stored mid-stream is settled instead of staying in flight
  forever. Killing the app during a turn (or exporting a backup mid-reply)
  persisted a `done: false` assistant message; nothing could ever finish it, so
  it stayed out of every later request's history — history is built from
  completed messages — and an empty bubble rendered a permanent “…” with no
  Retry. `settleInterruptedMessage` in `src/store/persisted.ts` now sets
  `done: true` on rehydration and on backup import, keeping partial text and
  reasoning, and giving an empty assistant reply the ordinary retryable error.
- [x] Agent Mode now streams and stores model reasoning. The Providers screen
  advertises that reasoning models stream their thinking, but the agent loop
  never forwarded `onReasoning` and its `onDone` result carried no reasoning,
  so an Agent Mode reply showed no thinking block while running and kept none
  after it settled (normal chat did both). Reasoning is now accumulated across
  tool/continuation turns, painted live, kept on abort like partial text, and
  saved with the reply; a transient retry discards the failed attempt's trace
  instead of repeating it.
- [x] User-reported chat/provider/mobile-polish repair: standard chat is now
  direct by default rather than silently receiving the heavy Agent plan/tool
  prompt; Agent mode is an explicit advanced opt-in. Dedicated reasoning fields
  and raw or escaped `<think>`/`<thought>` tags route into the collapsed
  thinking panel instead of leaking into the answer. Stop settles the visible
  turn immediately and isolates late aborted-provider work, so switching model
  after Stop cannot overwrite a new turn.
- [x] The model picker now groups models as Fast & efficient, Pro, Reasoning,
  and Other, supports search, and labels only availability it can know. Gemini
  `/models` does not return account-specific price/entitlement data, so it
  honestly directs the user to their Gemini tier instead of inventing a
  free/paid label. The common Gemini `/opens` URL typo is rejected before a
  request; the required OpenAI-compatible root ends in `/v1beta/openai`.
- [x] Mobile interaction polish: tabs and usage navigation dismiss a retained
  Android keyboard; a sheet waits for the keyboard window to restore before it
  opens; edit/prompt forms no longer autofocus behind a sheet; prompt insertion
  no longer reopens the IME mid-dismissal; long-press message actions no longer
  trigger Android text selection as well. Streaming scroll no longer launches
  an animation per update, inactive tab scenes freeze, and routine tap haptics
  are intentionally silent (success/warning/error only).
- [x] A silent remote generation now has a 75-second **inactivity** watchdog.
  It ends the typing state, aborts the request, and shows an actionable Retry /
  model-switch message instead of waiting indefinitely. The timer resets when
  content, reasoning, tool, or plan activity arrives, so a normally streaming
  response is not cut off just because it is long.
- [x] Read-aloud now has a device-voice picker under Agent & storage. Copper
  lists installed native voices, favors English/enhanced entries in the picker,
  persists the selection safely, and starts the selected voice immediately
  rather than delaying playback for a voice-discovery call. It deliberately
  makes no cloud-quality promise: Android’s installed TTS package controls the
  voice quality. Generic compatible endpoints likewise expose no fake thinking
  budget/Auto/low/medium/high control; only reasoning data actually received is
  displayed.
- [x] TypeScript (`npx tsc --noEmit`) and a production web export
  (`npx expo export --platform web`), an Android Hermes export, and `npm test`
  (10/10) passed for these chat-reliability, settings-bounds,
  interrupted-message and agent-reasoning changes on
  2026-11-26. This is build evidence only; the provider rows in
  [`PROVIDER-FIRST-MESSAGE-CHECKLIST.md`](PROVIDER-FIRST-MESSAGE-CHECKLIST.md)
  still require a real key and a device run.

## Near-term active work

- [x] Produced the concrete provider/first-message flow checklist in
  [`PROVIDER-FIRST-MESSAGE-CHECKLIST.md`](PROVIDER-FIRST-MESSAGE-CHECKLIST.md),
  covering invalid credentials, endpoints, model discovery, cancellation, and
  recovery after changing providers. Executing the real-key/device rows is still
  required; the checklist marks which are code-covered and which need a live run.
- [ ] Exercise chat JSON export/import and erase/reset controls through the
  actual mobile and web UI, including an imported chat with an unavailable
  provider. Code paths and guards are now in place; the interaction run still
  needs a device or browser session.
- [x] Added `npm test` (`node --test tests/*.test.ts`) with focused persisted
  guard coverage; `tests` is excluded from `tsc` the same way as the sibling
  production-hardening lineage.
- [ ] Continue the broader-app audit as cohesive, tested fixes; record each
  result here and in `docs/AGENT-HANDOFF.md`.

## Completion rule

General app work is complete only when the core flows above have real build and
interaction evidence. Product release remains blocked until the deferred
Terminal/runtime physical-device gate in `ROADMAP.md` also passes.
