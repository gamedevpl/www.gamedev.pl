/**
 * Comment-prose detector — lockstep with www.gamedev.pl-games Check 34.
 *
 * Models write multi-paragraph comments into TypeScript; those tokens are paid
 * again on every later edit. Rule:
 *
 * - `//` one-liners only, ≤ COMMENT_PROSE_MAX_WORDS words, saying why
 * - no adjacent full-line `//` stacks
 * - no multi-line `/* *\/` blocks (short single-line blocks tolerated)
 *
 * Debt is frozen per file in comment-prose-baseline.json (may shrink, not grow).
 * New files have baseline 0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..');

/** Hard cap on words in one compliant comment. */
export const COMMENT_PROSE_MAX_WORDS = 12;

export const COMMENT_PROSE_BASELINE_PATH = path.join(here, 'comment-prose-baseline.json');

/** Roots scanned — same authoring surface ESLint covers (minus fixtures). */
export const COMMENT_PROSE_ROOTS = ['apps', 'packages'];

const IGNORE_DIR_NAMES = new Set([
  'dist',
  'build',
  'coverage',
  'node_modules',
  'fixtures',
  '.claude',
]);

function wordCount(text) {
  const matches = text.match(/\w+/g);
  return matches ? matches.length : 0;
}

function previewOf(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= 96 ? flat : `${flat.slice(0, 93)}...`;
}

function stripBlockDecor(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\*?/, '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Walk TypeScript / TSX source, skipping string/template literals.
 * @param {string} source
 * @returns {{ kind: string, startLine: number, endLine: number, words: number, preview: string }[]}
 */
export function findCommentProseViolations(source) {
  /** @type {{ line: number, text: string }[]} */
  const fullLines = [];
  /** @type {{ kind: string, startLine: number, endLine: number, words: number, preview: string }[]} */
  const violations = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  while (i < n) {
    const lineStart = i;
    while (i < n && (source[i] === ' ' || source[i] === '\t')) i += 1;

    if (i < n && source[i] === '/' && source[i + 1] === '/') {
      i += 2;
      const textStart = i;
      while (i < n && source[i] !== '\n') i += 1;
      fullLines.push({ line, text: source.slice(textStart, i).trim() });
      if (i < n && source[i] === '\n') {
        line += 1;
        i += 1;
      }
      continue;
    }

    if (i < n && source[i] === '/' && source[i + 1] === '*') {
      const startLine = line;
      i += 2;
      const textStart = i;
      while (i < n - 1 && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1;
        i += 1;
      }
      const raw = source.slice(textStart, i);
      if (i < n - 1) i += 2;
      const cleaned = stripBlockDecor(raw);
      const words = wordCount(cleaned);
      if (line > startLine || words > COMMENT_PROSE_MAX_WORDS) {
        violations.push({
          kind: 'block',
          startLine,
          endLine: line,
          words,
          preview: previewOf(cleaned),
        });
      }
      while (i < n && (source[i] === ' ' || source[i] === '\t')) i += 1;
      if (i < n && source[i] === '\n') {
        line += 1;
        i += 1;
      }
      continue;
    }

    i = lineStart;
    while (i < n && source[i] !== '\n') {
      const ch = source[i];
      const next = source[i + 1];

      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        i += 1;
        while (i < n) {
          if (source[i] === '\\') {
            i += 2;
            continue;
          }
          if (source[i] === '\n' && quote !== '`') break;
          if (source[i] === quote) {
            i += 1;
            break;
          }
          if (source[i] === '\n') line += 1;
          i += 1;
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        const nl = source.indexOf('\n', i);
        const end = nl === -1 ? n : nl;
        const text = source.slice(i + 2, end).trim();
        const words = wordCount(text);
        if (words > COMMENT_PROSE_MAX_WORDS) {
          violations.push({
            kind: 'trailing',
            startLine: line,
            endLine: line,
            words,
            preview: previewOf(text),
          });
        }
        i = end;
        break;
      }

      if (ch === '/' && next === '*') {
        const startLine = line;
        i += 2;
        const textStart = i;
        while (i < n - 1 && !(source[i] === '*' && source[i + 1] === '/')) {
          if (source[i] === '\n') line += 1;
          i += 1;
        }
        const raw = source.slice(textStart, i);
        if (i < n - 1) i += 2;
        const cleaned = stripBlockDecor(raw);
        const words = wordCount(cleaned);
        if (line > startLine || words > COMMENT_PROSE_MAX_WORDS) {
          violations.push({
            kind: 'block',
            startLine,
            endLine: line,
            words,
            preview: previewOf(cleaned),
          });
        }
        continue;
      }

      i += 1;
    }

    if (i < n && source[i] === '\n') {
      line += 1;
      i += 1;
    }
  }

  /** @type {{ line: number, text: string }[]} */
  let stack = [];
  const flush = () => {
    if (stack.length === 0) return;
    if (stack.length >= 2) {
      const body = stack.map((c) => c.text).join(' ');
      const words = wordCount(body);
      violations.push({
        kind: 'stack',
        startLine: stack[0].line,
        endLine: stack[stack.length - 1].line,
        words,
        preview: previewOf(body),
      });
    } else {
      const words = wordCount(stack[0].text);
      if (words > COMMENT_PROSE_MAX_WORDS) {
        violations.push({
          kind: 'long',
          startLine: stack[0].line,
          endLine: stack[0].line,
          words,
          preview: previewOf(stack[0].text),
        });
      }
    }
    stack = [];
  };

  for (const comment of fullLines) {
    if (stack.length > 0 && comment.line === stack[stack.length - 1].line + 1) {
      stack.push(comment);
    } else {
      flush();
      stack = [comment];
    }
  }
  flush();

  return violations;
}

export function countCommentProseWords(source) {
  return findCommentProseViolations(source).reduce((sum, v) => sum + v.words, 0);
}

function shouldSkipDirent(name, isDirectory) {
  if (!isDirectory) return false;
  return IGNORE_DIR_NAMES.has(name);
}

/**
 * List repo-relative `.ts` / `.tsx` paths under COMMENT_PROSE_ROOTS.
 * @param {string} [root]
 * @returns {string[]}
 */
export function listCommentProseFiles(root = REPO_ROOT) {
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
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
      out.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  }

  for (const rel of COMMENT_PROSE_ROOTS) {
    walk(path.join(root, rel));
  }
  out.sort();
  return out;
}

/**
 * @param {string} relativePath
 * @param {string} [root]
 */
export function measureFileCommentProse(relativePath, root = REPO_ROOT) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const violations = findCommentProseViolations(source);
  const words = violations.reduce((sum, v) => sum + v.words, 0);
  return { words, violations };
}

/**
 * @param {string} [filePath]
 */
export function loadCommentProseBaseline(filePath = COMMENT_PROSE_BASELINE_PATH) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (parsed.version !== 1 || typeof parsed.files !== 'object' || parsed.files === null) {
    throw new Error(`invalid comment-prose baseline at ${filePath}`);
  }
  return parsed;
}

/** Missing file → new file → zero debt allowed. */
export function baselineWordsFor(baseline, relativePath) {
  return baseline.files[relativePath] ?? 0;
}
