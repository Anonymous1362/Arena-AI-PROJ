#!/usr/bin/env node
/**
 * Post-processes the exported web dist:
 *  - injects PWA head tags (manifest, install metas, icons)
 * Idempotent — safe to run twice.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const file = join(dist, 'index.html');
if (!existsSync(file)) {
  console.error(`patch-web-dist: ${file} not found`);
  process.exit(1);
}

let html = readFileSync(file, 'utf8');
const tags = [
  '<link rel="manifest" href="manifest.json" />',
  '<link rel="apple-touch-icon" href="icons/icon-512.png" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="Aurora" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
].join('\n    ');

if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', `    ${tags}\n  </head>`);
  writeFileSync(file, html);
  console.log('patch-web-dist: injected PWA tags into', file);
} else {
  console.log('patch-web-dist: already patched, skipping');
}
