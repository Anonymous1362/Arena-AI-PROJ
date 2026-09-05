#!/usr/bin/env node
/**
 * Assemble a locally verified, publishable Copper Runtime release-candidate
 * directory from an already verified source-build bootstrap and corresponding
 * source bundle. This command NEVER uploads, publishes, tags, releases, or
 * changes the repository configuration. A separately controlled delivery
 * system must make the URLs durable and immutable after this command succeeds.
 *
 * A release candidate is intentionally refused until runtime/copper-runtime.config.json
 * names a Copper-controlled HTTPS APT endpoint and its public archive-key
 * fingerprint. Never add the private archive signing key to this repository.
 *
 * Usage:
 *   node scripts/promote-copper-runtime-release.mjs \
 *     --archive /secure/input/copper-runtime-bootstrap-aarch64.zip \
 *     --build-manifest /secure/input/copper-runtime-bootstrap-aarch64.zip.json \
 *     --source-bundle /secure/input/copper-runtime-source.tar.gz \
 *     --source-url https://source.example/copper/runtime/copper-runtime-source.tar.gz \
 *     --asset-url https://downloads.example/copper/runtime/r2026.09.05/copper-runtime-bootstrap-aarch64.zip \
 *     --release-id r2026.09.05-arm64.1 \
 *     --out /secure/output/copper-runtime-r2026.09.05-arm64.1
 *
 * The output contains the unmodified canonical bootstrap filename expected by
 * Android staging, a new publishable release manifest, the supplied source
 * bundle, and a receipt. Keep this output outside Git and publish only through
 * the project's controlled immutable hosting process.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const SHA256 = /^[a-f0-9]{64}$/i;
const FINGERPRINT = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;

function usage(message) {
  if (message) console.error(message);
  console.error([
    'Usage: node scripts/promote-copper-runtime-release.mjs',
    '  --archive /path/copper-runtime-bootstrap-aarch64.zip',
    '  --build-manifest /path/copper-runtime-bootstrap-aarch64.zip.json',
    '  --source-bundle /path/corresponding-source.tar.{gz,xz,zst}',
    '  --source-url https://controlled-source-host/path',
    '  --asset-url https://controlled-asset-host/immutable/path/copper-runtime-bootstrap-aarch64.zip',
    '  --release-id rYYYY.MM.DD-arm64.N',
    '  --out /empty/output-directory',
  ].join('\n'));
  process.exit(1);
}

function fail(message) {
  throw new Error(`Copper Runtime release promotion refused: ${message}`);
}

function parseArguments() {
  const known = new Set([
    '--archive', '--build-manifest', '--source-bundle', '--source-url',
    '--asset-url', '--release-id', '--out',
  ]);
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') usage();
    if (!known.has(flag) || values.has(flag)) usage(`Unknown or duplicate argument: ${flag}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) usage(`Missing value for ${flag}.`);
    values.set(flag, value);
    index += 1;
  }
  if (values.size !== known.size) usage('All release-promotion arguments are required.');
  return Object.fromEntries([...values.entries()].map(([key, value]) => [key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
}

function readJson(file, label) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(`${label} must be a JSON object.`);
    return parsed;
  } catch (error) {
    if (error.message.startsWith('Copper Runtime release promotion refused:')) throw error;
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function requireRegularFile(file, label) {
  if (!existsSync(file)) fail(`${label} does not exist: ${file}`);
  const metadata = statSync(file);
  if (!metadata.isFile()) fail(`${label} is not a regular file: ${file}`);
  if (metadata.size <= 0) fail(`${label} is empty: ${file}`);
  return metadata;
}

function sha256(file) {
  return new Promise((resolveDigest, reject) => {
    const digest = createHash('sha256');
    const input = createReadStream(file);
    input.on('error', reject);
    input.on('data', (chunk) => digest.update(chunk));
    input.on('end', () => resolveDigest(digest.digest('hex')));
  });
}

function requireHttpsUrl(raw, label) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`${label} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    fail(`${label} must be a credential-free absolute HTTPS URL without a query or fragment.`);
  }
  return url;
}

function requireReleaseId(releaseId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(releaseId)) {
    fail('release ID must be 3–80 characters using letters, numbers, dot, underscore, and hyphen.');
  }
  return releaseId;
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.includes(`${sep}..${sep}`));
}

function verifyZip(archive) {
  const result = spawnSync('unzip', ['-tqq', archive], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0 || result.error) {
    const detail = [result.error?.message, result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join('\n');
    fail(`bootstrap ZIP integrity test failed${detail ? `:\n${detail}` : '.'}`);
  }
}

function loadReleaseConfiguration() {
  const configPath = resolve(root, 'runtime/copper-runtime.config.json');
  const lockPath = resolve(root, 'runtime/copper-runtime.lock.json');
  const config = readJson(configPath, 'runtime configuration');
  const lock = readJson(lockPath, 'runtime source lock');
  const repository = config.repository;
  if (!repository || typeof repository !== 'object') fail('runtime configuration has no repository object.');
  if (typeof repository.baseUrl !== 'string') {
    fail('configure a Copper-controlled HTTPS package repository URL before creating a release candidate.');
  }
  const repositoryUrl = requireHttpsUrl(repository.baseUrl, 'runtime configuration repository.baseUrl');
  if (!repository.signing || repository.signing.required !== true) {
    fail('runtime configuration must require an offline Copper archive signing key.');
  }
  const fingerprint = repository.signing.keyFingerprint;
  if (typeof fingerprint !== 'string' || !FINGERPRINT.test(fingerprint)) {
    fail('configure a 40- or 64-hex-character public Copper archive-key fingerprint before creating a release candidate.');
  }
  if (lock?.licensing?.combinedDistribution !== 'GPL-3.0-only' || lock?.licensing?.sourceOfferRequired !== true) {
    fail('runtime source lock must retain the GPL-3.0-only corresponding-source requirement.');
  }
  if (typeof config.architecture !== 'string' || config.architecture !== repository.architecture) {
    fail('runtime configuration architecture must match repository architecture.');
  }
  return {
    config,
    lock,
    configPath,
    lockPath,
    repositoryUrl: repositoryUrl.toString().replace(/\/$/, ''),
    keyFingerprint: fingerprint.toUpperCase(),
  };
}

function verifyBuildManifest(manifest, archive, archiveBytes, archiveDigest, config) {
  const expectedArchive = `copper-runtime-bootstrap-${config.architecture}.zip`;
  const fields = {
    schemaVersion: 1,
    product: config.displayName,
    architecture: config.architecture,
    applicationId: config.applicationId,
    runtimePrefix: config.runtimePrefix,
    runtimeHome: config.runtimeHome,
    file: expectedArchive,
  };
  for (const [field, expected] of Object.entries(fields)) {
    if (manifest[field] !== expected) {
      fail(`build manifest ${field} must be ${JSON.stringify(expected)}, received ${JSON.stringify(manifest[field])}.`);
    }
  }
  if (basename(archive) !== expectedArchive) {
    fail(`archive name must be ${expectedArchive}, received ${basename(archive)}.`);
  }
  if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes !== archiveBytes) {
    fail(`build manifest sizeBytes must equal archive size ${archiveBytes}.`);
  }
  if (typeof manifest.sha256 !== 'string' || !SHA256.test(manifest.sha256) || manifest.sha256.toLowerCase() !== archiveDigest) {
    fail('archive SHA-256 must match the build manifest.');
  }
  if (manifest.publishable !== false || typeof manifest.publishBlocker !== 'string' || !manifest.publishBlocker.trim()) {
    fail('input must be the explicitly non-publishable manifest emitted by the verified source build.');
  }
  if (!manifest.upstream || typeof manifest.upstream !== 'object') {
    fail('build manifest must retain its pinned upstream/source receipt.');
  }
  return expectedArchive;
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function main() {
  const parsed = parseArguments();
  const release = loadReleaseConfiguration();
  const archive = resolve(parsed.archive);
  const buildManifestPath = resolve(parsed.buildManifest);
  const sourceBundle = resolve(parsed.sourceBundle);
  const output = resolve(parsed.out);
  const releaseId = requireReleaseId(parsed.releaseId);
  const assetUrl = requireHttpsUrl(parsed.assetUrl, 'asset URL');
  const sourceUrl = requireHttpsUrl(parsed.sourceUrl, 'corresponding source URL');

  const archiveStat = requireRegularFile(archive, 'bootstrap archive');
  const sourceStat = requireRegularFile(sourceBundle, 'corresponding source bundle');
  requireRegularFile(buildManifestPath, 'build manifest');
  if (existsSync(output)) {
    if (!statSync(output).isDirectory()) fail(`release output exists and is not a directory: ${output}`);
    if (readdirSync(output).length) fail(`release output directory must be empty: ${output}`);
  }
  if (isInside(output, archive) || isInside(output, buildManifestPath) || isInside(output, sourceBundle)) {
    fail('archive, build manifest, and source bundle must be outside the release output directory.');
  }

  const buildManifest = readJson(buildManifestPath, 'build manifest');
  const archiveDigest = await sha256(archive);
  const sourceDigest = await sha256(sourceBundle);
  const expectedArchive = verifyBuildManifest(buildManifest, archive, archiveStat.size, archiveDigest, release.config);
  verifyZip(archive);

  if (decodeURIComponent(assetUrl.pathname).split('/').pop() !== expectedArchive) {
    fail(`asset URL must end in the canonical archive name ${expectedArchive}.`);
  }
  const sourceFile = basename(sourceBundle);
  if (!sourceFile || sourceFile === '.' || sourceFile === '..') fail('corresponding source bundle has an unsafe filename.');
  if (decodeURIComponent(sourceUrl.pathname).split('/').pop() !== sourceFile) {
    fail(`corresponding source URL must end in the supplied source filename ${sourceFile}.`);
  }

  const parent = dirname(output);
  const stage = resolve(parent, `.${basename(output)}.copper-release-stage-${randomUUID()}`);
  if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true, mode: 0o700 });

  try {
    const stagedArchive = resolve(stage, expectedArchive);
    const stagedSourceDirectory = resolve(stage, 'source');
    const stagedSource = resolve(stagedSourceDirectory, sourceFile);
    const releaseManifestPath = resolve(stage, `${expectedArchive}.json`);
    mkdirSync(stagedSourceDirectory, { recursive: true, mode: 0o700 });
    copyFileSync(archive, stagedArchive);
    copyFileSync(sourceBundle, stagedSource);
    if (await sha256(stagedArchive) !== archiveDigest) fail('archive changed while preparing the release candidate.');
    if (await sha256(stagedSource) !== sourceDigest) fail('corresponding source bundle changed while preparing the release candidate.');

    const manifest = {
      // Keep schemaVersion 1 so the existing Android asset-stage and installer
      // validators can consume the release manifest; release-only provenance is
      // additive below and never weakens the core v1 identity fields.
      schemaVersion: 1,
      product: release.config.displayName,
      releaseId,
      createdAt: new Date().toISOString(),
      architecture: release.config.architecture,
      applicationId: release.config.applicationId,
      runtimePrefix: release.config.runtimePrefix,
      runtimeHome: release.config.runtimeHome,
      file: expectedArchive,
      sizeBytes: archiveStat.size,
      sha256: archiveDigest,
      assetUrl: assetUrl.toString(),
      repository: {
        baseUrl: release.repositoryUrl,
        channel: release.config.repository.channel,
        component: release.config.repository.component,
        architecture: release.config.repository.architecture,
        publicSigningKeyFingerprint: release.keyFingerprint,
      },
      correspondingSource: {
        file: `source/${sourceFile}`,
        sizeBytes: sourceStat.size,
        sha256: sourceDigest,
        url: sourceUrl.toString(),
      },
      sourceBuild: {
        inputManifestSha256: await sha256(buildManifestPath),
        inputManifestFile: basename(buildManifestPath),
        createdAt: buildManifest.createdAt,
        upstream: buildManifest.upstream,
        extraBootstrapPackages: buildManifest.extraBootstrapPackages ?? [],
      },
      publication: {
        publishable: true,
        meaning: 'Eligible for controlled publication only. This manifest does not itself upload, release, tag, or prove that either HTTPS URL is live and immutable.',
        immutableUrlRequired: true,
        sourceOfferIncluded: true,
      },
      publishable: true,
    };
    writeJson(releaseManifestPath, manifest);
    writeJson(resolve(stage, 'copper-runtime-release-receipt.json'), {
      schemaVersion: 1,
      product: release.config.displayName,
      releaseId,
      archive: { file: expectedArchive, sizeBytes: archiveStat.size, sha256: archiveDigest },
      correspondingSource: { file: `source/${sourceFile}`, sizeBytes: sourceStat.size, sha256: sourceDigest },
      releaseManifest: { file: basename(releaseManifestPath), sha256: await sha256(releaseManifestPath) },
      configSha256: await sha256(release.configPath),
      sourceLockSha256: await sha256(release.lockPath),
      nextStep: 'Publish only through a Copper-controlled immutable HTTPS host, then stage the exact release manifest and archive in Android release mode.',
    });
    writeFileSync(resolve(stage, 'README-NOT-PUBLISHED.txt'), [
      'This directory is a locally verified Copper Runtime release candidate.',
      'It has NOT been uploaded, released, or made durable by this command.',
      'Before publication, an authorized release operator must verify the exact archive/source hashes, confirm the URLs are immutable HTTPS locations, and retain the public archive key/source obligations.',
      'Never put the private archive signing key in this directory, Git, an APK asset, or an agent prompt.',
      '',
    ].join('\n'), { encoding: 'utf8', mode: 0o600 });

    mkdirSync(parent, { recursive: true });
    if (existsSync(output)) rmSync(output, { recursive: true, force: true });
    renameSync(stage, output);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }

  console.log(`Copper Runtime release candidate prepared: ${output}`);
  console.log(`Archive SHA-256: ${archiveDigest}`);
  console.log(`Corresponding source SHA-256: ${sourceDigest}`);
  console.log(`Release manifest: ${resolve(output, `${expectedArchive}.json`)}`);
  console.log('This command did not publish an asset, create a GitHub release, create a tag, or build an APK.');
}

main().catch((error) => {
  console.error(`Copper Runtime release promotion failed: ${error.message}`);
  process.exitCode = 1;
});
