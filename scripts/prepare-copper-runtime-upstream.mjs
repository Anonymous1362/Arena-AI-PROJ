#!/usr/bin/env node
/**
 * Fetch the exact Termux source revisions pinned for Copper Runtime work.
 *
 * This script deliberately places upstream source in an ignored working cache.
 * It does not copy GPL-covered source into Copper, build a bootstrap, or publish
 * a binary. Those steps require the compliance work documented in
 * docs/COPPER-RUNTIME.md.
 *
 * Usage:
 *   node scripts/prepare-copper-runtime-upstream.mjs
 *   node scripts/prepare-copper-runtime-upstream.mjs --dir /absolute/work/path
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lock = JSON.parse(readFileSync(resolve(root, 'runtime/copper-runtime.lock.json'), 'utf8'));
const args = process.argv.slice(2);
const directoryFlag = args.indexOf('--dir');

if (args.length && (directoryFlag === -1 || directoryFlag + 1 >= args.length || args.length !== 2)) {
  console.error('Usage: node scripts/prepare-copper-runtime-upstream.mjs [--dir /absolute/work/path]');
  process.exit(1);
}

const workspace = directoryFlag === -1
  ? resolve(root, '.cache/copper-runtime-upstream')
  : resolve(args[directoryFlag + 1]);

function run(command, commandArgs, options = {}) {
  console.log(`$ ${[command, ...commandArgs].join(' ')}`);
  execFileSync(command, commandArgs, { stdio: 'inherit', ...options });
}

function ensureCleanCheckout(destination, source) {
  if (!existsSync(destination)) {
    run('git', ['clone', '--depth', '1', '--no-tags', source.repository, destination]);
  }

  const status = execFileSync('git', ['-C', destination, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (status) {
    throw new Error(`Refusing to update ${destination}: its checkout has uncommitted changes.`);
  }

  run('git', ['-C', destination, 'fetch', '--depth', '1', 'origin', source.revision]);
  run('git', ['-C', destination, 'checkout', '--detach', '--force', source.revision]);
  const actual = execFileSync('git', ['-C', destination, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actual !== source.revision) {
    throw new Error(`Pinned revision verification failed for ${destination}: expected ${source.revision}, received ${actual}.`);
  }
}

try {
  run('git', ['--version']);
  mkdirSync(workspace, { recursive: true });

  ensureCleanCheckout(resolve(workspace, 'termux-app'), lock.upstream.termuxApp);
  ensureCleanCheckout(resolve(workspace, 'termux-packages'), lock.upstream.termuxPackages);

  console.log('\nUpstream source is ready in:');
  console.log(`  ${workspace}`);
  console.log('\nNext: apply Copper-specific GPL-compliant patches and build a Copper-prefix arm64 bootstrap.');
  console.log('Read docs/COPPER-RUNTIME.md before importing source or distributing binaries.');
} catch (error) {
  console.error(`\nCopper Runtime upstream preparation failed: ${error.message}`);
  process.exit(1);
}
