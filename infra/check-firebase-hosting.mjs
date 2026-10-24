#!/usr/bin/env node
// Keep assets static and immutable; see infra/firebase/README.md.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(here, 'firebase', 'firebase.json');
const publicDir = path.join(here, 'firebase', 'public');

const failures = [];
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const hosting = config.hosting ?? {};

const assetHeader = (hosting.headers ?? [])
  .filter((entry) => entry.source === '/assets/**')
  .flatMap((entry) => entry.headers ?? [])
  .find((header) => header.key.toLowerCase() === 'cache-control');

if (!assetHeader) {
  failures.push('no Cache-Control declared for /assets/** — hashed assets would fall back to the Hosting default of one hour');
} else if (!/immutable/.test(assetHeader.value) || !/public/.test(assetHeader.value)) {
  failures.push(`/assets/** Cache-Control must be public and immutable, found: ${assetHeader.value}`);
}

const catchAll = (hosting.rewrites ?? []).find((rule) => rule.source === '**');
if (!catchAll?.run?.serviceId) {
  failures.push('no ** rewrite to Cloud Run — application routes must reach the origin');
}

// Static HTML would bypass the origin’s route-aware shell.
if (existsSync(publicDir)) {
  const stray = readdirSync(publicDir).filter((name) => name !== 'assets' && !name.startsWith('.'));
  if (stray.length > 0) {
    failures.push(`only assets/ may be uploaded to Hosting, found: ${stray.join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error('Firebase Hosting config:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Firebase Hosting: assets served by Hosting and immutable, everything else falls through to ${catchAll.run.serviceId}.`);
