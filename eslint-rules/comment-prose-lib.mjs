/**
 * Comment-prose detector — lockstep with www.gamedev.pl-games Check 34.
 *
 * Models write multi-paragraph comments into TypeScript; those tokens are paid
 * again on every later edit. Rule:
 *
 * - `//` one-liners only, ≤ COMMENT_PROSE_MAX_WORDS words, saying why
 * - no adjacent full-line `//` stacks
 * - no `/* *\/` / `/** *\/` blocks at all (rewrite as `//`)
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
 * Stateful walk over TypeScript/TSX. Template literal *text* is ignored;
 * `${…}` interpolations are scanned as code (brace-depth aware).
 *
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
  let lineNonWsCol = -1;
  let col = 0;

  const atLineStartCode = () => lineNonWsCol === -1;

  const bumpNewline = () => {
    line += 1;
    col = 0;
    lineNonWsCol = -1;
  };

  /**
   * Scan code. When `braceDepth` is a number (template `${…}`), return after the
   * matching `}` — braces inside strings/comments/nested templates do not count.
   * @param {number | null} [braceDepth]
   */
  function scanCode(braceDepth = null) {
    while (i < n) {
      const ch = source[i];
      const next = source[i + 1];

      if (ch === '\n') {
        bumpNewline();
        i += 1;
        continue;
      }

      if (ch === ' ' || ch === '\t') {
        col += 1;
        i += 1;
        continue;
      }

      const wasLineStart = atLineStartCode();
      if (lineNonWsCol === -1) lineNonWsCol = col;

      if (ch === '"' || ch === "'") {
        const quote = ch;
        i += 1;
        col += 1;
        while (i < n) {
          if (source[i] === '\\') {
            i += 2;
            col += 2;
            continue;
          }
          if (source[i] === '\n') break;
          if (source[i] === quote) {
            i += 1;
            col += 1;
            break;
          }
          i += 1;
          col += 1;
        }
        continue;
      }

      if (ch === '`') {
        i += 1;
        col += 1;
        scanTemplate();
        continue;
      }

      if (ch === '/' && next === '/') {
        const startLine = line;
        const fullLine = wasLineStart;
        i += 2;
        col += 2;
        const textStart = i;
        while (i < n && source[i] !== '\n') {
          i += 1;
          col += 1;
        }
        const text = source.slice(textStart, i).trim();
        const words = wordCount(text);
        if (fullLine) {
          fullLines.push({ line: startLine, text });
        } else if (words > COMMENT_PROSE_MAX_WORDS) {
          violations.push({
            kind: 'trailing',
            startLine,
            endLine: startLine,
            words,
            preview: previewOf(text),
          });
        }
        continue;
      }

      if (ch === '/' && next === '*') {
        const startLine = line;
        i += 2;
        col += 2;
        const textStart = i;
        while (i < n - 1 && !(source[i] === '*' && source[i + 1] === '/')) {
          if (source[i] === '\n') {
            bumpNewline();
            i += 1;
            continue;
          }
          i += 1;
          col += 1;
        }
        const raw = source.slice(textStart, i);
        if (i < n - 1) {
          i += 2;
          col += 2;
        }
        const cleaned = stripBlockDecor(raw);
        const words = wordCount(cleaned);
        // Any block comment is prose — rewrite as `//`.
        violations.push({
          kind: 'block',
          startLine,
          endLine: line,
          words: Math.max(words, 1),
          preview: previewOf(cleaned),
        });
        continue;
      }

      if (braceDepth !== null && ch === '{') {
        braceDepth += 1;
        i += 1;
        col += 1;
        continue;
      }
      if (braceDepth !== null && ch === '}') {
        braceDepth -= 1;
        i += 1;
        col += 1;
        if (braceDepth === 0) return;
        continue;
      }

      i += 1;
      col += 1;
    }
  }

  function scanTemplate() {
    while (i < n) {
      if (source[i] === '\\') {
        i += 2;
        col += 2;
        continue;
      }
      if (source[i] === '\n') {
        bumpNewline();
        i += 1;
        continue;
      }
      if (source[i] === '`') {
        i += 1;
        col += 1;
        return;
      }
      if (source[i] === '$' && source[i + 1] === '{') {
        i += 2;
        col += 2;
        scanCode(1);
        continue;
      }
      i += 1;
      col += 1;
    }
  }

  scanCode(null);

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
  if (parsed.maxWords !== COMMENT_PROSE_MAX_WORDS) {
    throw new Error(
      `comment-prose baseline maxWords ${parsed.maxWords} != COMMENT_PROSE_MAX_WORDS ${COMMENT_PROSE_MAX_WORDS}`,
    );
  }
  return parsed;
}

/** Missing file → new file → zero debt allowed. */
export function baselineWordsFor(baseline, relativePath) {
  return baseline.files[relativePath] ?? 0;
}
