/**
 * Report (and optionally rewrite) per-operation Firestore write-path baselines.
 *
 *   npm run firestore-write-cost
 *   npm run firestore-write-cost -- "setSubmissionTitle" --write --force
 *   npm run firestore-write-cost -- --write --reseal
 *
 * Wired into `npm run lint` so the green gate seals it. See the lib for why the
 * slope between two owner sizes is the number that matters.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './firestore-read-cost-lib.mjs';
import {
  FIRESTORE_WRITE_COST_BASELINE_PATH,
  baselineCostFor,
  compareOperationCosts,
  filterMeasuredOperations,
  loadFirestoreWriteCostBaseline,
  nextOperationBaseline,
} from './firestore-write-cost-lib.mjs';

// The fixture measures the slopes; this only prints what it recorded.
const AXES = ['round', 'game', 'editor'];

function ensurePackagesBuilt() {
  // CI lint runs before type-check, so workspace dist is empty.
  const needed = ['packages/contract/dist/index.js', 'packages/zone-core/dist/index.js'];
  if (needed.every((rel) => fs.existsSync(path.join(REPO_ROOT, rel)))) return;
  const result = spawnSync('npm', ['run', 'build:packages'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error('firestore-write-cost needs packages built (npm run build:packages)');
  }
}

function measureOperations() {
  ensurePackagesBuilt();
  const apiRoot = path.join(REPO_ROOT, 'apps/api');
  const script = path.join(apiRoot, 'src/store/firestore-write-cost.fixture.ts');
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
    throw new Error('firestore-write-cost measurement failed');
  }
  const parsed = JSON.parse(result.stdout);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('firestore-write-cost measurement did not print a JSON object');
  }
  const measured = {};
  for (const [operation, cost] of Object.entries(parsed)) {
    if (typeof cost !== 'number' || !Number.isFinite(cost)) {
      throw new Error(`firestore-write-cost measurement for ${operation} is not a number`);
    }
    measured[operation] = cost;
  }
  return measured;
}

// The operation names, without the size and metric the labels carry.
function operationNames(measured) {
  return [...new Set(Object.keys(measured).map((label) => label.split(' (')[0]))].sort();
}

function reportSlopes(measured) {
  console.log('Per-dimension slope, reads/writes (0 = independent of that dimension):');
  for (const operation of operationNames(measured)) {
    const parts = [];
    for (const axis of AXES) {
      const reads = measured[`${operation} (per ${axis}) reads`];
      const writes = measured[`${operation} (per ${axis}) writes`];
      if (typeof reads !== 'number' || typeof writes !== 'number') continue;
      parts.push(reads === 0 && writes === 0 ? `flat/${axis}` : `${reads}r+${writes}w per ${axis}`);
    }
    if (parts.length > 0) console.log(`  ${operation.padEnd(26)} ${parts.join(', ')}`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const force = argv.includes('--force');
  const reseal = argv.includes('--reseal');
  const filters = argv.filter((arg) => !arg.startsWith('--'));

  if (write && filters.length === 0 && !reseal) {
    console.error('Refusing an unscoped --write: it lowers every ceiling to current cost.');
    console.error('  Raising one operation: npm run firestore-write-cost -- <operation> --write --force');
    console.error('  Really reseal all:     npm run firestore-write-cost -- --write --reseal');
    process.exitCode = 1;
    return;
  }

  let baseline = null;
  try {
    baseline = loadFirestoreWriteCostBaseline();
  } catch {
    if (!write) {
      console.error('No baseline file yet. Run with --write --reseal --force to create one.');
      process.exitCode = 1;
      return;
    }
  }

  const measured = measureOperations();
  const targets = filterMeasuredOperations(measured, filters);

  if (filters.length > 0 && targets.length === 0) {
    console.error(`No measured operation matched: ${filters.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  if (filters.length === 0 && baseline) {
    for (const operation of Object.keys(baseline.operations)) {
      if (!(operation in measured)) {
        console.error(`${operation}: in baseline but not measured this run.`);
        process.exitCode = 1;
      }
    }
    if (process.exitCode === 1) return;
  }

  const failures = baseline ? compareOperationCosts(baseline, measured, targets) : [];

  if (filters.length > 0) {
    for (const operation of targets) {
      const allowed = baseline ? baselineCostFor(baseline, operation) : 0;
      const isNew = !baseline || !(operation in baseline.operations);
      console.log(`${operation}: ${measured[operation]} (allowed ${allowed}${isNew ? ', new' : ''})`);
    }
  } else {
    console.log(`Firestore write cost: ${operationNames(measured).length} operations measured.`);
    if (baseline) {
      console.log(
        failures.length === 0
          ? 'All operations at or under baseline.'
          : `${failures.length} entr(ies) ABOVE their ceiling — lint will fail.`,
      );
    }
    reportSlopes(measured);
  }

  if (!write) {
    for (const failure of failures) {
      const how = `\`npm run firestore-write-cost -- ${JSON.stringify(failure.operation)} --write --force\``;
      console.error(
        failure.isNew
          ? `${failure.operation}: ${failure.cost} — new entry. Record it with ${how}.`
          : `${failure.operation}: ${failure.cost} (baseline ${failure.allowed}). ` +
              `The write path may shrink, never grow — fix it, or raise this one with ${how}.`,
      );
    }
    if (failures.length > 0) process.exitCode = 1;
    return;
  }

  const scoped = Object.fromEntries(targets.map((operation) => [operation, measured[operation]]));
  const { payload, refused, changed } = nextOperationBaseline(baseline, scoped, { force, reseal, filters });
  if (refused.length > 0) {
    for (const operation of refused) {
      const prev = baseline?.operations[operation] ?? 0;
      console.error(`refusing to raise ${operation}: ${prev} → ${measured[operation]} (pass --force only when sealing)`);
    }
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(FIRESTORE_WRITE_COST_BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${FIRESTORE_WRITE_COST_BASELINE_PATH}`);
  if (changed.length === 0) {
    console.log('No baseline numbers moved.');
    return;
  }
  for (const row of changed) {
    console.log(`  ${row.operation}: ${row.from === undefined ? 'new' : String(row.from)} → ${row.to}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
