#!/usr/bin/env node
/**
 * Assemble a signed static APT repository from Copper-prefix .deb packages.
 *
 * The output uses the Termux APT layout expected by the Copper Runtime:
 *   dists/stable/main/binary-aarch64/{Packages,Packages.gz,Release,InRelease}
 *   pool/main/*.deb
 *
 * Publishing is blocked unless the repository is signed with a private archive
 * key supplied outside this repository. --allow-unsigned-draft exists only for
 * local layout verification and writes an explicit non-publishable marker.
 *
 * Usage:
 *   node scripts/build-copper-apt-repository.mjs \
 *     --packages /path/to/output --out /path/to/repository \
 *     --base-url https://packages.example.org/copper/apt/termux-main \
 *     --signing-key /secure/path/archive-secret.asc
 *
 * Local metadata test only (never publish this output):
 *   node scripts/build-copper-apt-repository.mjs \
 *     --packages /path/to/output --out /tmp/copper-repo \
 *     --base-url https://invalid.local/copper --allow-unsigned-draft
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(resolve(root, 'runtime/copper-runtime.config.json'), 'utf8'));
const args = process.argv.slice(2);

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/build-copper-apt-repository.mjs --packages /path --out /path --base-url https://host/path [--signing-key /secure/key.asc] [--allow-unsigned-draft]');
  process.exit(1);
}

function value(flag, required = true) {
  const index = args.indexOf(flag);
  if (index === -1) {
    if (required) usage(`Missing ${flag}.`);
    return null;
  }
  const result = args[index + 1];
  if (!result || result.startsWith('--')) usage(`Missing value for ${flag}.`);
  return result;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function command(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${commandName} ${commandArgs.join(' ')} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
  return result.stdout;
}

function ensureExecutable(commandName, help) {
  const result = spawnSync(commandName, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${commandName} is required. ${help}`);
}

function writeRelease(directory, baseUrl, packageFiles) {
  const releaseDirectory = resolve(directory, `dists/${config.repository.channel}`);
  const entries = [];
  for (const file of packageFiles) {
    const fullPath = resolve(releaseDirectory, file);
    entries.push({ file, size: statSync(fullPath).size, sha256: sha256(fullPath) });
  }

  const date = process.env.SOURCE_DATE_EPOCH
    ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toUTCString()
    : new Date().toUTCString();
  const content = [
    'Origin: Copper Runtime',
    'Label: Copper Runtime',
    `Suite: ${config.repository.channel}`,
    `Codename: ${config.repository.channel}`,
    `Date: ${date}`,
    `Architectures: ${config.repository.architecture} all`,
    `Components: ${config.repository.component}`,
    `Description: Copper-controlled packages for ${config.applicationId}`,
    `Acquire-By-Hash: yes`,
    `Copper-Repository-URL: ${baseUrl}`,
    'SHA256:',
    ...entries.map((entry) => ` ${entry.sha256} ${entry.size.toString().padStart(16, ' ')} ${entry.file}`),
    '',
  ].join('\n');
  writeFileSync(resolve(releaseDirectory, 'Release'), content);
  return entries;
}

function signRelease(stagingDirectory, signingKey) {
  ensureExecutable('gpg', 'Install GnuPG in the secure release environment.');
  const gpgHome = resolve(dirname(stagingDirectory), `.gnupg-copper-${randomUUID()}`);
  mkdirSync(gpgHome, { recursive: true, mode: 0o700 });
  try {
    command('gpg', ['--batch', '--homedir', gpgHome, '--import', signingKey]);
    const keys = command('gpg', ['--batch', '--homedir', gpgHome, '--with-colons', '--list-secret-keys']);
    const fingerprint = keys.split(/\r?\n/).find((line) => line.startsWith('fpr:'))?.split(':')[9];
    if (!fingerprint) throw new Error('The supplied signing key does not contain a usable private key.');

    const release = resolve(stagingDirectory, `dists/${config.repository.channel}/Release`);
    const inRelease = resolve(stagingDirectory, `dists/${config.repository.channel}/InRelease`);
    const detached = resolve(stagingDirectory, `dists/${config.repository.channel}/Release.gpg`);
    const passphrase = process.env.COPPER_RUNTIME_APT_KEY_PASSPHRASE;
    const passphraseArgs = passphrase === undefined
      ? []
      : ['--pinentry-mode', 'loopback', '--passphrase', passphrase];

    command('gpg', ['--batch', '--yes', '--homedir', gpgHome, ...passphraseArgs, '--local-user', fingerprint, '--clearsign', '--output', inRelease, release]);
    command('gpg', ['--batch', '--yes', '--homedir', gpgHome, ...passphraseArgs, '--local-user', fingerprint, '--detach-sign', '--output', detached, release]);
    const publicKey = command('gpg', ['--batch', '--homedir', gpgHome, '--armor', '--export', fingerprint]);
    writeFileSync(resolve(stagingDirectory, 'copper-runtime-archive-keyring.asc'), publicKey);
    return fingerprint;
  } finally {
    rmSync(gpgHome, { recursive: true, force: true });
  }
}

try {
  const knownFlags = new Set(['--packages', '--out', '--base-url', '--signing-key', '--allow-unsigned-draft']);
  if (args.some((arg) => arg.startsWith('--') && !knownFlags.has(arg))) usage('Unknown option.');
  const packagesDirectory = resolve(value('--packages'));
  const outputDirectory = resolve(value('--out'));
  const baseUrl = value('--base-url').replace(/\/+$/, '');
  const signingKeyValue = value('--signing-key', false);
  const unsignedDraft = args.includes('--allow-unsigned-draft');

  if (!/^https:\/\/[^\s]+$/i.test(baseUrl)) usage('--base-url must be an HTTPS URL.');
  if (signingKeyValue && unsignedDraft) usage('Choose a signing key or an unsigned draft, not both.');
  if (!signingKeyValue && !unsignedDraft) {
    throw new Error('Refusing to create a publishable unsigned APT repository. Supply --signing-key, or use --allow-unsigned-draft only for a local layout check.');
  }
  if (!existsSync(packagesDirectory)) throw new Error(`Package directory does not exist: ${packagesDirectory}`);
  if (existsSync(outputDirectory) && readdirSync(outputDirectory).length) throw new Error(`Output directory must be empty: ${outputDirectory}`);

  ensureExecutable('dpkg-scanpackages', 'Install dpkg-dev in the build environment.');
  ensureExecutable('gzip', 'Install gzip in the build environment.');

  const packages = readdirSync(packagesDirectory)
    .filter((entry) => entry.endsWith('.deb'))
    .map((entry) => resolve(packagesDirectory, entry));
  if (!packages.length) throw new Error(`No .deb packages were found in ${packagesDirectory}.`);

  const packageRecords = packages.map((file) => {
    ensureExecutable('dpkg-deb', 'Install dpkg in the build environment.');
    const fields = command('dpkg-deb', ['-W', '--showformat=${Package}\\n${Version}\\n${Architecture}\\n', file]).trim().split(/\r?\n/);
    const [name, version, architecture] = fields;
    if (!name || !version || !architecture) throw new Error(`Could not read package control fields from ${file}.`);
    if (architecture !== config.repository.architecture && architecture !== 'all') {
      throw new Error(`${basename(file)} targets ${architecture}; expected ${config.repository.architecture} or all.`);
    }
    return { file, name, version, architecture, sha256: sha256(file), sizeBytes: statSync(file).size };
  });

  const stagingDirectory = resolve(dirname(outputDirectory), `.${basename(outputDirectory)}.staging-${randomUUID()}`);
  rmSync(stagingDirectory, { recursive: true, force: true });
  mkdirSync(resolve(stagingDirectory, 'pool/main'), { recursive: true });
  mkdirSync(resolve(stagingDirectory, `dists/${config.repository.channel}/main/binary-${config.repository.architecture}`), { recursive: true });

  try {
    for (const record of packageRecords) copyFileSync(record.file, resolve(stagingDirectory, 'pool/main', basename(record.file)));

    const packageIndex = command(
      'dpkg-scanpackages',
      ['--arch', config.repository.architecture, 'pool/main', '/dev/null'],
      { cwd: stagingDirectory }
    );
    if (!packageIndex.includes(`Architecture: ${config.repository.architecture}`) && !packageIndex.includes('Architecture: all')) {
      throw new Error('Generated Packages index does not contain the expected Copper Runtime architecture.');
    }
    const indexPath = resolve(stagingDirectory, `dists/${config.repository.channel}/main/binary-${config.repository.architecture}/Packages`);
    writeFileSync(indexPath, packageIndex);
    command('gzip', ['-n', '-9', '-k', indexPath]);

    // Apt may request immutable by-hash index paths when Release advertises
    // Acquire-By-Hash. Materialize those paths rather than relying on fallback.
    for (const indexFile of [indexPath, `${indexPath}.gz`]) {
      const byHashDirectory = resolve(dirname(indexFile), 'by-hash/SHA256');
      mkdirSync(byHashDirectory, { recursive: true });
      copyFileSync(indexFile, resolve(byHashDirectory, sha256(indexFile)));
    }

    const releaseEntries = writeRelease(stagingDirectory, baseUrl, [ 
      `main/binary-${config.repository.architecture}/Packages`,
      `main/binary-${config.repository.architecture}/Packages.gz`,
    ]);
    const fingerprint = signingKeyValue ? signRelease(stagingDirectory, resolve(signingKeyValue)) : null;
    if (!fingerprint) {
      writeFileSync(resolve(stagingDirectory, 'DRAFT-NOT-FOR-PUBLISHING.txt'), 'This APT repository metadata is intentionally unsigned and must never be published or configured in Copper Runtime.\n');
    }

    const manifest = {
      schemaVersion: 1,
      product: 'Copper Runtime package repository',
      createdAt: new Date().toISOString(),
      url: baseUrl,
      suite: config.repository.channel,
      component: config.repository.component,
      architecture: config.repository.architecture,
      signed: Boolean(fingerprint),
      signingKeyFingerprint: fingerprint,
      publishable: Boolean(fingerprint),
      packages: packageRecords,
      releaseFiles: releaseEntries.map((entry) => ({ ...entry, path: relative(stagingDirectory, resolve(stagingDirectory, `dists/${config.repository.channel}`, entry.file)) })),
    };
    writeFileSync(resolve(stagingDirectory, 'copper-runtime-repository.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    mkdirSync(dirname(outputDirectory), { recursive: true });
    renameSync(stagingDirectory, outputDirectory);
    console.log(`${fingerprint ? 'Signed' : 'UNSIGNED DRAFT'} Copper Runtime APT repository created at ${outputDirectory}`);
    if (fingerprint) console.log(`Archive signing key fingerprint: ${fingerprint}`);
  } catch (error) {
    rmSync(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
} catch (error) {
  console.error(`Copper Runtime repository build failed: ${error.message}`);
  process.exit(1);
}
