# Copper Terminal — what's real today & the road to a built-in Linux shell

## The honest bottom line (no marketing)

| Claim | Reality |
|---|---|
| "Embed Termux bootstrap → instant python3/node/gcc" | ❌ **No.** Termux's base bootstrap (~80–120 MB) gives you **bash + coreutils + curl/tar etc.** It does **not** include python3, node, or gcc. Those are separate packages (`pkg install python nodejs gcc`) that download on demand and are what grow Termux to 1–5 GB over time. |
| "Termux APK is ~100 MB download" | ✅ Correct. Base install ≈ 100 MB. The 1–5 GB figure is **cumulative disk use after installing packages**, not the download. |
| "Copper can ship a full Linux shell with zero setup" | ✅ Possible — the standard no-Termux technique is **proot + a distro rootfs** inside Copper's own sandbox (same trick TermAI/UserLand-style apps use). Not the raw Termux bootstrap: its binaries bake in the `/data/data/com.termux` path, so you either repackage them for Copper's path or run them under proot path translation. |
| "It just works on first launch" | ⚠️ Only if the core is **bundled in the APK** (adds ~100–300 MB to the download) **or** downloaded once on first launch (~150–400 MB, minutes, needs network). There is no way around that weight for real python/gcc/git — physics of shipping a userspace. |

## What the Terminal tab does right now

- **Manual commands** — type at the bottom, output streams back, history is persisted on-device.
- **Agent runs** — every command the agent executed in chat appears here too.
- Executor = the **exact same engine the agent uses**:
  - **Native mode** — when the APK carries a native executor bridge (`copper-exec`), commands run in a real Android shell (badge: NATIVE SHELL).
  - **Built-in mode** — otherwise the honest sandboxed mini-shell: `ls cat head tail wc echo grep touch mkdir rm mv cp find pwd help` inside Copper's storage root (badge: SANDBOXED BUILT-INS).

## The roadmap to a true embedded Linux core (no Termux app)

1. **Native executor** — small Kotlin module in the APK that spawns processes in Copper's sandbox (this is the `copper-exec` bridge the code already probes for).
2. **Linux userspace** — pick one:
   - **Bundled bootstrap**: package the userspace into the APK (~+100–300 MB download) → fully offline out of the box.
   - **First-run installer**: ship proot + Alpine/Debian minirootfs (~5–15 MB), then download python3/node/git/gcc on first launch into Copper's own storage (~150–400 MB one-time). Closest to "download app → it sets itself up".
3. **Pre-seed defaults** — auto `apk add`/`pkg install` a curated set (python3, nodejs, git, curl, build-base) so the user genuinely gets it with zero commands.
4. **Agent + manual shell point at the same core** — agent `run_command` and the Terminal tab both exec into the embedded userspace.

### What it will NOT be
- Root over Android, or writing anywhere outside the folders you grant Copper. No Play-Store app can give more than that; anything claiming otherwise is misleading.
- A small download. Real `python3 + gcc + node + git` cannot fit in a few dozen MB — expect ~100–400 MB total (bundled or first-run).

### Licensing note
Proot and a distro userspace are open source (GPL/Apache-family). Bundling them is fine for a free, open app like Copper — keep the app source available (it already is) and you comply.

### Status
- [x] Interactive Terminal tab (manual + agent history) — shipped
- [ ] Native executor module in the APK (copper-exec bridge)
- [ ] Bundled or first-run Linux userspace + default package pre-seed
- [ ] Agent `run_command` switched to the embedded userspace
