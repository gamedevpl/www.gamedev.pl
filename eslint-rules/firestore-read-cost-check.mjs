/**
 * Report (and optionally rewrite) per-route Firestore billed-read baselines.
 *
 *   npm run firestore-read-cost
 *   npm run firestore-read-cost -- "GET /api/submissions/mine"
 *   npm run firestore-read-cost -- "GET /api/submissions/mine" --write --force
 *   npm run firestore-read-cost -- --write --reseal
 *
 * Wired into `npm run lint` so the green gate seals it.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  FIRESTORE_READ_COST_BASELINE_PATH,
  REPO_ROOT,
  baselineReadsFor,
  compareRouteReads,
  filterMeasuredRoutes,
  loadFirestoreReadCostBaseline,
  nextRouteBaseline,
} from './firestore-read-cost-lib.mjs';

function measureRoutes() {
  const apiRoot = path.join(REPO_ROOT, 'apps/api');
  const script = path.join(apiRoot, 'src/store/firestore-read-cost.ts');
  const tsxCli = path.join(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
  if (!fs.existsSync(tsxCli)) throw new Error('tsx is not installed; run npm install');
  const result = spawnSync(process.execPath, [tsxCli, script], {
    cwd: apiRoot,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stderr.write(result.stdout);
    throw new Error('firestore-read-cost measurement failed');
  }
  const parsed = JSON.parse(result.stdout);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('firestore-read-cost measurement did not print a JSON object');
  }
  /** @type {Record<string, number>} */
  const measured = {};
  for (const [route, reads] of Object.entries(parsed)) {
    if (typeof reads !== 'number' || !Number.isFinite(reads)) {
      throw new Error(`firestore-read-cost measurement for ${route} is not a number`);
    }
    measured[route] = reads;
  }
  return measured;
}

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const force = argv.includes('--force');
  const reseal = argv.includes('--reseal');
  const filters = argv.filter((arg) => !arg.startsWith('--'));

  if (write && filters.length === 0 && !reseal) {
    console.error('Refusing an unscoped --write: it lowers every ceiling to current reads.');
    console.error('  Raising one route:  npm run firestore-read-cost -- <route> --write --force');
    console.error('  Really reseal all: npm run firestore-read-cost -- --write --reseal');
    process.exitCode = 1;
    return;
  }

  let baseline = null;
  try {
    baseline = loadFirestoreReadCostBaseline();
  } catch {
    if (!write) {
      console.error('No baseline file yet. Run with --write --reseal --force to create one.');
      process.exitCode = 1;
      return;
    }
  }

  const measured = measureRoutes();
  const targets = filterMeasuredRoutes(measured, filters);

  if (filters.length > 0 && targets.length === 0) {
    console.error(`No measured route matched: ${filters.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  if (filters.length === 0 && baseline) {
    for (const route of Object.keys(baseline.routes)) {
      if (!(route in measured)) {
        console.error(`${route}: in baseline but not measured this run.`);
        process.exitCode = 1;
      }
    }
    if (process.exitCode === 1) return;
  }

  const failures = baseline ? compareRouteReads(baseline, measured, targets) : [];

  if (filters.length > 0) {
    for (const route of targets) {
      const allowed = baseline ? baselineReadsFor(baseline, route) : 0;
      const isNew = !baseline || !(route in baseline.routes);
      console.log(`${route}: ${measured[route]} billed reads (allowed ${allowed}${isNew ? ', new route' : ''})`);
    }
  } else {
    const ranked = Object.entries(measured).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    console.log(`Firestore read cost: ${targets.length} polled routes measured.`);
    if (baseline) {
      console.log(
        failures.length === 0
          ? 'All routes at or under baseline.'
          : `${failures.length} route(s) ABOVE their ceiling — lint will fail.`,
      );
    }
    for (const [route, reads] of ranked) {
      const allowed = baseline ? baselineReadsFor(baseline, route) : null;
      const mark = allowed !== null && reads > allowed ? ' !' : '';
      console.log(`  ${String(reads).padStart(6)}  ${route}${mark}`);
    }
  }

  if (!write) {
    for (const failure of failures) {
      if (failure.isNew) {
        console.error(
          `${failure.route}: ${failure.reads} billed reads — new route. ` +
            `Record it with \`npm run firestore-read-cost -- ${JSON.stringify(failure.route)} --write --force\`.`,
        );
      } else {
        console.error(
          `${failure.route}: ${failure.reads} billed reads (baseline ${failure.allowed}). ` +
            `Routes may shrink, never grow — fix the query, then \`npm run firestore-read-cost -- --write\`.`,
        );
      }
    }
    if (failures.length > 0) process.exitCode = 1;
    return;
  }

  const scoped = Object.fromEntries(targets.map((route) => [route, measured[route]]));
  const { payload, refused, changed } = nextRouteBaseline(baseline, scoped, { force, reseal, filters });
  if (refused.length > 0) {
    for (const route of refused) {
      const prev = baseline?.routes[route] ?? 0;
      console.error(`refusing to raise ${route}: ${prev} → ${measured[route]} (pass --force only when sealing)`);
    }
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(FIRESTORE_READ_COST_BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${FIRESTORE_READ_COST_BASELINE_PATH}`);
  if (changed.length === 0) {
    console.log('No baseline numbers moved.');
    return;
  }
  for (const row of changed) {
    const from = row.from === undefined ? 'new' : String(row.from);
    console.log(`  ${row.route}: ${from} → ${row.to}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
