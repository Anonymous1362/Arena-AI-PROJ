# Provider & first-message flow checklist

Concrete, observable steps for the first-run path. Each row states what the user
should see and how to know it passed. Run this with a real key on a device or
web build before calling provider setup complete.

Status legend:
- **Code-covered** — the behavior is implemented and the code path has a static
  check (TypeScript + web export). It is not a substitute for watching it run.
- **Needs real run** — requires a real key/endpoint or a physical device; not yet
  executed in a build.

| # | Step | Expected behavior | Pass criteria | Status |
| --- | --- | --- | --- | --- |
| 1 | Fresh install → Chats tab | First-run sheet: "Meet Copper", Get started, Connect a provider | Both buttons dismiss the sheet once; provider CTA opens `/settings/api` directly | Needs real run |
| 2 | Providers → Add provider → preset | Preset prefills name, base URL, suggested models, key link | No field is left with a phone-local loopback URL for a LAN preset | Code-covered |
| 3 | Base URL `not a url` → Test or Add | Inline error banner, no network request, no provider saved | Banner names the URL problem; dialog stays open with the typed values | Code-covered |
| 4 | Base URL `https://user:key@host/v1` | Inline error: put credentials in the key field | No fetch is attempted; field keeps the value for editing | Code-covered |
| 5 | Valid URL, wrong key → Test | Red banner with the provider's 401 detail | Message says the key was rejected and names the status; nothing is saved | Needs real run |
| 6 | Valid URL, wrong key → Add (save anyway) then send | Banner in chat: API key rejected (401), check Settings → Providers | The draft stays in the composer; no user message or empty assistant bubble is stored | Needs real run |
| 7 | Endpoint without `/models` (or empty list) → Test | Green "Connected, but this endpoint listed no models. Save it, then enter a model ID in the model sheet." | Saving still succeeds; model sheet offers the model ID field | Needs real run |
| 8 | Endpoint with bad key → open model sheet | The provider's discovery error is visible with a Retry control | Error text is not replaced by an empty model list; Retry re-requests | Code-covered |
| 9 | Fix the key, return to providers, reopen the model sheet | Discovery runs again for the changed endpoint | The stale error disappears; live models appear | Code-covered |
| 10 | Save/select a model ID manually | Model becomes the active model and is kept for later visits | The ID appears in that provider's list and survives reopening the sheet | Code-covered |
| 11 | First send | User bubble appears immediately, assistant bubble streams, Stop is shown | Stop is reachable while streaming; no second send starts | Needs real run |
| 12 | Stop mid-stream | Stream ends, partial text is kept, no auto-title request follows | Assistant message keeps partial content; title stays "New chat" until a later successful turn | Needs real run |
| 13 | Failed first send (bad key/offline) | Visible error on the assistant message; composer draft preserved | No title request is made against the broken provider; retry is possible | Needs real run |
| 14 | Change the provider while a reply is streaming | The running request is cancelled before credentials/endpoint are replaced | Streaming stops; the reply is marked stopped, not silently completed | Code-covered |
| 15 | Delete the provider used by an open chat | Chat still opens; sending routes to the model picker | No failed phantom turn is appended; banner says a model is needed | Code-covered |
| 16 | Imported/restored chat whose provider is missing | Same recovery path as #15 | Chat opens, model picker is offered before any send | Code-covered |
| 17 | Successful first turn (auto-title on) | Title becomes 3–6 words from the reply | One extra provider request only after success | Needs real run |
| 18 | Successful first turn (auto-title off) | Title stays "New chat" | No title request is visible in provider usage | Code-covered |

## Notes for the next run

- Steps 5–7, 11–13 and 17 need a real key. Use a throwaway key for the failure
  cases and check provider usage to confirm which requests were attempted.
- Steps 14–16 are cancellation/state paths; confirm them on a device where a
  stream can be started and then interrupted by a provider edit.
- Record results with the date, build/commit, platform, and the exact banner
  text. Do not mark provider setup complete from code inspection alone.
