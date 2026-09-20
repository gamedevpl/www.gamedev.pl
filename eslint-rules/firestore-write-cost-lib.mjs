/**
 * Per-operation Firestore write-path cost ratchet.
 *
 *   npm run firestore-write-cost
 *   npm run firestore-write-cost -- "setSubmissionTitle" --write --force
 *   npm run firestore-write-cost -- --write --reseal
 *
 * The read ratchet pins what a poll costs. It cannot see the other half: a
 * shelf-relevant write rebuilds the owner's document, and a rebuild reads every round
 * they own. #1416 deferred measuring that — "reads are now cheap and writes are
 * untouched; that is the next thing to measure, not something to guess at here".
 *
 * This is that measurement. Each operation is measured twice, against the same owner at
 * two sizes, so the baseline shows the *slope* rather than one number: a cost that
 * differs between 3 and 24 rounds is per-round, and a creator with 553 of them pays it
 * 553 times. `claimSeal` is the control — it tombstones instead of rebuilding, so it
 * should stay flat, and a change that makes the setters flat too is the point.
 *
 * Same shape as the read ratchet, and it reuses that module's comparison so the two
 * cannot drift apart. Scope a raise to the operation that grew.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareRouteReads, filterMeasuredRoutes, nextRouteBaseline } from './firestore-read-cost-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const FIRESTORE_WRITE_COST_BASELINE_PATH = path.join(here, 'firestore-write-cost-baseline.json');

/**
 * @param {string} [filePath]
 */
export function loadFirestoreWriteCostBaseline(filePath = FIRESTORE_WRITE_COST_BASELINE_PATH) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (parsed.version !== 1 || typeof parsed.operations !== 'object' || parsed.operations === null) {
    throw new Error(`invalid firestore-write-cost baseline at ${filePath}`);
  }
  return parsed;
}

/** The shared helpers speak `routes`; the file speaks `operations`. */
function asRoutes(baseline) {
  return { routes: baseline?.operations ?? {} };
}

export function baselineCostFor(baseline, operation) {
  return baseline.operations[operation] ?? 0;
}

export function filterMeasuredOperations(measured, filters) {
  return filterMeasuredRoutes(measured, filters);
}

export function compareOperationCosts(baseline, measured, targets) {
  return compareRouteReads(asRoutes(baseline), measured, targets).map(({ route, reads, allowed, isNew }) => ({
    operation: route,
    cost: reads,
    allowed,
    isNew,
  }));
}

/**
 * @param {{ operations: Record<string, number> } | null} baseline
 * @param {Record<string, number>} measured
 * @param {{ force: boolean, reseal: boolean, filters: string[] }} opts
 */
export function nextOperationBaseline(baseline, measured, opts) {
  const { payload, refused, changed } = nextRouteBaseline(baseline ? asRoutes(baseline) : null, measured, opts);
  return {
    payload: { version: 1, operations: payload.routes },
    refused,
    changed: changed.map(({ route, from, to }) => ({ operation: route, from, to })),
  };
}

/**
 * A slope is measured with one dimension moving. Rounds and games both cost,
 * and a seed with one game per round reports their sum as if it were per round.
 *
 * @param {Record<string, number>} measured
 * @param {string} operation
 * @param {{ from: string, to: string, steps: number }} axis
 * @param {'reads' | 'writes'} metric
 */
export function slopeBetween(measured, operation, axis, metric) {
  const from = measured[`${operation} (${axis.from}) ${metric}`];
  const to = measured[`${operation} (${axis.to}) ${metric}`];
  if (typeof from !== 'number' || typeof to !== 'number') return null;
  return Math.round(((to - from) / axis.steps) * 100) / 100;
}
