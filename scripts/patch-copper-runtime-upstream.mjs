#!/usr/bin/env node
/**
 * Apply the narrow, reproducible Copper-prefix changes required before building
 * a Termux-derived bootstrap. This operates only on an ignored upstream work
 * checkout created by `npm run runtime:upstream`; it never edits a vendored
 * copy in this repository.
 *
 * It intentionally does NOT attempt to turn upstream's complete Android app
 * into an Expo module. That is the later PTY/integration phase. This phase
 * makes every bootstrap binary target Copper's private application prefix.
 *
 * Usage:
 *   node scripts/patch-copper-runtime-upstream.mjs --workspace .cache/copper-runtime-upstream
 *   node scripts/patch-copper-runtime-upstream.mjs --workspace /path/to/workspace --reset
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const workspaceIndex = args.indexOf('--workspace');
const reset = args.includes('--reset');

if (workspaceIndex === -1 || !args[workspaceIndex + 1] || args.some((arg) => arg !== '--workspace' && arg !== '--reset' && arg !== args[workspaceIndex + 1])) {
  console.error('Usage: node scripts/patch-copper-runtime-upstream.mjs --workspace /path/to/upstream [--reset]');
  process.exit(1);
}

const workspace = resolve(args[workspaceIndex + 1]);
const packagesRoot = resolve(workspace, 'termux-packages');
const propertiesPath = resolve(packagesRoot, 'scripts/properties.sh');
const bootstrapScriptPath = resolve(packagesRoot, 'scripts/build-bootstraps.sh');
const lock = JSON.parse(readFileSync(resolve(root, 'runtime/copper-runtime.lock.json'), 'utf8'));
const config = JSON.parse(readFileSync(resolve(root, 'runtime/copper-runtime.config.json'), 'utf8'));

function git(repository, commandArgs, options = {}) {
  return execFileSync('git', ['-C', repository, ...commandArgs], { encoding: 'utf8', ...options }).trim();
}

function assertCheckout(repository, expectedRevision) {
  if (!existsSync(resolve(repository, '.git'))) {
    throw new Error(`Missing git checkout: ${repository}. Run npm run runtime:upstream first.`);
  }
  const revision = git(repository, ['rev-parse', 'HEAD']);
  if (revision !== expectedRevision) {
    throw new Error(`Wrong pinned revision in ${repository}: expected ${expectedRevision}, found ${revision}.`);
  }
  const dirty = git(repository, ['status', '--porcelain']);
  if (dirty) {
    if (!reset) throw new Error(`${repository} has local changes. Use --reset to discard them before applying the deterministic Copper patch.`);
    execFileSync('git', ['-C', repository, 'reset', '--hard', expectedRevision], { stdio: 'inherit' });
    execFileSync('git', ['-C', repository, 'clean', '-fdx'], { stdio: 'inherit' });
  }
}

function replaceExactly(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one matching upstream assignment, found ${count}. Upstream changed; update this patch deliberately.`);
  return source.replace(before, after);
}

try {
  assertCheckout(packagesRoot, lock.upstream.termuxPackages.revision);
  assertCheckout(resolve(workspace, 'termux-app'), lock.upstream.termuxApp.revision);

  let properties = readFileSync(propertiesPath, 'utf8');
  properties = replaceExactly(properties, 'TERMUX__NAME="Termux"', 'TERMUX__NAME="Copper Runtime"', 'runtime name');
  properties = replaceExactly(
    properties,
    'TERMUX_APP__PACKAGE_NAME="com.termux"',
    `TERMUX_APP__PACKAGE_NAME="${config.applicationId}"`,
    'runtime application id'
  );
  properties = replaceExactly(
    properties,
    'TERMUX__PROJECT_SUBDIR="$TERMUX__INTERNAL_NAME"',
    'TERMUX__PROJECT_SUBDIR="copper-runtime"',
    'runtime private-state subdirectory'
  );
  properties = replaceExactly(
    properties,
    'TERMUX_APP__APP_IDENTIFIER="termux"',
    'TERMUX_APP__APP_IDENTIFIER="copper"',
    'runtime app identifier'
  );
  writeFileSync(propertiesPath, properties);

  // A source bootstrap builds many dependency packages in one Docker container.
  // Their completed per-package build trees are no longer needed once their
  // .deb files exist under output/, but can otherwise exhaust a hosted runner
  // before termux-am's small Android subproject runs. This is opt-in at build
  // time so upstream's normal bootstrap behavior remains available unchanged.
  let bootstrapScript = readFileSync(bootstrapScriptPath, 'utf8');
  const bootstrapBuildLoop = [
    '\t\t\tset +e',
    '\t\t\tbuild_package "$TERMUX_ARCH" "$package_name" || return $?',
    '\t\t\tset -e',
  ].join('\n');
  const copperBuildTreePruning = [
    bootstrapBuildLoop,
    '',
    '\t\t\tif [ "${COPPER_BOOTSTRAP_PRUNE_BUILD_TREES:-false}" = "true" ]; then',
    '\t\t\t\t# Keep shared toolchain/source cache and output .debs, while removing',
    '\t\t\t\t# completed package-specific source, build, staging, and massage trees.',
    '\t\t\t\tfind "$TERMUX_TOPDIR" -mindepth 1 -maxdepth 1 -type d ! -name "_cache" -exec rm -rf {} +',
    '\t\t\tfi',
  ].join('\n');
  bootstrapScript = replaceExactly(
    bootstrapScript,
    bootstrapBuildLoop,
    copperBuildTreePruning,
    'bootstrap intermediate build-tree pruning hook'
  );
  writeFileSync(bootstrapScriptPath, bootstrapScript);

  const receipt = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    purpose: 'Copper-prefix bootstrap and package build input',
    applicationId: config.applicationId,
    runtimePrefix: config.runtimePrefix,
    runtimeHome: config.runtimeHome,
    architecture: config.architecture,
    upstream: {
      termuxApp: lock.upstream.termuxApp.revision,
      termuxPackages: lock.upstream.termuxPackages.revision,
    },
    changes: [
      'TERMUX__NAME=\"Copper Runtime\"',
      `TERMUX_APP__PACKAGE_NAME=\"${config.applicationId}\"`,
      'TERMUX__PROJECT_SUBDIR=\"copper-runtime\"',
      'TERMUX_APP__APP_IDENTIFIER=\"copper\"',
      'Optional COPPER_BOOTSTRAP_PRUNE_BUILD_TREES hook to discard completed package build trees while retaining output .deb files and shared toolchain cache.',
    ],
    note: 'The Java package namespace and full terminal UI are intentionally not changed by this bootstrap/package phase. The later native integration phase must patch matching runtime constants and retain upstream notices.',
  };
  writeFileSync(resolve(workspace, 'copper-runtime-patch-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);

  console.log('Copper Runtime package inputs patched successfully.');
  console.log(`  PREFIX: ${config.runtimePrefix}`);
  console.log(`  HOME:   ${config.runtimeHome}`);
  console.log(`  ABI:    ${config.architecture}`);
  console.log(`  Receipt: ${resolve(workspace, 'copper-runtime-patch-receipt.json')}`);
} catch (error) {
  console.error(`Copper Runtime patch failed: ${error.message}`);
  process.exit(1);
}
