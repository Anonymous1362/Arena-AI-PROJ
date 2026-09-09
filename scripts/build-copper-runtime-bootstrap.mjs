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
import { basename, posix, resolve } from 'node:path';
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

function commandFailureDetails(result) {
  const outputText = (value) => Buffer.isBuffer(value) ? value.toString('utf8').trim() : value?.trim() ?? '';
  const details = [
    result.error ? `${result.error.name}: ${result.error.message}` : '',
    outputText(result.stdout),
    outputText(result.stderr),
  ].filter(Boolean).join('\n');
  return details || `exit status ${result.status ?? 'unknown'}`;
}

function normalizedArchivePath(value) {
  // ZIP paths are always relative to the bootstrap prefix. Do not let an
  // upstream-format change turn a manifest path into an ambiguous traversal.
  const normalized = posix.normalize(value.replace(/^\.\//, ''));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) {
    return null;
  }
  return normalized;
}

function symlinkTargetArchivePath(linkPath, target) {
  if (posix.isAbsolute(target)) {
    // The upstream bootstrap legitimately contains absolute links below its
    // final prefix (for example, termux-keyring's trusted-key link). Keep the
    // final Copper prefix absolute after staging is promoted, but reject every
    // absolute target outside that exact configured runtime root.
    const runtimePrefix = posix.normalize(config.runtimePrefix).replace(/\/$/, '');
    const absoluteTarget = posix.normalize(target);
    if (!absoluteTarget.startsWith(`${runtimePrefix}/`)) return null;
    return normalizedArchivePath(absoluteTarget.slice(runtimePrefix.length + 1));
  }
  return normalizedArchivePath(posix.join(posix.dirname(linkPath), target));
}

function parseBootstrapSymlinks(contents) {
  const symlinks = new Map();
  for (const line of contents.split(/\r?\n/)) {
    if (!line) continue;
    const separator = line.indexOf('←');
    if (separator <= 0 || separator !== line.lastIndexOf('←') || separator === line.length - 1) {
      throw new Error(`Malformed bootstrap symlink manifest entry: ${line}`);
    }
    const link = normalizedArchivePath(line.slice(separator + 1));
    const target = line.slice(0, separator);
    if (!link || !symlinkTargetArchivePath(link, target)) {
      throw new Error(`Unsafe bootstrap symlink manifest entry: ${line}`);
    }
    if (symlinks.has(link)) throw new Error(`Duplicate bootstrap symlink manifest entry: ${link}`);
    symlinks.set(link, target);
  }
  return symlinks;
}

function validateConfiguredStartupTextMembers() {
  const members = config.bootstrap.startupTextMembers;
  if (!Array.isArray(members) || !members.length) {
    throw new Error('runtime bootstrap startupTextMembers must list the Copper login/bootstrap scripts to validate.');
  }
  const seen = new Set();
  for (const member of members) {
    if (!member || typeof member.archivePath !== 'string' || !normalizedArchivePath(member.archivePath) || !Array.isArray(member.requiredFragments) || !member.requiredFragments.length || member.requiredFragments.some((fragment) => typeof fragment !== 'string' || !fragment)) {
      throw new Error('runtime bootstrap startupTextMembers contains an invalid archive path or required fragment list.');
    }
    if (seen.has(member.archivePath)) throw new Error(`runtime bootstrap startupTextMembers lists ${member.archivePath} more than once.`);
    seen.add(member.archivePath);
  }
  return members;
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
  // Validate the post-build archive contract now as well, so --print-command
  // and generated-input checks fail before any Docker work if it is malformed.
  const configuredStartupTextMembers = validateConfiguredStartupTextMembers();

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

  // Run focused, dependency-ordered package preflights before the large
  // bootstrap graph. attr and its dependent libacl are deliberately first: a
  // real bootstrap previously spent almost an hour before their pinned source
  // hosts exhausted curl retries. termux-am remains the Android/Gradle gate
  // required by termux-tools. Their emitted .debs and built-package markers
  // are reused by build-bootstraps.
  const preflightPackages = [
    { name: 'attr', purpose: 'attr official Savannah OCF source delivery and checksum' },
    { name: 'libacl', purpose: 'libacl official Savannah OCF source delivery and checksum' },
    { name: 'termux-am', purpose: 'Android Gradle package build' },
    { name: 'termux-tools', purpose: 'Copper interactive login/profile configuration' },
  ];
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
  for (const preflightPackage of preflightPackages) {
    const preflightCommand = ['./scripts/run-docker.sh', './build-package.sh', '-a', config.architecture, preflightPackage.name];
    console.log(`Focused package preflight (${preflightPackage.purpose}): (cd ${packagesRoot} && ${preflightCommand.join(' ')})`);
  }
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
  for (const preflightPackage of preflightPackages) {
    const preflightCommand = ['./scripts/run-docker.sh', './build-package.sh', '-a', config.architecture, preflightPackage.name];
    const preflight = spawnSync(preflightCommand[0], preflightCommand.slice(1), {
      cwd: packagesRoot,
      stdio: 'inherit',
      env: buildEnvironment,
    });
    if (preflight.status !== 0) {
      throw new Error(`Copper ${preflightPackage.name} package preflight failed with exit code ${preflight.status ?? 'unknown'}. The full bootstrap was not started.`);
    }
    console.log(`Copper package preflight passed: ${preflightPackage.name} (${preflightPackage.purpose}).`);
  }
  if (preflightOnly) {
    console.log('Copper focused package preflights passed; --preflight-only did not start the full bootstrap.');
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

  // A full `unzip -t` prints one line for every file. A complete Termux-style
  // bootstrap easily exceeds Node's 1 MiB spawnSync output buffer even when
  // every archive member is valid. Test quietly, then query each required
  // entry individually so validation stays bounded and actionable.
  const verify = spawnSync('unzip', ['-tqq', expectedArchive], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (verify.status !== 0 || verify.error) {
    throw new Error(`Bootstrap integrity verification failed:\n${commandFailureDetails(verify)}`);
  }

  // The upstream bootstrap format deliberately removes every symlink before
  // zipping, then records it as `target←./path` in SYMLINKS.txt for the Android
  // installer to recreate. A runtime entry is therefore valid when it is a
  // direct ZIP member *or* an explicitly recorded bootstrap symlink.
  const symlinks = spawnSync('unzip', ['-p', expectedArchive, 'SYMLINKS.txt'], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (symlinks.status !== 0 || symlinks.error) {
    throw new Error(`Could not read bootstrap symlink manifest:\n${commandFailureDetails(symlinks)}`);
  }
  const recordedSymlinks = parseBootstrapSymlinks(symlinks.stdout);
  const directEntryCache = new Map();
  const directArchiveEntryExists = (archivePath) => {
    if (directEntryCache.has(archivePath)) return directEntryCache.get(archivePath);
    const entry = spawnSync('unzip', ['-Z1', expectedArchive, archivePath], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    if (entry.error) {
      throw new Error(`Could not inspect required runtime entry ${archivePath}:\n${commandFailureDetails(entry)}`);
    }
    const exists = entry.status === 0 && entry.stdout.split(/\r?\n/).includes(archivePath);
    directEntryCache.set(archivePath, exists);
    return exists;
  };

  // These generated shell/configuration files execute during login or package
  // setup. A prior candidate contained the right Copper bootstrap archive but
  // termux-tools' generated profile script still used its configure.ac default
  // of /data/data/com.termux, causing visible mkdir/cp failures on every
  // interactive shell. Scan every text member that can be executed or sourced
  // at runtime, then assert the three startup files' exact Copper fragments.
  const archiveEntries = spawnSync('unzip', ['-Z1', expectedArchive], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (archiveEntries.status !== 0 || archiveEntries.error) {
    throw new Error(`Could not list bootstrap archive members for runtime-path validation:\n${commandFailureDetails(archiveEntries)}`);
  }
  const archiveMemberNames = archiveEntries.stdout.split(/\r?\n/).filter(Boolean);
  const directArchiveEntries = new Set(archiveMemberNames);
  const runtimeTextMemberCache = new Map();
  const isRuntimeTextCandidate = (archivePath) => (
    archivePath.startsWith('etc/')
    || archivePath.startsWith('bin/')
    || archivePath.startsWith('libexec/')
    || /^var\/lib\/dpkg\/info\/[^/]+\.(?:preinst|postinst|prerm|postrm)$/.test(archivePath)
  );
  const readRuntimeTextMember = (archivePath) => {
    if (runtimeTextMemberCache.has(archivePath)) return runtimeTextMemberCache.get(archivePath);
    const sample = spawnSync('bash', ['-c', 'unzip -p "$1" "$2" | dd bs=4096 count=1 status=none', 'copper-bootstrap-text-sample', expectedArchive, archivePath], {
      encoding: 'buffer',
      maxBuffer: 8192,
    });
    if (sample.status !== 0 || sample.error) {
      throw new Error(`Could not sample runtime text member ${archivePath}:\n${commandFailureDetails(sample)}`);
    }
    // ELF and NUL-bearing members are executable data, not sourceable text.
    // Do not decode them as text merely to search for path-shaped byte strings.
    if (sample.stdout.includes(0) || sample.stdout.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      runtimeTextMemberCache.set(archivePath, null);
      return null;
    }
    const member = spawnSync('unzip', ['-p', expectedArchive, archivePath], {
      encoding: 'buffer',
      maxBuffer: 1024 * 1024,
    });
    if (member.status !== 0 || member.error) {
      throw new Error(`Could not read runtime text member ${archivePath}:\n${commandFailureDetails(member)}`);
    }
    if (member.stdout.includes(0)) {
      runtimeTextMemberCache.set(archivePath, null);
      return null;
    }
    const contents = member.stdout.toString('utf8');
    if (!Buffer.from(contents, 'utf8').equals(member.stdout)) {
      runtimeTextMemberCache.set(archivePath, null);
      return null;
    }
    runtimeTextMemberCache.set(archivePath, contents);
    return contents;
  };
  const legacyRuntimePath = /\/data\/(?:data|user\/[0-9]+)\/com\.termux(?:\/|$)/;
  const unresolvedCopperPlaceholder = /@TERMUX(?:_[A-Z0-9_]+)?@/;
  const runtimeTextFailures = [];
  let inspectedRuntimeTextMembers = 0;
  for (const archivePath of archiveMemberNames) {
    if (!isRuntimeTextCandidate(archivePath) || archivePath.endsWith('/')) continue;
    const contents = readRuntimeTextMember(archivePath);
    if (contents === null) continue;
    inspectedRuntimeTextMembers += 1;
    if (legacyRuntimePath.test(contents)) runtimeTextFailures.push(`${archivePath}: contains legacy /data/data/com.termux runtime path`);
    if (unresolvedCopperPlaceholder.test(contents)) runtimeTextFailures.push(`${archivePath}: contains unresolved @TERMUX_*@ bootstrap placeholder`);
  }
  if (runtimeTextFailures.length) {
    throw new Error(`Bootstrap runtime text-path validation failed:\n${runtimeTextFailures.slice(0, 20).join('\n')}`);
  }
  for (const { archivePath, requiredFragments } of configuredStartupTextMembers) {
    if (!directArchiveEntries.has(archivePath)) {
      throw new Error(`Bootstrap is missing required direct startup text member: ${archivePath}`);
    }
    const contents = readRuntimeTextMember(archivePath);
    if (contents === null) {
      throw new Error(`Bootstrap startup member is not UTF-8 text: ${archivePath}`);
    }
    const missingFragments = requiredFragments.filter((fragment) => !contents.includes(fragment));
    if (missingFragments.length) {
      throw new Error(`Bootstrap startup member ${archivePath} is not fully repathed for Copper; missing: ${missingFragments.map((fragment) => JSON.stringify(fragment)).join(', ')}`);
    }
    console.log(`Copper repathed startup member verified: ${archivePath}`);
  }
  console.log(`Copper runtime text-path scan verified: ${inspectedRuntimeTextMembers} executable/configuration text members contain no legacy Termux root or unresolved bootstrap placeholder.`);

  // This is the post-build regression evidence for the actual on-device
  // failure: Perl uses /proc/self/exe for $^X, while termux-exec launches
  // private ELF files through Android's linker. `useshrplib` puts caretx.c in
  // Perl's CORE libperl.so, while bin/perl is only the ELF launcher. Validate
  // both roles explicitly: the launcher must be a direct executable and the
  // one direct CORE library must carry the compiled repair. Looking only in
  // bin/perl caused the 0c73a83 candidate to reject a successfully built Perl
  // before installer validation, even though it had progressed past the source
  // build and source-download gates.
  const perlBinary = spawnSync('unzip', ['-p', expectedArchive, 'bin/perl'], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (perlBinary.status !== 0 || perlBinary.error) {
    throw new Error(`Could not read compiled bin/perl launcher for system-linker $^X validation:\n${commandFailureDetails(perlBinary)}`);
  }
  if (!perlBinary.stdout.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    throw new Error('Compiled bin/perl launcher is not a direct ELF archive member; review the system-linker $^X regression check deliberately.');
  }
  const perlCoreLibraries = archiveMemberNames.filter((archivePath) => (
    /^lib\/perl5\/[^/]+\/[^/]+-android\/CORE\/libperl\.so$/.test(archivePath)
  ));
  if (perlCoreLibraries.length !== 1) {
    throw new Error(`Expected exactly one direct Perl CORE libperl.so archive member for $^X validation, found ${perlCoreLibraries.length}: ${perlCoreLibraries.join(', ') || '(none)'}.`);
  }
  const [perlCoreLibraryPath] = perlCoreLibraries;
  const perlCoreLibrary = spawnSync('unzip', ['-p', expectedArchive, perlCoreLibraryPath], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (perlCoreLibrary.status !== 0 || perlCoreLibrary.error) {
    throw new Error(`Could not read compiled ${perlCoreLibraryPath} for system-linker $^X validation:\n${commandFailureDetails(perlCoreLibrary)}`);
  }
  if (!perlCoreLibrary.stdout.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    throw new Error(`Compiled ${perlCoreLibraryPath} is not a direct ELF archive member; review the system-linker $^X regression check deliberately.`);
  }
  if (!perlCoreLibrary.stdout.includes(Buffer.from('TERMUX_EXEC__PROC_SELF_EXE'))) {
    throw new Error(`Compiled ${perlCoreLibraryPath} is missing the TERMUX_EXEC__PROC_SELF_EXE $^X repair. Refusing the known-broken CPAN bootstrap path.`);
  }
  console.log(`Copper compiled Perl regression verified: bin/perl launcher and ${perlCoreLibraryPath} contain the expected system-linker $^X execution path.`);

  for (const requiredFile of config.bootstrap.requiredFiles) {
    const normalizedRequiredFile = normalizedArchivePath(requiredFile);
    if (!normalizedRequiredFile) throw new Error(`Unsafe configured required runtime entry: ${requiredFile}`);

    if (directArchiveEntryExists(normalizedRequiredFile)) {
      console.log(`Copper required runtime entry verified: ${normalizedRequiredFile}`);
      continue;
    }

    // Follow a bounded manifest-only chain and require its final target to be
    // a direct archive member. This validates the actual link destination,
    // rather than accepting a dangling SYMLINKS.txt line.
    let linkedPath = normalizedRequiredFile;
    const visited = new Set();
    let resolved = false;
    while (recordedSymlinks.has(linkedPath)) {
      if (visited.has(linkedPath)) throw new Error(`Bootstrap symlink cycle reaches required runtime entry: ${normalizedRequiredFile}`);
      visited.add(linkedPath);
      const target = recordedSymlinks.get(linkedPath);
      const targetPath = symlinkTargetArchivePath(linkedPath, target);
      if (!targetPath) throw new Error(`Bootstrap symlink for ${linkedPath} has an unsafe target: ${target}`);
      if (directArchiveEntryExists(targetPath)) {
        console.log(`Copper required runtime entry verified through SYMLINKS.txt: ${normalizedRequiredFile} -> ${targetPath}`);
        resolved = true;
        break;
      }
      linkedPath = targetPath;
    }
    if (!resolved) {
      throw new Error(`Bootstrap is missing required runtime entry or a resolvable symlink: ${normalizedRequiredFile}`);
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
    startupTextMembers: configuredStartupTextMembers.map(({ archivePath }) => archivePath),
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
