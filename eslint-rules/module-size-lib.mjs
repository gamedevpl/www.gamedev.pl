/**
 * Module-size ratchet for apps/ + packages/ — north-star-architecture.md Phase 0.
 *
 * A handful of route/store modules grew past 5,000 lines by never having a ceiling.
 * Every extraction from here on should shrink a file, never let one grow further:
 *
 * - A file already in the baseline may not grow past its recorded line count.
 * - A file with no baseline entry (new since the freeze) is capped at
 *   MODULE_SIZE_HARD_CAP_LINES — small enough that a new module starts, and stays,
 *   cohesive.
 *
 * Same shape as comment-prose: frozen per file in module-size-baseline.json, may
 * shrink, may not grow, `--write --force` only for a deliberate reseal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..');

/** Ceiling for a file with no baseline entry — i.e. created after the freeze. */
export const MODULE_SIZE_HARD_CAP_LINES = 500;

export const MODULE_SIZE_BASELINE_PATH = path.join(here, 'module-size-baseline.json');

/** Roots scanned — same authoring surface as comment-prose (minus fixtures). */
export const MODULE_SIZE_ROOTS = ['apps', 'packages'];

const IGNORE_DIR_NAMES = new Set(['dist', 'build', 'coverage', 'node_modules', 'fixtures', '.claude']);

function shouldSkipDirent(name, isDirectory) {
  if (!isDirectory) return false;
  return IGNORE_DIR_NAMES.has(name);
}

/**
 * @param {string} [root]
 * @returns {string[]}
 */
export function listModuleSizeFiles(root = REPO_ROOT) {
  /** @type {string[]} */
  const out = [];

  function walk(absDir) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (shouldSkipDirent(entry.name, entry.isDirectory())) continue;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx') && !entry.name.endsWith('.css')) continue;
      out.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  }

  for (const rel of MODULE_SIZE_ROOTS) {
    walk(path.join(root, rel));
  }
  out.sort();
  return out;
}

/** Counts like `wc -l`: newline characters, plus one for a final unterminated line. */
export function countLines(source) {
  if (source.length === 0) return 0;
  const newlines = (source.match(/\n/g) ?? []).length;
  return source.endsWith('\n') ? newlines : newlines + 1;
}

/**
 * @param {string} relativePath
 * @param {string} [root]
 */
export function measureFileLines(relativePath, root = REPO_ROOT) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  return countLines(source);
}

/**
 * @param {string} [filePath]
 */
export function loadModuleSizeBaseline(filePath = MODULE_SIZE_BASELINE_PATH) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (parsed.version !== 1 || typeof parsed.files !== 'object' || parsed.files === null) {
    throw new Error(`invalid module-size baseline at ${filePath}`);
  }
  if (parsed.hardCapLines !== MODULE_SIZE_HARD_CAP_LINES) {
    throw new Error(
      `module-size baseline hardCapLines ${parsed.hardCapLines} != MODULE_SIZE_HARD_CAP_LINES ${MODULE_SIZE_HARD_CAP_LINES}`,
    );
  }
  return parsed;
}

/** Missing file → new file since the freeze → the hard cap, not the file's own history. */
export function baselineLinesFor(baseline, relativePath) {
  return baseline.files[relativePath] ?? MODULE_SIZE_HARD_CAP_LINES;
}
