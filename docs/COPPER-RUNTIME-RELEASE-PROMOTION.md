# Copper Runtime Release Promotion Gate

This is the first durable-delivery gate for the Copper Runtime. It prepares a
locally verified **release candidate** from a real source-built arm64 bootstrap,
its matching build manifest, and a corresponding-source bundle. It deliberately
does **not** upload files, create a GitHub release, tag Git, build an APK, or
make a release public.

## Scope: this is not the personal phone-test APK path

Before using this permanent-distribution gate, Copper may build a clearly
labeled **personal device-candidate APK** for the project owner's physical arm64
phone. That candidate embeds the exact verified source-build asset in
`device-candidate` staging mode and is useful only for real Bash/PTTY execution
evidence. It is not a Copper Runtime release, must not be redistributed, and
does not remove any GPL/source or signing requirements for a later permanent
runtime distribution.

A GitHub Actions artifact is temporary validation evidence, not a durable
runtime delivery channel. In particular, the current successful source bootstrap
artifact is scheduled to expire on **2026-09-18**. Do not promote an archive
merely because it is still downloadable from CI.

## What must exist before promotion

An authorized Copper release operator needs all of the following outside the
candidate-visible repository:

1. An exact `copper-runtime-bootstrap-aarch64.zip` from the verified Copper
   source-build pipeline and its matching `*.zip.json` build manifest.
2. A complete corresponding-source bundle for that exact binary distribution,
   including Copper changes/build scripts and the required upstream/package
   source/notices. Its final location must meet GPL obligations for every
   recipient of the binary.
3. A Copper-controlled HTTPS package endpoint, configured in
   `runtime/copper-runtime.config.json` as `repository.baseUrl`.
4. An offline-generated archive signing key. Commit only its **public**
   fingerprint/keyring after the key is created; never put its private material
   in Git, an APK asset, a chat, or an agent prompt.
5. Two durable immutable HTTPS locations: one for the bootstrap asset and one
   for its corresponding source. The release operator, not the script, must
   ensure the host prevents replacement at those versioned URLs.

The checked-in configuration intentionally has no endpoint or key fingerprint,
so promotion currently refuses. That is correct and is not a failed Copper
build.

## Prepare a release candidate

After the prerequisites are actually configured, run this in a secure release
workspace. Keep the inputs and output outside the Copper Git checkout:

```bash
npm run runtime:promote-release -- \
  --archive /secure/input/copper-runtime-bootstrap-aarch64.zip \
  --build-manifest /secure/input/copper-runtime-bootstrap-aarch64.zip.json \
  --source-bundle /secure/input/copper-runtime-source-r2026.09.05.tar.gz \
  --source-url https://source.example/copper/r2026.09.05/copper-runtime-source-r2026.09.05.tar.gz \
  --asset-url https://downloads.example/copper/r2026.09.05/copper-runtime-bootstrap-aarch64.zip \
  --release-id r2026.09.05-arm64.1 \
  --out /secure/output/copper-runtime-r2026.09.05-arm64.1
```

The command checks:

- the archive name, bytes, SHA-256, Copper application identity, runtime prefix,
  and architecture exactly match the source-build manifest;
- the source-build input is explicitly marked non-publishable, so release
  promotion cannot be confused with arbitrary/manual archive assembly;
- the bootstrap ZIP passes `unzip -tqq` before copying;
- the checked-in runtime configuration has an HTTPS package endpoint, a required
  public 40- or 64-hex archive-key fingerprint, and the GPL corresponding-source
  requirement;
- both durable URLs are credential-free HTTPS URLs and end in the exact supplied
  asset/source filenames;
- the archive and corresponding source preserve their SHA-256 digests while
  being copied to an atomically promoted candidate directory.

The output contains:

```text
copper-runtime-r2026.09.05-arm64.1/
├── copper-runtime-bootstrap-aarch64.zip
├── copper-runtime-bootstrap-aarch64.zip.json   # release manifest, publishable: true
├── source/
│   └── copper-runtime-source-r2026.09.05.tar.gz
├── copper-runtime-release-receipt.json
└── README-NOT-PUBLISHED.txt
```

`publishable: true` means **eligible for the controlled release path after all
preconditions have been checked**. It does not make an HTTP upload happen or
prove the URL is live/immutable.

## After the candidate is prepared

1. Have a separate release reviewer compare the receipt, release manifest, ZIP,
   source bundle, package endpoint, and public key fingerprint against the
   release record.
2. Upload exactly those bytes to the operator-controlled immutable HTTPS URLs.
   Do not overwrite an existing release ID.
3. Independently download the uploaded archive/source, recalculate hashes, and
   record the results outside Git.
4. Stage the downloaded archive and its **release manifest** into Android assets:

   ```bash
   npm run runtime:stage-android-assets -- \
     --archive /secure/download/copper-runtime-bootstrap-aarch64.zip \
     --manifest /secure/download/copper-runtime-bootstrap-aarch64.zip.json \
     --out /secure/android-assets/copper-runtime \
     --mode release
   ```

5. Build an arm64 Copper candidate APK, then run
   `runsCopperBashThroughPtyOnArm64WhenBundled` on a physical arm64 Android
   device. The x86_64 emulator installer result is still not execution proof.
6. Preserve release/source/keyring provenance and complete live `pkg`/APT quota
   testing before describing the result as a finished Copper Runtime.

## Guardrails

- No separately installed Termux app is used or required.
- Runtime binaries still install only under Copper private app storage; project
  files remain on the selected external/SD workspace.
- Do not use an unsigned APT repository or an expiring CI artifact as a release
  channel.
- Do not use this command to “publish” a test fixture. The test fixture used by
  CI validates the gate plumbing only; it is never a Copper Runtime binary.
- Do not merge a branch merely to make this process possible. Branch builds and
  release candidates are independent of merge status.
