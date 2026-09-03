#!/usr/bin/env node
/**
 * Verify generated Copper package inputs before an expensive Docker build.
 *
 * The upstream termux_step_make implementation expands TERMUX_PKG_EXTRA_MAKE_ARGS
 * unquoted. Therefore every expanded item must be a single make assignment: a
 * space in a value becomes an unintended make target. In particular, the old
 * `TERMUX__NAME=Copper Runtime` value passed a bare `Runtime` target to
 * termux-core, which has no rule for that target.
 *
 * Usage:
 *   node scripts/verify-copper-runtime-generated-inputs.mjs --workspace /path/to/upstream
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/verify-copper-runtime-generated-inputs.mjs --workspace /path/to/upstream');
  process.exit(1);
}

if (args.length !== 2 || args[0] !== '--workspace' || !args[1]) {
  usage('Expected exactly one --workspace argument.');
}

const workspace = resolve(args[1]);
const packagesRoot = resolve(workspace, 'termux-packages');
const propertiesPath = resolve(packagesRoot, 'scripts/properties.sh');
const buildPackagePath = resolve(packagesRoot, 'build-package.sh');
const bootstrapBuildPath = resolve(packagesRoot, 'scripts/build-bootstraps.sh');
const termuxCoreRecipePath = resolve(packagesRoot, 'packages/termux-core/build.sh');
const config = JSON.parse(readFileSync(resolve(root, 'runtime/copper-runtime.config.json'), 'utf8'));

function fail(message) {
  throw new Error(message);
}

try {
  if (!/^[A-Za-z0-9._-]+$/.test(config.buildName)) {
    fail(`runtime buildName must be a whitespace-free make-safe token; received ${JSON.stringify(config.buildName)}.`);
  }
  if (!existsSync(propertiesPath) || !existsSync(buildPackagePath) || !existsSync(bootstrapBuildPath) || !existsSync(termuxCoreRecipePath)) {
    fail('Missing generated termux-packages properties, package builder, bootstrap script, or termux-core recipe. Run runtime:upstream and runtime:patch first.');
  }

  const buildPackage = readFileSync(buildPackagePath, 'utf8');
  const pruningHook = buildPackage.indexOf('if [ "${COPPER_BOOTSTRAP_PRUNE_BUILD_TREES:-false}" = "true" ]; then');
  const finishBuild = buildPackage.indexOf('\t\ttermux_step_finish_build', pruningHook);
  if (pruningHook === -1 || finishBuild === -1 || pruningHook > finishBuild || !buildPackage.slice(pruningHook, finishBuild).includes('rm -rf "$TERMUX_TOPDIR/$TERMUX_PKG_NAME"')) {
    fail('Generated package pruning must remove the completed package tree before termux_step_finish_build exits its subshell.');
  }

  const bootstrapBuild = readFileSync(bootstrapBuildPath, 'utf8');
  const bootstrapPackages = [...bootstrapBuild.matchAll(/^\s*PACKAGES\+=\("([a-z0-9+_.-]+)"\)/gmi)].map((match) => match[1]);
  if (!bootstrapPackages.length) {
    fail('Could not find direct package entries in generated build-bootstraps.sh. Upstream changed; review the bootstrap package check deliberately.');
  }
  const packageRecipeRoots = ['packages', 'root-packages', 'x11-packages'];
  const missingBootstrapRecipes = bootstrapPackages.filter((packageName) => !packageRecipeRoots.some((directory) => existsSync(resolve(packagesRoot, directory, packageName, 'build.sh'))));
  if (missingBootstrapRecipes.length) {
    fail(`Generated bootstrap requests package(s) without source recipe(s): ${missingBootstrapRecipes.join(', ')}. Do not start Docker until each package name is mapped to its pinned source recipe.`);
  }

  const properties = readFileSync(propertiesPath, 'utf8');

  // Use the same unquoted expansion as upstream termux_step_make. NUL output
  // retains exactly the argv values that `make` would receive and makes a bare
  // `Runtime` target unambiguous rather than relying on fragile text parsing.
  const rendered = spawnSync(
    'bash',
    ['-c', 'set -eo pipefail; source "$1"; source "$2"; printf "%s\\0" $TERMUX_PKG_EXTRA_MAKE_ARGS', 'copper-runtime-input-check', propertiesPath, termuxCoreRecipePath],
    {
      encoding: 'utf8',
      env: { ...process.env, TERMUX_ARCH: config.architecture },
      maxBuffer: 1024 * 1024,
    }
  );
  if (rendered.status !== 0) {
    fail(`Could not render generated termux-core make arguments: ${rendered.stderr.trim() || `exit ${rendered.status}`}`);
  }

  const makeArguments = rendered.stdout.split('\0').filter(Boolean);
  const bareTargets = makeArguments.filter((argument) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(argument));
  if (bareTargets.length) {
    const runtimeCause = bareTargets.includes('Runtime')
      ? ' This would cause "make: *** No rule to make target \'Runtime\'. Stop."'
      : '';
    fail(`termux-core would pass bare make target(s): ${bareTargets.map((target) => JSON.stringify(target)).join(', ')}.${runtimeCause} Use a whitespace-free buildName or a deliberately safe upstream make-argument transport.`);
  }

  const expectedNameLine = `TERMUX__NAME="${config.buildName}"`;
  if (!properties.includes(expectedNameLine)) {
    fail(`Generated properties do not contain ${expectedNameLine}. Re-run the Copper patch before building.`);
  }

  const expectedNameArgument = `TERMUX__NAME=${config.buildName}`;
  if (!makeArguments.includes(expectedNameArgument)) {
    fail(`termux-core make arguments are missing ${expectedNameArgument}.`);
  }

  console.log('Copper completed-package pruning verified before upstream finish-build exits its subshell.');
  console.log(`Copper generated bootstrap recipes verified: ${bootstrapPackages.length} direct package entries map to pinned source recipes.`);
  console.log(`Copper generated termux-core make arguments verified: ${makeArguments.length} assignments, no bare make targets.`);
  console.log(`  TERMUX__NAME: ${config.buildName}`);
  console.log(`  Product display name: ${config.displayName}`);
} catch (error) {
  console.error(`Copper Runtime generated-input verification failed: ${error.message}`);
  process.exit(1);
}
