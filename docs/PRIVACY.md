# Copper — Privacy

Copper is an on-device AI chat and agent app. There is no Copper account, no
Copper backend, no analytics SDK, and no telemetry of any kind.

## What stays on your device

- Conversations, message history, titles and compaction summaries.
- Provider profiles, base URLs and model lists.
- API keys and GitHub tokens — kept in the iOS Keychain / Android Keystore
  (`expo-secure-store`), never in the plain settings file. On the web build the
  browser has no keychain, so they live in this site's local storage; only use
  the web build on a device you trust.
- Files written by the agent, inside the storage root you granted (app sandbox
  by default).
- Images you attach, copied into the app's documents directory.
- Usage counters (tokens per model) used for the in-app usage screen.

## What leaves your device

Only the request you trigger:

| Destination | Data | When |
| --- | --- | --- |
| The model provider you configured | System prompt, recent messages, attached images, tool definitions and tool results | Every time you send a message |
| GitHub (`api.github.com`) | The repository, path and content you ask the agent to read or write | Only when the GitHub tools are enabled and the model calls them |
| Nothing else | — | — |

Requests go directly from your device to the provider's base URL; Copper never
proxies them. The provider's own privacy policy and retention rules apply to
that traffic.

## Your controls

- **Settings → Data & privacy** exports every conversation as JSON, imports a
  backup, or deletes everything.
- **Settings → Providers** removes a key or a whole provider profile.
- Uninstalling the app removes its storage; keys in the OS keychain are removed
  with it.

## Children

Copper is a general-purpose developer tool and is not directed at children.

## Contact

Open an issue at <https://github.com/Anonymous1362/Arena-AI-PROJ>.
