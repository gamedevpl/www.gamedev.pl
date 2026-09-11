#!/usr/bin/env node
// Assert the Hosting config keeps the properties the CDN evaluation depends on.
//
// Measured on a live preview channel, 2026-09-04: Firebase Hosting appends `cookie` to
// `Vary` on every response it takes from a Cloud Run rewrite. Signed-in callers each carry a
// distinct __session, so an asset fetched through the rewrite gets its own cache entry per
// user and the edge never serves a second person from it — confirmed by two requests with
// different cookies both reporting x-cache: MISS, against HIT/HIT/HIT with no cookie.
//
// Files Hosting serves itself do not carry `cookie` in Vary. So the built assets must be
// uploaded and served statically; routing them through the rewrite would leave a CDN that
// caches nothing for the only audience this product currently has.
//
// Nothing here is enforceable at runtime, which is why it is a lint gate.

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
  failures.push('no ** rewrite to Cloud Run — anything absent from Hosting must fall through to the origin, which is what keeps a hash mismatch from 404ing');
}

// index.html must NOT be uploaded: Hosting matches static files before rewrites, so shipping
// it here would bypass the origin's SPA shell handling, which answers a real 404 for unknown
// deep links and 200 only for known ones.
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
