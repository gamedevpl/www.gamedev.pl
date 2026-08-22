/**
 * Report (and optionally rewrite) comment-prose baselines for apps/ + packages/.
 *
 *   npm run comment-prose
 *   npm run comment-prose -- apps/api/src/store.ts
 *   npm run comment-prose -- apps/api/src/foo.ts --write --force
 *   npm run comment-prose -- --write --reseal
 *
 * Wired into `npm run lint` so the green gate seals it.
 */

import fs from 'node:fs';
import {
  COMMENT_PROSE_BASELINE_PATH,
  COMMENT_PROSE_MAX_WORDS,
  baselineWordsFor,
  listCommentProseFiles,
  loadCommentProseBaseline,
  measureFileCommentProse,
} from './comment-prose-lib.mjs';

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const force = argv.includes('--force');
  const reseal = argv.includes('--reseal');
  const filters = argv.filter((arg) => !arg.startsWith('--'));

  // Twin of the module-size guard: unscoped --write also tightens every other file.
  if (write && filters.length === 0 && !reseal) {
    console.error('Refusing an unscoped --write: it lowers every baseline to current words.');
    console.error('  Raising one file:  npm run comment-prose -- <path> --write --force');
    console.error('  Really reseal all: npm run comment-prose -- --write --reseal');
    process.exitCode = 1;
    return;
  }

  let baseline = null;
  try {
    baseline = loadCommentProseBaseline();
  } catch {
    if (!write) {
      console.error('No baseline file yet. Run with --write --force to create one.');
      process.exitCode = 1;
      return;
    }
  }

  const allFiles = listCommentProseFiles();
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
  let totalWords = 0;
  let over = 0;
  let clean = 0;
  /** @type {{ file: string, words: number, allowed: number, samples: string[] }[]} */
  const failures = [];

  for (const file of targets) {
    const report = measureFileCommentProse(file);
    measured[file] = report.words;
    totalWords += report.words;
    if (report.words === 0) clean += 1;

    const allowed = baseline ? baselineWordsFor(baseline, file) : 0;
    if (report.words > allowed) {
      over += 1;
      const samples = report.violations.slice(0, 3).map((v) => {
        const span = v.endLine !== v.startLine ? `${v.startLine}-${v.endLine}` : `${v.startLine}`;
        return `${span} [${v.kind}] ${v.preview}`;
      });
      failures.push({ file, words: report.words, allowed, samples });
    }

    if (filters.length > 0) {
      const delta = report.words - allowed;
      console.log(
        `${file}: ${report.words} prose words` +
          (baseline
            ? ` (baseline ${allowed}${delta > 0 ? `, +${delta}` : delta < 0 ? `, ${delta}` : ''})`
            : ''),
      );
      for (const v of report.violations.slice(0, 12)) {
        const span = v.endLine !== v.startLine ? `${v.startLine}-${v.endLine}` : `${v.startLine}`;
        console.log(`  :${span} [${v.kind} ${v.words}w] ${v.preview}`);
      }
      if (report.violations.length > 12) {
        console.log(`  … ${report.violations.length - 12} more`);
      }
    }
  }

  if (filters.length === 0) {
    const ranked = Object.entries(measured).sort((a, b) => b[1] - a[1]);
    console.log(
      `Comment prose: ${totalWords} words across ${targets.length} files` +
        ` (${clean} clean, max ${COMMENT_PROSE_MAX_WORDS} words/line).`,
    );
    if (baseline) {
      console.log(
        over === 0
          ? 'All files at or under baseline.'
          : `${over} file(s) ABOVE baseline — lint will fail.`,
      );
    }
    console.log('Heaviest:');
    for (const [file, words] of ranked.slice(0, 15)) {
      const allowed = baseline ? baselineWordsFor(baseline, file) : null;
      const mark = allowed !== null && words > allowed ? ' !' : '';
      console.log(`  ${String(words).padStart(5)}  ${file}${mark}`);
    }
  }

  if (!write) {
    for (const failure of failures.slice(0, 20)) {
      console.error(
        `${failure.file}: ${failure.words} prose-comment words (baseline ${failure.allowed}). ` +
          `Shrink to ≤${COMMENT_PROSE_MAX_WORDS}-word // one-liners, then ` +
          `\`npm run comment-prose -- --write\`.`,
      );
      for (const sample of failure.samples) {
        console.error(`  ${sample}`);
      }
    }
    if (failures.length > 20) {
      console.error(`… ${failures.length - 20} more files over baseline`);
    }
    if (over > 0) process.exitCode = 1;
    return;
  }

  /** @type {Record<string, number>} */
  const nextFiles = { ...(baseline?.files ?? {}) };
  if (filters.length === 0) {
    for (const key of Object.keys(nextFiles)) {
      if (!(key in measured) && !allFiles.includes(key)) delete nextFiles[key];
    }
    // Drop paths that no longer exist when rewriting the whole tree.
    for (const key of Object.keys(nextFiles)) {
      if (!allFiles.includes(key)) delete nextFiles[key];
    }
  }

  let raised = 0;
  for (const [file, words] of Object.entries(measured)) {
    const prev = nextFiles[file] ?? 0;
    if (words > prev && !force) {
      console.error(
        `refusing to raise ${file}: ${prev} → ${words} (pass --force only when sealing)`,
      );
      raised += 1;
      continue;
    }
    if (words === 0) {
      delete nextFiles[file];
    } else {
      nextFiles[file] = words;
    }
  }

  if (raised > 0) {
    process.exitCode = 1;
    return;
  }

  const payload = {
    version: 1,
    maxWords: COMMENT_PROSE_MAX_WORDS,
    files: Object.fromEntries(Object.entries(nextFiles).sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(COMMENT_PROSE_BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${COMMENT_PROSE_BASELINE_PATH}`);
}

main();
