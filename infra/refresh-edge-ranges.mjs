#!/usr/bin/env node
// Regenerate apps/api/src/platform/edge-ranges.json from Google's published ranges.
//
// The app trusts Fastly-Client-IP only when the peer Cloud Run appended to X-Forwarded-For
// is one of Google's own addresses — the Hosting rewrite arrives from there, a direct
// caller never does. Google documents the set as goog.json minus cloud.json, cloud.json
// being the ranges customers can hold; a caller on a GCE VM sits there and is excluded.
//
// Both lists are stored verbatim and the subtraction happens per address at runtime.
// Subtracting prefix strings is wrong: goog.json carries parents like 104.196.0.0/14
// whose space cloud.json covers with narrower prefixes, so a string diff would keep the
// parent and admit a customer VM at 104.196.5.5. Checked, not assumed.
//
//   node infra/refresh-edge-ranges.mjs
//
// Commit the result. The app also refreshes in the background and falls back to this
// snapshot, so a stale file means a newly added Google range is not yet trusted — which
// the untrusted-edge metric makes visible — never a hole.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'apps', 'api', 'src', 'platform', 'edge-ranges.json');

async function prefixes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const body = await res.json();
  return body.prefixes.map((p) => p.ipv4Prefix ?? p.ipv6Prefix).filter(Boolean);
}

const [google, customer] = await Promise.all([
  prefixes('https://www.gstatic.com/ipranges/goog.json'),
  prefixes('https://www.gstatic.com/ipranges/cloud.json'),
]);

writeFileSync(
  target,
  `${JSON.stringify({ fetchedAt: new Date().toISOString(), google: google.sort(), customer: customer.sort() }, null, 2)}\n`,
);
console.log(`edge-ranges.json: ${google.length} Google prefixes, ${customer.length} customer prefixes.`);
