#!/usr/bin/env node
/**
 * Build a Copper-prefix arm64 bootstrap using Termux's own fork-oriented
 * bootstrap builder. It produces a real bootstrap archive when Docker is
 * available; it does not publish anything or silently use upstream binaries.
 *
 * Prerequisites:
 *   - npm run runtime:upstream -- --dir /absolute/workspace
 *   - node scripts/patch-copper-runtime-upstream.mjs --workspace /absolute/workspace
 *   - Docker with permission to run the upstream package-builder container
 *
 * Usage:
 *   node scripts/build-copper-runtime-bootstrap.mjs --workspace /path --out /path
 *   node scripts/build-copper-runtime-bootstrap.mjs --workspace /path --out /path --add git,curl
 *   node scripts/build-copper-runtime-bootstrap.mjs --workspace /path --out /path --preflight-only
 *   node scripts/build-copper-runtime-bootstrap.mjs --workspace /path --out /path --print-command
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(resolve(root, 'runtime/copper-runtime.config.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve(root, 'runtime/copper-runtime.lock.json'), 'utf8'));
const args = process.argv.slice(2);

function takeFlag(name, required = true) {
  const index = args.indexOf(name);
  if (index === -1) {
    if (required) throw new Error(`Missing ${name}.`);
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
  return value;
}

function hasOnlyKnownFlags() {
  const valueFlags = new Set(['--workspace', '--out', '--add']);
  const booleanFlags = new Set(['--print-command', '--preflight-only']);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (booleanFlags.has(arg)) continue;
    if (valueFlags.has(arg)) {
      index += 1;
      if (index >= args.length) return false;
      continue;
    }
    return false;
  }
  return true;
}

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/build-copper-runtime-bootstrap.mjs --workspace /path --out /path [--add pkg1,pkg2] [--preflight-only] [--print-command]');
  process.exit(1);
}

function git(repository, commandArgs) {
  return execFileSync('git', ['-C', repository, ...commandArgs], { encoding: 'utf8' }).trim();
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

try {
  if (!hasOnlyKnownFlags()) usage('Unknown or incomplete argument.');
  const workspace = resolve(takeFlag('--workspace'));
  const outputDirectory = resolve(takeFlag('--out'));
  const extraPackages = takeFlag('--add', false);
  const printCommand = args.includes('--print-command');
  const preflightOnly = args.includes('--preflight-only');
  const packagesRoot = resolve(workspace, 'termux-packages');
  const receiptPath = resolve(workspace, 'copper-runtime-patch-receipt.json');

  if (!existsSync(receiptPath)) throw new Error('Missing Copper patch receipt. Run patch-copper-runtime-upstream.mjs before building.');
  if (!existsSync(resolve(packagesRoot, '.git'))) throw new Error('Missing termux-packages checkout. Run npm run runtime:upstream first.');
  if (git(packagesRoot, ['rev-parse', 'HEAD']) !== lock.upstream.termuxPackages.revision) {
    throw new Error('termux-packages is not at the pinned Copper Runtime revision.');
  }

  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (receipt.buildName !== config.buildName || receipt.applicationId !== config.applicationId || receipt.runtimePrefix !== config.runtimePrefix || receipt.architecture !== config.architecture) {
    throw new Error('Copper patch receipt does not match runtime/copper-runtime.config.json. Re-run the patch step.');
  }

  // Fail before Docker/preflight if generated recipe argument splitting would
  // turn any part of Copper's branding into an unintended make target.
  const generatedInputCheck = spawnSync(process.execPath, [
    resolve(root, 'scripts/verify-copper-runtime-generated-inputs.mjs'),
    '--workspace',
    workspace,
  ], { stdio: 'inherit' });
  if (generatedInputCheck.status !== 0) {
    throw new Error(`Generated Copper recipe verification failed with exit code ${generatedInputCheck.status ?? 'unknown'}.`);
  }

  // termux-am is the Android Gradle sub-build required by termux-tools. Build
  // it first, while the runner is still empty, so an SDK/package failure stops
  // in minutes rather than after a full bootstrap dependency graph has built.
  // Its emitted .deb and built-package marker are reused by build-bootstraps.
  const preflightCommand = ['./scripts/run-docker.sh', './build-package.sh', '-a', config.architecture, 'termux-am'];
  const command = ['./scripts/run-docker.sh', './scripts/build-bootstraps.sh', '--architectures', config.architecture];
  if (extraPackages) {
    if (!/^[a-z0-9][a-z0-9+_.-]*(,[a-z0-9][a-z0-9+_.-]*)*$/i.test(extraPackages)) {
      throw new Error('--add must be a comma-separated package-name list.');
    }
    command.push('--add', extraPackages);
  }

  console.log(`Copper Runtime bootstrap target: ${config.applicationId}`);
  console.log(`Runtime prefix: ${config.runtimePrefix}`);
  console.log(`Architecture: ${config.architecture}`);
  console.log('Completed package build-tree pruning: enabled (output .debs and shared toolchain cache are retained).');
  console.log(`Fast Android package preflight: (cd ${packagesRoot} && ${preflightCommand.join(' ')})`);
  console.log(`Bootstrap command: (cd ${packagesRoot} && ${command.join(' ')})`);

  if (printCommand) {
    console.log('Commands validated; --print-command does not build a bootstrap.');
    process.exit(0);
  }

  const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' });
  if (docker.status !== 0) {
    throw new Error('Docker is required for a reproducible bootstrap build. Install/enable Docker, then rerun this command.');
  }

  const buildEnvironment = {
    ...process.env,
    CI: 'true',
    // The Copper patch makes this safe: completed per-package work trees are
    // reclaimed after their .debs are emitted, while output/, the installed
    // prefix, and the shared cross-toolchain cache remain available.
    COPPER_BOOTSTRAP_PRUNE_BUILD_TREES: 'true',
  };
  const preflight = spawnSync(preflightCommand[0], preflightCommand.slice(1), {
    cwd: packagesRoot,
    stdio: 'inherit',
    env: buildEnvironment,
  });
  if (preflight.status !== 0) {
    throw new Error(`Copper Android package preflight failed with exit code ${preflight.status ?? 'unknown'}. The full bootstrap was not started.`);
  }
  if (preflightOnly) {
    console.log('Copper Android package preflight passed; --preflight-only did not start the full bootstrap.');
    process.exit(0);
  }

  // The generated bootstrap patch exports the final ZIP to output/, the
  // package-builder's proven writable bind-mounted directory. The repository
  // root itself can be read-only to the container's builder user on CI.
  const expectedArchive = resolve(packagesRoot, 'output', `bootstrap-${config.architecture}.zip`);
  rmSync(expectedArchive, { force: true });
  const run = spawnSync(command[0], command.slice(1), {
    cwd: packagesRoot,
    stdio: 'inherit',
    env: buildEnvironment,
  });
  if (run.status !== 0) throw new Error(`Upstream bootstrap build failed with exit code ${run.status ?? 'unknown'}.`);
  if (!existsSync(expectedArchive)) throw new Error(`Build reported success but did not create ${expectedArchive}.`);

  const archiveSize = statSync(expectedArchive).size;
  if (archiveSize < 1_000_000) throw new Error(`Bootstrap archive is unexpectedly small (${archiveSize} bytes). Refusing to publish an invalid runtime input.`);

  const verify = spawnSync('unzip', ['-t', expectedArchive], { encoding: 'utf8' });
  if (verify.status !== 0) throw new Error(`Bootstrap integrity verification failed:\n${verify.stdout}\n${verify.stderr}`);
  const listing = spawnSync('unzip', ['-Z1', expectedArchive], { encoding: 'utf8' });
  if (listing.status !== 0) throw new Error('Could not inspect bootstrap archive contents.');
  for (const requiredFile of config.bootstrap.requiredFiles) {
    if (!listing.stdout.split(/\r?\n/).includes(requiredFile)) {
      throw new Error(`Bootstrap is missing required runtime entry: ${requiredFile}`);
    }
  }

  mkdirSync(outputDirectory, { recursive: true });
  const releaseName = `copper-runtime-bootstrap-${config.architecture}.zip`;
  const destination = resolve(outputDirectory, releaseName);
  copyFileSync(expectedArchive, destination);
  const manifest = {
    schemaVersion: 1,
    product: 'Copper Runtime',
    createdAt: new Date().toISOString(),
    architecture: config.architecture,
    applicationId: config.applicationId,
    runtimePrefix: config.runtimePrefix,
    runtimeHome: config.runtimeHome,
    file: basename(destination),
    sizeBytes: archiveSize,
    sha256: sha256(destination),
    upstream: receipt.upstream,
    extraBootstrapPackages: extraPackages ? extraPackages.split(',') : [],
    publishable: false,
    publishBlocker: 'A Copper-controlled HTTPS package repository and offline archive-signing key are not configured. Do not distribute this bootstrap until those requirements are met.',
  };
  writeFileSync(resolve(outputDirectory, `${releaseName}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Built and verified ${destination}`);
  console.log(`SHA-256: ${manifest.sha256}`);
  console.log(`Release manifest: ${resolve(outputDirectory, `${releaseName}.json`)}`);
} catch (error) {
  console.error(`Copper Runtime bootstrap build failed: ${error.message}`);
  process.exit(1);
}
