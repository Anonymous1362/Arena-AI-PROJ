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
const termuxCoreRecipePath = resolve(packagesRoot, 'packages/termux-core/build.sh');
const termuxExecRecipePath = resolve(packagesRoot, 'packages/termux-exec/build.sh');
const termuxToolsRecipePath = resolve(packagesRoot, 'packages/termux-tools/build.sh');
const attrRecipePath = resolve(packagesRoot, 'packages/attr/build.sh');
const libaclRecipePath = resolve(packagesRoot, 'packages/libacl/build.sh');
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
  if (config.packageManager !== 'apt') {
    throw new Error(`Copper's current bootstrap layout requires packageManager "apt", received ${JSON.stringify(config.packageManager)}.`);
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
  // build-bootstraps.sh has its own archive-assembly path, unlike
  // build-package.sh. It reads properties.sh but never calls the package-build
  // variable setup that normally exports TERMUX_PACKAGE_MANAGER. Consequently
  // its second-stage template substituted an empty manager, producing the
  // on-device `[: -: unary operator expected` at the pacman branch. Fix only
  // that missing initializer and keep the Copper apt selection explicit.
  const bootstrapPropertyImports = [
    '. "${TERMUX_SCRIPTDIR}"/scripts/properties.sh',
    '. "${TERMUX_SCRIPTDIR}"/scripts/build/termux_step_handle_buildarch.sh',
  ].join('\n');
  const copperBootstrapPropertyImports = [
    '. "${TERMUX_SCRIPTDIR}"/scripts/properties.sh',
    `TERMUX_PACKAGE_MANAGER="${config.packageManager}"`,
    'export TERMUX_PACKAGE_MANAGER',
    '. "${TERMUX_SCRIPTDIR}"/scripts/build/termux_step_handle_buildarch.sh',
  ].join('\n');
  bootstrapBuild = replaceExactly(
    bootstrapBuild,
    bootstrapPropertyImports,
    copperBootstrapPropertyImports,
    'bootstrap second-stage package-manager initializer'
  );
  bootstrapBuild = replaceExactly(
    bootstrapBuild,
    'add_termux_bootstrap_second_stage_files "$package_arch"',
    'add_termux_bootstrap_second_stage_files "$TERMUX_ARCH"',
    'bootstrap second-stage architecture argument'
  );
  // run-docker mounts the repository root with the hosted runner's checkout
  // permissions. The package-builder has already proven output/ is writable
  // by emitting every .deb there, while the mount root may not be writable at
  // archive-finalization time. Export the finished ZIP beside those .debs.
  bootstrapBuild = replaceExactly(
    bootstrapBuild,
    '\tmv -f "${BOOTSTRAP_TMPDIR}/bootstrap-${1}.zip" "$TERMUX_PACKAGES_DIRECTORY/"',
    '\tmv -f "${BOOTSTRAP_TMPDIR}/bootstrap-${1}.zip" "$TERMUX_BUILT_DEBS_DIRECTORY/"',
    'bootstrap archive writable output destination'
  );
  writeFileSync(bootstrapBuildPath, bootstrapBuild);

  // termux-tools generates the shell login and profile scripts from
  // configure.ac. Its upstream defaults are deliberately the Termux app's
  // package/root/prefix when these configure environment variables are absent.
  // The earlier Copper patch only repathed package-builder properties, so this
  // configure step silently embedded /data/data/com.termux in the generated
  // init-termux-properties.sh. That script runs on every interactive login and
  // was the source of the on-device mkdir/cp failures. Export each upstream
  // configure input from the already-configured Copper runtime values before
  // configure runs; keep the existing autoreconf step intact.
  let termuxToolsRecipe = readFileSync(termuxToolsRecipePath, 'utf8');
  const termuxToolsPreConfigure = [
    'termux_step_pre_configure() {',
    '\tautoreconf -vfi',
    '}',
  ].join('\n');
  const copperTermuxToolsPreConfigure = [
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
  termuxToolsRecipe = replaceExactly(
    termuxToolsRecipe,
    termuxToolsPreConfigure,
    copperTermuxToolsPreConfigure,
    'termux-tools configure environment repath hook'
  );
  writeFileSync(termuxToolsRecipePath, termuxToolsRecipe);

  // termux-core injects reusable shell functions after its first constant
  // substitution pass. Its upstream marker comments intentionally preserve
  // `@TERMUX_*@` labels, which made the Copper archive validation correctly
  // reject the resulting runtime files as unresolved placeholders. Normalise
  // only those generated comment labels after `make install`; real executable
  // placeholders still remain failures, both here and in archive validation.
  let termuxCoreRecipe = readFileSync(termuxCoreRecipePath, 'utf8');
  const termuxCoreAutoUpdate = 'TERMUX_PKG_AUTO_UPDATE=true\n';
  const copperTermuxCoreRuntimeTextRepair = [
    'TERMUX_PKG_AUTO_UPDATE=true',
    '',
    'termux_step_post_make_install() {',
    '\t# termux-core adds reusable functions after the initial source render.',
    '\t# Rename only their literal annotation labels; do not mask executable placeholders.',
    '\tlocal copper_core_scripts="$TERMUX_PREFIX/bin"',
    '\tif [ ! -d "$copper_core_scripts" ]; then',
    '\t\techo "ERROR: termux-core installed script directory is missing: $copper_core_scripts" >&2',
    '\t\treturn 1',
    '\tfi',
    '\tlocal copper_core_script',
    '\twhile IFS= read -r -d \"\" copper_core_script; do',
    '\t\tsed -E -i \'/^[[:space:]]*##### .*replaced at build time\\./ s/@(TERMUX[A-Z0-9_]*)@/[\\1]/g\' "$copper_core_script"',
    '\tdone < <(find "$copper_core_scripts" -maxdepth 1 -type f -print0)',
    '\tif grep -R -E -n \'@TERMUX(_[A-Z0-9_]+)?@\' "$copper_core_scripts"; then',
    '\t\techo "ERROR: termux-core retained an unresolved runtime placeholder." >&2',
    '\t\treturn 1',
    '\tfi',
    '}',
    '',
  ].join('\n');
  termuxCoreRecipe = replaceExactly(
    termuxCoreRecipe,
    termuxCoreAutoUpdate,
    copperTermuxCoreRuntimeTextRepair,
    'termux-core generated runtime placeholder-label repair hook'
  );
  writeFileSync(termuxCoreRecipePath, termuxCoreRecipe);

  // termux-exec's generated management script contains a historical Termux
  // path in a diagnostic comment. The comment is not executable, but it would
  // make the runtime archive ambiguous and violate the Copper path gate. Repath
  // the actual generated member after Make has produced it, then fail if that
  // exact legacy path remains. No executable check is bypassed or ignored.
  let termuxExecRecipe = readFileSync(termuxExecRecipePath, 'utf8');
  const termuxExecAutoUpdate = 'TERMUX_PKG_AUTO_UPDATE=true\n';
  const copperTermuxExecRuntimeTextRepair = [
    'TERMUX_PKG_AUTO_UPDATE=true',
    '',
    'termux_step_post_make_install() {',
    '\tlocal copper_exec_script="$TERMUX_PREFIX/bin/termux-exec-ld-preload-lib"',
    '\tlocal copper_legacy_runtime_path="/data/data/com.termux/files/usr"',
    '\tif [ ! -f "$copper_exec_script" ]; then',
    '\t\techo "ERROR: termux-exec generated script is missing: $copper_exec_script" >&2',
    '\t\treturn 1',
    '\tfi',
    '\tsed -i "s|$copper_legacy_runtime_path|$TERMUX__PREFIX|g" "$copper_exec_script"',
    '\tif grep -F -q "$copper_legacy_runtime_path" "$copper_exec_script"; then',
    '\t\techo "ERROR: termux-exec retained a legacy com.termux runtime path." >&2',
    '\t\treturn 1',
    '\tfi',
    '}',
    '',
  ].join('\n');
  termuxExecRecipe = replaceExactly(
    termuxExecRecipe,
    termuxExecAutoUpdate,
    copperTermuxExecRuntimeTextRepair,
    'termux-exec generated runtime legacy-path repair hook'
  );
  writeFileSync(termuxExecRecipePath, termuxExecRecipe);

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

  // The complete bootstrap failed only because the pinned attr source endpoint
  // spent its entire retry budget returning 502/zero-byte responses. Keep the
  // identical release and SHA-256 pin, but use Savannah's HTTPS mirror rather
  // than the unavailable plain-HTTP endpoint. This is deliberately scoped to
  // the exact pinned recipe, not a broad source-URL rewrite.
  let attrRecipe = readFileSync(attrRecipePath, 'utf8');
  attrRecipe = replaceExactly(
    attrRecipe,
    'TERMUX_PKG_SRCURL="http://download.savannah.gnu.org/releases/attr/attr-${TERMUX_PKG_VERSION}.tar.gz"',
    'TERMUX_PKG_SRCURL="https://download-mirror.savannah.gnu.org/releases/attr/attr-${TERMUX_PKG_VERSION}.tar.gz"',
    'attr 2.6.0 HTTPS source mirror'
  );
  writeFileSync(attrRecipePath, attrRecipe);

  // libacl is the next bootstrap dependency using the same Savannah release
  // infrastructure. The attr preflight proved the HTTPS mirror path; switch
  // this exact pinned ACL release before it can fail late in the full graph.
  // Its upstream SHA-256 remains unchanged and is verified before extraction.
  let libaclRecipe = readFileSync(libaclRecipePath, 'utf8');
  libaclRecipe = replaceExactly(
    libaclRecipe,
    'TERMUX_PKG_SRCURL=https://download.savannah.gnu.org/releases/acl/acl-${TERMUX_PKG_VERSION}.tar.gz',
    'TERMUX_PKG_SRCURL=https://download-mirror.savannah.gnu.org/releases/acl/acl-${TERMUX_PKG_VERSION}.tar.gz',
    'libacl 2.4.0 HTTPS source mirror'
  );
  writeFileSync(libaclRecipePath, libaclRecipe);

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
      `build-bootstraps.sh explicitly exports TERMUX_PACKAGE_MANAGER=${config.packageManager} and passes TERMUX_ARCH to the second-stage template, preventing blank package-manager/architecture substitutions in the archived bootstrap script.`,
      'build-bootstraps.sh exports bootstrap-<arch>.zip to output/, the package-builder writable output directory, instead of the repository-root bind mount.',
      'termux-tools exports Copper application/rootfs/cache/prefix/home/package-manager values before configure, preventing its generated interactive-login scripts from falling back to /data/data/com.termux.',
      'termux-core normalizes only post-render annotation labels in its installed scripts and then rejects any remaining unquoted @TERMUX_*@ runtime placeholder before packaging.',
      'termux-exec repaths its installed ld-preload management script’s historical diagnostic comment to the configured Copper prefix and rejects any remaining legacy com.termux path before packaging.',
      'termux-am builds against an isolated writable SDK under its temporary package directory, with platforms;android-33 and build-tools;30.0.3 explicitly provisioned before Gradle runs.',
      'attr 2.6.0 retains its pinned SHA-256 but downloads from Savannah’s HTTPS mirror instead of the unavailable plain-HTTP origin URL.',
      'libacl 2.4.0 retains its pinned SHA-256 but downloads from the same HTTPS Savannah mirror instead of the repeatedly unavailable origin URL.',
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
