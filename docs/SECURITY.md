# Copper — Security

## Reporting a vulnerability

Open a private security advisory at
<https://github.com/Anonymous1362/Arena-AI-PROJ/security/advisories/new>, or a
minimal issue that does not include exploit details. Please do not publish a
working exploit before a fix ships.

## Threat model

Copper runs entirely on the user's device. The relevant risks are:

1. **Credential disclosure at rest.** Provider API keys and GitHub tokens are
   written to the OS secure store (Keychain / Keystore) and split out of the
   settings JSON before it is persisted. The web build has no keychain; keys
   there are only as safe as the browser profile.
2. **Credential disclosure in transit.** HTTPS is required for any public
   provider. Plain `http://` is accepted only for loopback and private LAN
   addresses (Ollama, LM Studio, llama.cpp), and the app warns before sending a
   key over plain HTTP to any other host.
3. **Credential disclosure in output.** Provider error bodies can echo the
   request. Error strings and exported JSON are passed through a redactor that
   removes `sk-…`, `ghp_…`, `AIza…`, `Bearer …` and `?api_key=` values before
   they reach the transcript or an export file.
4. **Filesystem escape.** Every agent path is normalized and jailed to the
   active storage root; `..` segments that would leave the root throw
   (`safeRelPath`). Deletion of the root itself is refused.
5. **Destructive commands.** `delete_path` and matched destructive shell
   patterns (`rm -rf`, `git reset --hard`, force-push) require explicit
   confirmation, on by default.
6. **Untrusted model output.** Tool calls are executed only through the
   registered tool table; the model cannot invent a tool. Rendered markdown is
   text — links open externally, code blocks are not executed.

## Out of scope

- A rooted/jailbroken device or a compromised OS keychain.
- A malicious provider that you configured yourself; it already sees your
  prompts.
- Denial of service by a provider that streams an unbounded response.

## Hardening checklist for releases

- [ ] `npm run typecheck` clean
- [ ] No secrets in the repository (`git grep -nEi 'sk-[a-z0-9]{16,}|ghp_'`)
- [ ] iOS: `NSAllowsArbitraryLoads` absent; only local networking allowed
- [ ] Android: no `MANAGE_EXTERNAL_STORAGE` in the manifest
- [ ] Version and build numbers bumped together
