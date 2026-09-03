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
const buildPackagePath = resolve(packagesRoot, 'build-package.sh');
const bootstrapBuildPath = resolve(packagesRoot, 'scripts/build-bootstraps.sh');
const termuxAmRecipePath = resolve(packagesRoot, 'packages/termux-am/build.sh');
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

  // termux_step_make expands TERMUX_PKG_EXTRA_MAKE_ARGS unquoted. Recipes
  // such as termux-core transport TERMUX__NAME through that value, so this
  // build-time identity must remain one shell word. The user-facing product
  // display name remains config.displayName ("Copper Runtime"); the generated
  // runtime/package identity is the Copper brand token.
  if (!/^[A-Za-z0-9._-]+$/.test(config.buildName)) {
    throw new Error(`runtime buildName must be a whitespace-free make-safe token, received ${JSON.stringify(config.buildName)}.`);
  }

  let properties = readFileSync(propertiesPath, 'utf8');
  properties = replaceExactly(properties, 'TERMUX__NAME="Termux"', `TERMUX__NAME="${config.buildName}"`, 'runtime build name');
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

  // A bootstrap builds its packages recursively in one Docker container. Once
  // every individual package has emitted its .deb, its private source/build/
  // staging tree is no longer needed: later dependency resolution uses output/
  // and the installed prefix. Reclaim it immediately (not only after the outer
  // bootstrap command returns), otherwise one large dependency graph can fill
  // a hosted runner before termux-am's Android subproject runs.
  //
  // This remains opt-in at build time, leaving upstream's default behavior
  // unchanged for ordinary Termux package builds.
  let buildPackage = readFileSync(buildPackagePath, 'utf8');
  // termux_step_finish_build ends the package subshell with `exit 0`. The
  // cleanup must therefore run immediately *before* that function, after the
  // .deb and built-package markers have been created, rather than after it.
  const packageBuildComplete = [
    '\t\ttermux_add_package_to_built_packages_list "$TERMUX_PKG_NAME"',
    '\t\ttermux_step_finish_build',
  ].join('\n');
  const copperPerPackagePruning = [
    '\t\ttermux_add_package_to_built_packages_list "$TERMUX_PKG_NAME"',
    '\t\tif [ "${COPPER_BOOTSTRAP_PRUNE_BUILD_TREES:-false}" = "true" ]; then',
    '\t\t\t# output/*.deb, built-package markers, and shared _cache stay intact.',
    '\t\t\t# Remove only this completed package\'s private source/build/cache tree.',
    '\t\t\trm -rf "$TERMUX_TOPDIR/$TERMUX_PKG_NAME"',
    '\t\tfi',
    '\t\ttermux_step_finish_build',
  ].join('\n');
  buildPackage = replaceExactly(
    buildPackage,
    packageBuildComplete,
    copperPerPackagePruning,
    'per-package intermediate build-tree pruning hook before finish-build exit'
  );
  writeFileSync(buildPackagePath, buildPackage);

  // The pinned termux-packages revision moved the bzip2 command into the
  // libbz2 recipe as a subpackage, but build-bootstraps.sh still asks for a
  // now-nonexistent packages/bzip2 recipe. Building libbz2 emits both libbz2
  // and bzip2 .debs, so use the actual source recipe rather than falling back
  // to an incompatible official-repository download.
  let bootstrapBuild = readFileSync(bootstrapBuildPath, 'utf8');
  bootstrapBuild = replaceExactly(
    bootstrapBuild,
    'PACKAGES+=("bzip2")',
    'PACKAGES+=("libbz2") # Emits the bzip2 command subpackage.',
    'bootstrap bzip2 source recipe migration'
  );
  writeFileSync(bootstrapBuildPath, bootstrapBuild);

  // termux-am uses Android Gradle Plugin 7.4, which requires platform 33 and
  // build-tools 30.0.3. The pinned package-builder image intentionally ships
  // newer common SDK parts instead. Letting Gradle install those missing parts
  // into the image SDK fails in the container with "Failed to read or create
  // install properties file". Provision the two pinned components into a
  // package-private, writable SDK root before Gradle starts. The command-line
  // tools and accepted licences come from the pinned builder image; all added
  // SDK data stays under termux-am's disposable package tmp directory.
  let termuxAmRecipe = readFileSync(termuxAmRecipePath, 'utf8');
  const termuxAmGradleInvocation = [
    '\texport ANDROID_HOME',
    '\texport GRADLE_OPTS="-Dorg.gradle.daemon=false -Xmx1536m -Dorg.gradle.java.home=/usr/lib/jvm/java-1.17.0-openjdk-amd64"',
    '',
    '\t$TERMUX_PKG_TMPDIR/gradle/gradle-$_GRADLE_VERSION/bin/gradle \\',
    '\t\t:app:assembleRelease',
  ].join('\n');
  const copperTermuxAmSdkProvisioning = [
    '\t# Keep the package-builder SDK immutable: Gradle 7.4 needs these older',
    '\t# components, so install them in this package\'s writable temporary SDK.',
    '\tlocal termux_am_sdk_source="$ANDROID_HOME"',
    '\tlocal termux_am_sdk_root="$TERMUX_PKG_TMPDIR/android-sdk"',
    '\tlocal termux_am_sdkmanager=""',
    '\tfor candidate in "$termux_am_sdk_source/cmdline-tools/latest/bin/sdkmanager" "$termux_am_sdk_source/cmdline-tools/bin/sdkmanager"; do',
    '\t\tif [ -x "$candidate" ]; then',
    '\t\t\ttermux_am_sdkmanager="$candidate"',
    '\t\t\tbreak',
    '\t\tfi',
    '\tdone',
    '\tif [ -z "$termux_am_sdkmanager" ]; then',
    '\t\techo "ERROR: termux-am could not find sdkmanager in $termux_am_sdk_source" >&2',
    '\t\treturn 1',
    '\tfi',
    '\tmkdir -p "$termux_am_sdk_root"',
    '\tcp -a "$termux_am_sdk_source/licenses" "$termux_am_sdk_root/"',
    '\texport ANDROID_HOME="$termux_am_sdk_root"',
    '\texport ANDROID_SDK_ROOT="$termux_am_sdk_root"',
    '\t# build-package.sh enables pipefail. sdkmanager exits successfully once',
    '\t# it has consumed enough answers, which gives yes SIGPIPE (141). Preserve',
    '\t# the sdkmanager result while deliberately ignoring that producer status.',
    '\ttermux_am_sdkmanager_yes() {',
    '\t\tyes | "$termux_am_sdkmanager" --sdk_root="$termux_am_sdk_root" "$@" || {',
    '\t\t\tlocal termux_am_sdkmanager_status="${PIPESTATUS[1]}"',
    '\t\t\tif [ "$termux_am_sdkmanager_status" -ne 0 ]; then',
    '\t\t\t\treturn "$termux_am_sdkmanager_status"',
    '\t\t\tfi',
    '\t\t}',
    '\t}',
    '\ttermux_am_sdkmanager_yes --licenses >/dev/null',
    '\ttermux_am_sdkmanager_yes \\',
    '\t\t"platform-tools" \\',
    '\t\t"platforms;android-33" \\',
    '\t\t"build-tools;30.0.3"',
    '',
    '\texport GRADLE_OPTS="-Dorg.gradle.daemon=false -Xmx1536m -Dorg.gradle.java.home=/usr/lib/jvm/java-1.17.0-openjdk-amd64"',
    '',
    '\t$TERMUX_PKG_TMPDIR/gradle/gradle-$_GRADLE_VERSION/bin/gradle \\',
    '\t\t:app:assembleRelease',
  ].join('\n');
  termuxAmRecipe = replaceExactly(
    termuxAmRecipe,
    termuxAmGradleInvocation,
    copperTermuxAmSdkProvisioning,
    'termux-am isolated Android SDK provisioning hook'
  );
  writeFileSync(termuxAmRecipePath, termuxAmRecipe);

  const receipt = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    purpose: 'Copper-prefix bootstrap and package build input',
    buildName: config.buildName,
    applicationId: config.applicationId,
    runtimePrefix: config.runtimePrefix,
    runtimeHome: config.runtimeHome,
    architecture: config.architecture,
    upstream: {
      termuxApp: lock.upstream.termuxApp.revision,
      termuxPackages: lock.upstream.termuxPackages.revision,
    },
    changes: [
      `TERMUX__NAME=\"${config.buildName}\" (a whitespace-free build token; the user-facing product name is \"${config.displayName}\")`,
      `TERMUX_APP__PACKAGE_NAME=\"${config.applicationId}\"`,
      'TERMUX__PROJECT_SUBDIR=\"copper-runtime\"',
      'TERMUX_APP__APP_IDENTIFIER=\"copper\"',
      'Optional COPPER_BOOTSTRAP_PRUNE_BUILD_TREES hook in build-package.sh to discard each completed package workspace before finish-build exits while retaining output .deb files, built-package markers, and shared toolchain cache.',
      'build-bootstraps.sh uses libbz2, the pinned source recipe that emits the bzip2 command subpackage, instead of the removed packages/bzip2 recipe.',
      'termux-am builds against an isolated writable SDK under its temporary package directory, with platforms;android-33 and build-tools;30.0.3 explicitly provisioned before Gradle runs.',
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
