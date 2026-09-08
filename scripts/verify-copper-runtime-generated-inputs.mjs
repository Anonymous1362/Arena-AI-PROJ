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
const termuxExecRecipePath = resolve(packagesRoot, 'packages/termux-exec/build.sh');
const termuxToolsRecipePath = resolve(packagesRoot, 'packages/termux-tools/build.sh');
const attrRecipePath = resolve(packagesRoot, 'packages/attr/build.sh');
const libaclRecipePath = resolve(packagesRoot, 'packages/libacl/build.sh');
const config = JSON.parse(readFileSync(resolve(root, 'runtime/copper-runtime.config.json'), 'utf8'));

function fail(message) {
  throw new Error(message);
}

try {
  if (!/^[A-Za-z0-9._-]+$/.test(config.buildName)) {
    fail(`runtime buildName must be a whitespace-free make-safe token; received ${JSON.stringify(config.buildName)}.`);
  }
  if (config.packageManager !== 'apt') {
    fail(`Copper's current bootstrap layout requires packageManager "apt", received ${JSON.stringify(config.packageManager)}.`);
  }
  if (!existsSync(propertiesPath) || !existsSync(buildPackagePath) || !existsSync(bootstrapBuildPath) || !existsSync(termuxCoreRecipePath) || !existsSync(termuxExecRecipePath) || !existsSync(termuxToolsRecipePath) || !existsSync(attrRecipePath) || !existsSync(libaclRecipePath)) {
    fail('Missing generated termux-packages properties, package builder, bootstrap script, termux-core recipe, termux-exec recipe, termux-tools recipe, attr recipe, or libacl recipe. Run runtime:upstream and runtime:patch first.');
  }

  const buildPackage = readFileSync(buildPackagePath, 'utf8');
  const pruningHook = buildPackage.indexOf('if [ "${COPPER_BOOTSTRAP_PRUNE_BUILD_TREES:-false}" = "true" ]; then');
  const finishBuild = buildPackage.indexOf('\t\ttermux_step_finish_build', pruningHook);
  if (pruningHook === -1 || finishBuild === -1 || pruningHook > finishBuild || !buildPackage.slice(pruningHook, finishBuild).includes('rm -rf "$TERMUX_TOPDIR/$TERMUX_PKG_NAME"')) {
    fail('Generated package pruning must remove the completed package tree before termux_step_finish_build exits its subshell.');
  }

  const bootstrapBuild = readFileSync(bootstrapBuildPath, 'utf8');
  const expectedBootstrapManagerSetup = [
    '. "${TERMUX_SCRIPTDIR}"/scripts/properties.sh',
    `TERMUX_PACKAGE_MANAGER="${config.packageManager}"`,
    'export TERMUX_PACKAGE_MANAGER',
    '. "${TERMUX_SCRIPTDIR}"/scripts/build/termux_step_handle_buildarch.sh',
  ].join('\n');
  if (!bootstrapBuild.includes(expectedBootstrapManagerSetup) || !bootstrapBuild.includes('add_termux_bootstrap_second_stage_files "$TERMUX_ARCH"')) {
    fail('Generated bootstrap does not initialize the second-stage package manager and target architecture. Refusing a script that can emit an empty manager/architecture and fail at login.');
  }
  const expectedArchiveMove = 'mv -f "${BOOTSTRAP_TMPDIR}/bootstrap-${1}.zip" "$TERMUX_BUILT_DEBS_DIRECTORY/"';
  if (!bootstrapBuild.includes(expectedArchiveMove)) {
    fail('Generated bootstrap must export its final ZIP to the package-builder output/ directory, not the potentially non-writable repository root.');
  }
  const bootstrapPackages = [...bootstrapBuild.matchAll(/^\s*PACKAGES\+=\("([a-z0-9+_.-]+)"\)/gmi)].map((match) => match[1]);
  if (!bootstrapPackages.length) {
    fail('Could not find direct package entries in generated build-bootstraps.sh. Upstream changed; review the bootstrap package check deliberately.');
  }
  const packageRecipeRoots = ['packages', 'root-packages', 'x11-packages'];
  const recipePathForPackage = (packageName) => packageRecipeRoots
    .map((directory) => resolve(packagesRoot, directory, packageName, 'build.sh'))
    .find((path) => existsSync(path));
  const missingBootstrapRecipes = bootstrapPackages.filter((packageName) => !recipePathForPackage(packageName));
  if (missingBootstrapRecipes.length) {
    fail(`Generated bootstrap requests package(s) without source recipe(s): ${missingBootstrapRecipes.join(', ')}. Do not start Docker until each package name is mapped to its pinned source recipe.`);
  }

  // Ask the pinned upstream dependency resolver for every recipe reached by
  // the default bootstrap. A long build previously discovered Savannah source
  // failures one package at a time. Keep that entire closure free of the
  // known-unreliable origin URL before Docker starts, without rewriting
  // unrelated recipes elsewhere in the upstream checkout.
  const buildOrderScript = resolve(packagesRoot, 'scripts/buildorder.py');
  const bootstrapDependencyRecipePaths = new Set();
  for (const packageName of bootstrapPackages) {
    const directRecipePath = recipePathForPackage(packageName);
    const directRecipeDirectory = resolve(directRecipePath, '..');
    const order = spawnSync(
      'python3',
      [buildOrderScript, directRecipeDirectory.slice(packagesRoot.length + 1), ...packageRecipeRoots],
      {
        cwd: packagesRoot,
        encoding: 'utf8',
        env: { ...process.env, TERMUX_ARCH: config.architecture },
        maxBuffer: 1024 * 1024,
      }
    );
    if (order.status !== 0 || order.error) {
      fail(`Could not resolve the generated ${packageName} bootstrap dependency closure: ${order.stderr.trim() || order.error?.message || `exit ${order.status}`}`);
    }
    bootstrapDependencyRecipePaths.add(directRecipePath);
    for (const line of order.stdout.split(/\r?\n/)) {
      const match = line.match(/^(\S+)\s+(.+)$/);
      if (!match) continue;
      const recipePath = resolve(packagesRoot, match[2].trim(), 'build.sh');
      if (!existsSync(recipePath)) {
        fail(`Pinned dependency resolver reported ${match[1]} at a missing recipe path: ${match[2]}`);
      }
      bootstrapDependencyRecipePaths.add(recipePath);
    }
  }
  const rawSavannahOriginRecipes = [...bootstrapDependencyRecipePaths]
    .filter((recipePath) => readFileSync(recipePath, 'utf8').includes('download.savannah.gnu.org'))
    .map((recipePath) => recipePath.slice(packagesRoot.length + 1));
  if (rawSavannahOriginRecipes.length) {
    fail(`Generated default bootstrap dependency closure still uses the unreliable Savannah origin URL in: ${rawSavannahOriginRecipes.join(', ')}. Use the reviewed HTTPS mirror with the existing recipe checksum before starting Docker.`);
  }

  // The full package graph reached attr and then libacl, where their pinned
  // Savannah origin endpoints exhausted curl's retry budget with 502/zero-byte
  // responses. The Copper patch changes only those exact source hosts to the
  // HTTPS mirror while retaining upstream cryptographic release checksums.
  const attrRecipe = readFileSync(attrRecipePath, 'utf8');
  const expectedAttrSource = 'TERMUX_PKG_SRCURL="https://download-mirror.savannah.gnu.org/releases/attr/attr-${TERMUX_PKG_VERSION}.tar.gz"';
  const expectedAttrSha256 = 'TERMUX_PKG_SHA256=d42fa374513180bb48cb11a46696f488240e5124ff1e6ad88b0abff706985612';
  if (!attrRecipe.includes(expectedAttrSource) || !attrRecipe.includes(expectedAttrSha256)) {
    fail('Generated attr recipe must use the exact HTTPS Savannah mirror and retain attr 2.6.0’s pinned SHA-256.');
  }
  const libaclRecipe = readFileSync(libaclRecipePath, 'utf8');
  const expectedLibaclSource = 'TERMUX_PKG_SRCURL=https://download-mirror.savannah.gnu.org/releases/acl/acl-${TERMUX_PKG_VERSION}.tar.gz';
  const expectedLibaclSha256 = 'TERMUX_PKG_SHA256=73c853c3d44e1f693e5a96a986f1bd19d3d0dac2c7d453e796177774bc4e5f6a';
  if (!libaclRecipe.includes(expectedLibaclSource) || !libaclRecipe.includes(expectedLibaclSha256)) {
    fail('Generated libacl recipe must use the exact HTTPS Savannah mirror and retain libacl 2.4.0’s pinned SHA-256.');
  }

  const properties = readFileSync(propertiesPath, 'utf8');

  // termux-tools configures the interactive-login/profile scripts from these
  // exported names. Without the generated hook, configure.ac defaults all
  // paths to com.termux even though properties.sh was repathed for Copper.
  // Keep this as an exact block test so a future upstream recipe change cannot
  // silently restore the on-device mkdir/cp failure seen during login.
  const termuxToolsRecipe = readFileSync(termuxToolsRecipePath, 'utf8');
  const expectedTermuxToolsPreConfigure = [
    'termux_step_pre_configure() {',
    '\t# termux-tools configure.ac otherwise defaults these to com.termux.',
    '\texport TERMUX_APP_PACKAGE="${TERMUX_APP__PACKAGE_NAME}"',
    '\texport TERMUX_BASE_DIR="${TERMUX__ROOTFS}"',
    '\texport TERMUX_CACHE_DIR="${TERMUX__CACHE_DIR}"',
    '\texport TERMUX_PREFIX="${TERMUX__PREFIX}"',
    '\texport TERMUX_ANDROID_HOME="${TERMUX__HOME}"',
    '\texport TERMUX_PACKAGE_FORMAT',
    '\texport TERMUX_PACKAGE_MANAGER',
    '\tautoreconf -vfi',
    '}',
  ].join('\n');
  if (!termuxToolsRecipe.includes(expectedTermuxToolsPreConfigure)) {
    fail('Generated termux-tools recipe does not export Copper paths before configure. Refusing a bootstrap whose interactive login can fall back to /data/data/com.termux.');
  }

  // termux-core injects its shared shell helpers after its first source render.
  // The Copper hook may only rename the known annotation-comment markers; it
  // must fail closed if any real unquoted @TERMUX_*@ placeholder remains in
  // the installed scripts that will be packaged into the bootstrap.
  const termuxCoreRecipe = readFileSync(termuxCoreRecipePath, 'utf8');
  const expectedTermuxCoreRuntimeTextRepairFragments = [
    'termux_step_post_make_install() {',
    '\tlocal copper_core_scripts="$TERMUX_PREFIX/bin"',
    '\twhile IFS= read -r -d "" copper_core_script; do',
    '\t\tsed -E -i \'/^[[:space:]]*##### .*replaced at build time\\./ s/@(TERMUX[A-Z0-9_]*)@/[\\1]/g\' "$copper_core_script"',
    '\tdone < <(find "$copper_core_scripts" -maxdepth 1 -type f -print0)',
    '\tif grep -R -E -n \'@TERMUX(_[A-Z0-9_]+)?@\' "$copper_core_scripts"; then',
    '\t\techo "ERROR: termux-core retained an unresolved runtime placeholder." >&2',
  ];
  if (expectedTermuxCoreRuntimeTextRepairFragments.some((fragment) => !termuxCoreRecipe.includes(fragment))) {
    fail('Generated termux-core recipe does not retain the narrow post-render runtime-placeholder repair and fail-closed check.');
  }

  // termux-exec has one historical Termux path in an installed script comment.
  // Repath the generated runtime member itself and fail closed rather than
  // weakening the final archive path scan.
  const termuxExecRecipe = readFileSync(termuxExecRecipePath, 'utf8');
  const expectedTermuxExecRuntimeTextRepairFragments = [
    'termux_step_post_make_install() {',
    '\tlocal copper_exec_script="$TERMUX_PREFIX/bin/termux-exec-ld-preload-lib"',
    '\tlocal copper_legacy_runtime_path="/data/data/com.termux/files/usr"',
    '\tsed -i "s|$copper_legacy_runtime_path|$TERMUX__PREFIX|g" "$copper_exec_script"',
    '\tif grep -F -q "$copper_legacy_runtime_path" "$copper_exec_script"; then',
    '\t\techo "ERROR: termux-exec retained a legacy com.termux runtime path." >&2',
  ];
  if (expectedTermuxExecRuntimeTextRepairFragments.some((fragment) => !termuxExecRecipe.includes(fragment))) {
    fail('Generated termux-exec recipe does not retain the installed script legacy-path repair and fail-closed check.');
  }

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
  console.log(`Copper bootstrap second-stage generation verified: ${config.packageManager} manager and ${config.architecture} architecture are explicit.`);
  console.log('Copper bootstrap archive export verified: package-builder output/ is used instead of the repository root.');
  console.log('Copper attr and libacl sources verified: HTTPS Savannah mirror with their upstream SHA-256 pins retained.');
  console.log(`Copper default bootstrap dependency closure verified: ${bootstrapDependencyRecipePaths.size} recipe roots, no raw Savannah origin URLs.`);
  console.log(`Copper generated bootstrap recipes verified: ${bootstrapPackages.length} direct package entries map to pinned source recipes.`);
  console.log(`Copper generated termux-core make arguments verified: ${makeArguments.length} assignments, no bare make targets.`);
  console.log('Copper generated termux-tools configure environment verified: login/profile paths cannot fall back to com.termux.');
  console.log(`  TERMUX__NAME: ${config.buildName}`);
  console.log(`  Product display name: ${config.displayName}`);
} catch (error) {
  console.error(`Copper Runtime generated-input verification failed: ${error.message}`);
  process.exit(1);
}
