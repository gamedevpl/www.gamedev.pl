/**
 * Report (and optionally rewrite) module-size baselines for apps/ + packages/.
 *
 *   npm run module-size
 *   npm run module-size -- apps/api/src/store.ts
 *   npm run module-size -- apps/api/src/store.ts --write --force
 *   npm run module-size -- --write --reseal
 *
 * Scope a raise to the file that grew. An unscoped --write also *lowers* every other
 * ceiling to its current size, which silently freezes files nobody touched.
 *
 * Wired into `npm run lint` so the green gate seals it.
 */

import fs from 'node:fs';
import {
  baselineLinesFor,
  listModuleSizeFiles,
  loadModuleSizeBaseline,
  measureFileLines,
  MODULE_SIZE_BASELINE_PATH,
  MODULE_SIZE_HARD_CAP_LINES,
} from './module-size-lib.mjs';

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const force = argv.includes('--force');
  const reseal = argv.includes('--reseal');
  const filters = argv.filter((arg) => !arg.startsWith('--'));

  // An unscoped --write pins every file at today's size, so a one-file fix quietly
  // costs everyone else their headroom. Make that the deliberate act it always was.
  if (write && filters.length === 0 && !reseal) {
    console.error('Refusing an unscoped --write: it lowers every ceiling to current size.');
    console.error('  Raising one file:  npm run module-size -- <path> --write --force');
    console.error('  Really reseal all: npm run module-size -- --write --reseal');
    process.exitCode = 1;
    return;
  }

  let baseline = null;
  try {
    baseline = loadModuleSizeBaseline();
  } catch {
    if (!write) {
      console.error('No baseline file yet. Run with --write --force to create one.');
      process.exitCode = 1;
      return;
    }
  }

  const allFiles = listModuleSizeFiles();
  const targets =
    filters.length > 0
      ? allFiles.filter((file) => filters.some((f) => file === f || file.startsWith(`${f}/`)))
      : allFiles;

  if (filters.length > 0 && targets.length === 0) {
    console.error(`No scanned .ts/.tsx matched: ${filters.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  /** @type {Record<string, number>} */
  const measured = {};
  let over = 0;
  /** @type {{ file: string, lines: number, allowed: number, isNew: boolean }[]} */
  const failures = [];

  for (const file of targets) {
    const lines = measureFileLines(file);
    measured[file] = lines;

    const isNew = !baseline || !(file in baseline.files);
    const allowed = baseline ? baselineLinesFor(baseline, file) : MODULE_SIZE_HARD_CAP_LINES;
    if (lines > allowed) {
      over += 1;
      failures.push({ file, lines, allowed, isNew });
    }

    if (filters.length > 0) {
      console.log(`${file}: ${lines} lines (allowed ${allowed}${isNew ? ', new file — hard cap' : ''})`);
    }
  }

  if (filters.length === 0) {
    const ranked = Object.entries(measured).sort((a, b) => b[1] - a[1]);
    console.log(
      `Module size: ${targets.length} files scanned, hard cap ${MODULE_SIZE_HARD_CAP_LINES} lines for new files.`,
    );
    if (baseline) {
      console.log(
        over === 0 ? 'All files at or under baseline.' : `${over} file(s) ABOVE their ceiling — lint will fail.`,
      );
    }
    console.log('Largest:');
    for (const [file, lines] of ranked.slice(0, 15)) {
      const allowed = baseline ? baselineLinesFor(baseline, file) : MODULE_SIZE_HARD_CAP_LINES;
      const mark = lines > allowed ? ' !' : '';
      console.log(`  ${String(lines).padStart(6)}  ${file}${mark}`);
    }
  }

  if (!write) {
    for (const failure of failures.slice(0, 20)) {
      if (failure.isNew) {
        console.error(
          `${failure.file}: ${failure.lines} lines — new file over the ${MODULE_SIZE_HARD_CAP_LINES}-line hard cap. ` +
            `Split it before it grows further.`,
        );
      } else {
        console.error(
          `${failure.file}: ${failure.lines} lines (baseline ${failure.allowed}). ` +
            `Files may shrink, never grow — extract instead, then \`npm run module-size -- --write\`.`,
        );
      }
    }
    if (failures.length > 20) {
      console.error(`… ${failures.length - 20} more files over their ceiling`);
    }
    if (over > 0) process.exitCode = 1;
    return;
  }

  /** @type {Record<string, number>} */
  const nextFiles = { ...(baseline?.files ?? {}) };
  if (filters.length === 0) {
    for (const key of Object.keys(nextFiles)) {
      if (!allFiles.includes(key)) delete nextFiles[key];
    }
  }

  let raised = 0;
  for (const [file, lines] of Object.entries(measured)) {
    const prev = nextFiles[file] ?? MODULE_SIZE_HARD_CAP_LINES;
    if (lines > prev && !force) {
      console.error(`refusing to raise ${file}: ${prev} → ${lines} (pass --force only when sealing)`);
      raised += 1;
      continue;
    }
    nextFiles[file] = lines;
  }

  if (raised > 0) {
    process.exitCode = 1;
    return;
  }

  const payload = {
    version: 1,
    hardCapLines: MODULE_SIZE_HARD_CAP_LINES,
    files: Object.fromEntries(Object.entries(nextFiles).sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(MODULE_SIZE_BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${MODULE_SIZE_BASELINE_PATH}`);
}

main();
