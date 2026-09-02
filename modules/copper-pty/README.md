# copper-pty (optional native module)

Local Expo module, auto-linked from `modules/` at `npx expo prebuild` time.
Expo Go ignores it; the app runs fine without it (built-in JS shell).

## What it adds
- `exec(cmd, timeoutMs)` — real `/system/bin/sh` one-shots. `tools.ts` probes
  for it, so `run_command` and the Terminal tab upgrade themselves to a real
  shell with zero other changes.
- `spawn/write/output/alive/kill` — piped interactive sessions for
  line-oriented programs (`sh`, REPLs, anything that reads stdin line by line).

## What it is not
A PTY. No `forkpty()`, no window-size ioctls, so full-screen TUIs (vim, htop,
less) still will not work. That needs an NDK C layer; it is the documented
follow-up, not a hidden limitation.

## Build it
```bash
npx expo prebuild -p android   # or a dev client: npx expo run:android
```
No permissions required: executing the system shell as your own app's child
process needs no Android permission (only executing *downloaded* binaries is
forbidden by W^X, which this never does).
