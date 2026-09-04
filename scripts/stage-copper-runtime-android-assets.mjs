#!/usr/bin/env node
/**
 * Verify and atomically stage a Copper Runtime bootstrap as Android module
 * assets. This script never downloads, publishes, or signs a runtime: callers
 * must supply an already verified ZIP and its matching build manifest.
 *
 * Usage:
 *   node scripts/stage-copper-runtime-android-assets.mjs \
 *     --archive /path/copper-runtime-bootstrap-aarch64.zip \
 *     --manifest /path/copper-runtime-bootstrap-aarch64.zip.json \
 *     --out /path/modules/copper-exec/android/src/main/assets/copper-runtime \
 *     --mode ci-validation
 *
 * Modes:
 *   ci-validation  Allows the current non-publishable artifact only for a
 *                  temporary CI installer test. It must not be used to ship.
 *   release        Refuses a non-publishable manifest and requires the runtime
 *                  config to contain a Copper HTTPS repository and public
 *                  archive-key fingerprint before staging a release asset.
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(resolve(root, 'runtime/copper-runtime.config.json'), 'utf8'));
const args = process.argv.slice(2);
const expectedArchiveName = `copper-runtime-bootstrap-${config.architecture}.zip`;

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/stage-copper-runtime-android-assets.mjs --archive /path/archive.zip --manifest /path/archive.zip.json --out /path/assets/copper-runtime --mode ci-validation|release');
  process.exit(1);
}

function parseArguments() {
  const known = new Set(['--archive', '--manifest', '--out', '--mode']);
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!known.has(flag) || values.has(flag)) usage(`Unknown or duplicate argument: ${flag}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) usage(`Missing value for ${flag}.`);
    values.set(flag, value);
    index += 1;
  }
  if (values.size !== known.size) usage('All of --archive, --manifest, --out, and --mode are required.');
  const mode = values.get('--mode');
  if (mode !== 'ci-validation' && mode !== 'release') usage('--mode must be ci-validation or release.');
  return {
    archive: resolve(values.get('--archive')),
    manifest: resolve(values.get('--manifest')),
    output: resolve(values.get('--out')),
    mode,
  };
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.includes(`${sep}..${sep}`));
}

function sha256(path) {
  return new Promise((resolveDigest, reject) => {
    const digest = createHash('sha256');
    const input = createReadStream(path);
    input.on('error', reject);
    input.on('data', (chunk) => digest.update(chunk));
    input.on('end', () => resolveDigest(digest.digest('hex')));
  });
}

function fail(message) {
  throw new Error(`Copper Android asset staging refused: ${message}`);
}

function requireRegularFile(path, label) {
  if (!existsSync(path)) fail(`${label} does not exist: ${path}`);
  const stat = statSync(path);
  if (!stat.isFile()) fail(`${label} is not a regular file: ${path}`);
  return stat;
}

function parseManifest(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('runtime manifest must be a JSON object.');
    return value;
  } catch (error) {
    if (error.message.startsWith('Copper Android asset staging refused:')) throw error;
    fail(`runtime manifest is not valid JSON: ${error.message}`);
  }
}

function verifyManifest(manifest, archive, archiveSize, archiveDigest, mode) {
  const expected = {
    schemaVersion: 1,
    product: config.displayName,
    architecture: config.architecture,
    applicationId: config.applicationId,
    runtimePrefix: config.runtimePrefix,
    runtimeHome: config.runtimeHome,
    file: expectedArchiveName,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (manifest[field] !== value) fail(`manifest ${field} must be ${JSON.stringify(value)}, received ${JSON.stringify(manifest[field])}.`);
  }
  if (basename(archive) !== expectedArchiveName) {
    fail(`archive name must be ${expectedArchiveName}, received ${basename(archive)}.`);
  }
  if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes !== archiveSize) {
    fail(`manifest sizeBytes must equal the archive size (${archiveSize}), received ${JSON.stringify(manifest.sizeBytes)}.`);
  }
  if (typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    fail('manifest sha256 must be a 64-character hexadecimal SHA-256 value.');
  }
  if (manifest.sha256.toLowerCase() !== archiveDigest) {
    fail(`archive SHA-256 does not match its manifest (expected ${manifest.sha256.toLowerCase()}, got ${archiveDigest}).`);
  }
  if (typeof manifest.publishable !== 'boolean') fail('manifest publishable must be a boolean.');

  if (mode === 'release') {
    if (!manifest.publishable) fail('release mode rejects a non-publishable runtime manifest.');
    if (typeof config.repository.baseUrl !== 'string' || !/^https:\/\//.test(config.repository.baseUrl)) {
      fail('release mode requires a configured Copper-controlled HTTPS package repository URL.');
    }
    if (typeof config.repository.signing.keyFingerprint !== 'string' || !config.repository.signing.keyFingerprint.trim()) {
      fail('release mode requires a configured public Copper archive-key fingerprint.');
    }
  }
}

function verifyZip(path) {
  // Do not rely on entry sizes in the JSON manifest. The archive itself must
  // be structurally readable before it is ever copied into an Android build.
  const result = spawnSync('unzip', ['-tqq', path], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    const detail = [result.error?.message, result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join('\n');
    fail(`bootstrap ZIP integrity test failed${detail ? `:\n${detail}` : '.'}`);
  }
}

async function main() {
  const { archive, manifest: manifestPath, output, mode } = parseArguments();
  const archiveStat = requireRegularFile(archive, 'bootstrap archive');
  requireRegularFile(manifestPath, 'bootstrap manifest');
  if (isInside(output, archive) || isInside(output, manifestPath)) {
    fail('archive and manifest inputs must not be inside the destination directory.');
  }

  const parsedManifest = parseManifest(manifestPath);
  const digest = await sha256(archive);
  verifyManifest(parsedManifest, archive, archiveStat.size, digest, mode);
  verifyZip(archive);

  const parent = dirname(output);
  const stage = resolve(parent, `.${basename(output)}.copper-stage-${process.pid}-${Date.now()}`);
  mkdirSync(parent, { recursive: true });
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  try {
    const stagedArchive = resolve(stage, expectedArchiveName);
    const stagedManifest = resolve(stage, `${expectedArchiveName}.json`);
    copyFileSync(archive, stagedArchive);
    copyFileSync(manifestPath, stagedManifest);
    if (await sha256(stagedArchive) !== digest) fail('archive changed while staging.');
    if (readFileSync(stagedManifest, 'utf8') !== readFileSync(manifestPath, 'utf8')) {
      fail('manifest changed while staging.');
    }

    rmSync(output, { recursive: true, force: true });
    renameSync(stage, output);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }

  const receipt = {
    schemaVersion: 1,
    product: config.displayName,
    mode,
    architecture: config.architecture,
    applicationId: config.applicationId,
    runtimePrefix: config.runtimePrefix,
    archive: expectedArchiveName,
    sizeBytes: archiveStat.size,
    sha256: digest,
    manifestPublishable: parsedManifest.publishable,
    sourceManifestFile: basename(manifestPath),
  };
  const receiptPath = resolve(parent, `${basename(output)}.copper-stage-receipt.json`);
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

  console.log(`Copper Runtime Android assets staged in ${mode} mode.`);
  console.log(`Archive: ${resolve(output, expectedArchiveName)}`);
  console.log(`SHA-256: ${digest}`);
  console.log(`Stage receipt: ${receiptPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
