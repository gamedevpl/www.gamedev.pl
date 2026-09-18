/**
 * Per-route Firestore billed-read ratchet.
 *
 *   npm run firestore-read-cost
 *   npm run firestore-read-cost -- "GET /api/submissions/mine"
 *   npm run firestore-read-cost -- "GET /api/submissions/mine" --write --force
 *   npm run firestore-read-cost -- --write --reseal
 *
 * Scope a raise to the route that grew. An unscoped --write also *lowers* every other
 * ceiling to its current size, which silently freezes routes nobody touched.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..');

export const FIRESTORE_READ_COST_BASELINE_PATH = path.join(here, 'firestore-read-cost-baseline.json');

/**
 * @param {string} [filePath]
 */
export function loadFirestoreReadCostBaseline(filePath = FIRESTORE_READ_COST_BASELINE_PATH) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (parsed.version !== 1 || typeof parsed.routes !== 'object' || parsed.routes === null) {
    throw new Error(`invalid firestore-read-cost baseline at ${filePath}`);
  }
  return parsed;
}

/** Missing route → new since the freeze → zero reads allowed until --write --force. */
export function baselineReadsFor(baseline, route) {
  return baseline.routes[route] ?? 0;
}

/**
 * @param {Record<string, number>} measured
 * @param {string[]} filters
 * @returns {string[]}
 */
export function filterMeasuredRoutes(measured, filters) {
  const routes = Object.keys(measured).sort();
  if (filters.length === 0) return routes;
  return routes.filter((route) => filters.some((f) => route === f || route.includes(f)));
}

/**
 * @param {{ routes: Record<string, number> }} baseline
 * @param {Record<string, number>} measured
 * @param {string[]} targets
 */
export function compareRouteReads(baseline, measured, targets) {
  /** @type {{ route: string, reads: number, allowed: number, isNew: boolean }[]} */
  const failures = [];
  for (const route of targets) {
    const reads = measured[route];
    const isNew = !(route in baseline.routes);
    const allowed = baselineReadsFor(baseline, route);
    if (reads > allowed) failures.push({ route, reads, allowed, isNew });
  }
  return failures;
}

/**
 * @param {{ routes: Record<string, number> } | null} baseline
 * @param {Record<string, number>} measured
 * @param {{ force: boolean, reseal: boolean, filters: string[] }} opts
 */
export function nextRouteBaseline(baseline, measured, opts) {
  /** @type {Record<string, number>} */
  const nextRoutes = { ...(baseline?.routes ?? {}) };
  if (opts.filters.length === 0) {
    for (const key of Object.keys(nextRoutes)) {
      if (!(key in measured)) delete nextRoutes[key];
    }
  }

  /** @type {string[]} */
  const refused = [];
  /** @type {{ route: string, from: number | undefined, to: number }[]} */
  const changed = [];
  for (const [route, reads] of Object.entries(measured)) {
    const prev = nextRoutes[route];
    if (reads > (prev ?? 0) && !opts.force) {
      refused.push(route);
      continue;
    }
    if (prev !== reads) changed.push({ route, from: prev, to: reads });
    nextRoutes[route] = reads;
  }

  const payload = {
    version: 1,
    routes: Object.fromEntries(Object.entries(nextRoutes).sort(([a], [b]) => a.localeCompare(b))),
  };
  return { payload, refused, changed };
}
