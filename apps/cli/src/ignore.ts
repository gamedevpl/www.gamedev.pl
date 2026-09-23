import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export type IgnoreSource = 'git' | 'gitignore' | 'gamedevplignore';

export type IgnoreMatch = {
  source: IgnoreSource;
  pattern: string;
};

export type IgnoredHit = {
  path: string;
  source: IgnoreSource;
  pattern: string;
  directory: boolean;
};

type Rule = {
  source: Exclude<IgnoreSource, 'git'>;
  pattern: string;
  negation: boolean;
  dirOnly: boolean;
  regex: RegExp;
};

const MAX_IGNORE_BYTES = 256 * 1024;

function escapeRegex(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function trimTrailingSpaces(line: string): string {
  let end = line.length;
  while (end > 0 && line[end - 1] === ' ') {
    let slashes = 0;
    for (let at = end - 2; at >= 0 && line[at] === '\\'; at -= 1) slashes += 1;
    if (slashes % 2 === 1) break;
    end -= 1;
  }
  return line.slice(0, end);
}

const POSIX_CLASSES: Record<string, string> = {
  '[:alnum:]': '0-9A-Za-z',
  '[:alpha:]': 'A-Za-z',
  '[:blank:]': ' \\t',
  '[:cntrl:]': '\\x00-\\x1f\\x7f',
  '[:digit:]': '0-9',
  '[:graph:]': '\\x21-\\x7e',
  '[:lower:]': 'a-z',
  '[:print:]': '\\x20-\\x7e',
  '[:punct:]': '\\x21-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7e',
  '[:space:]': '\\s',
  '[:upper:]': 'A-Z',
  '[:xdigit:]': '0-9A-Fa-f',
};

function findClassEnd(pattern: string, start: number): number {
  let p = start + 1;
  if (p < pattern.length && (pattern[p] === '!' || pattern[p] === '^')) p += 1;
  if (p < pattern.length && pattern[p] === ']') p += 1;
  while (p < pattern.length) {
    if (pattern.startsWith('[:', p)) {
      const classEnd = pattern.indexOf(':]', p + 2);
      if (classEnd !== -1) {
        p = classEnd + 2;
        continue;
      }
    }
    if (pattern[p] === '\\' && p + 1 < pattern.length) {
      p += 2;
      continue;
    }
    if (pattern[p] === ']') return p;
    p += 1;
  }
  return -1;
}

function compileClass(cls: string): string | null {
  if (!cls) return null;
  const isNeg = cls.startsWith('!') || cls.startsWith('^');
  let rest = isNeg ? cls.slice(1) : cls;
  if (!rest || rest.includes('/')) return null;
  let hasUnknownClass = false;
  rest = rest.replace(/\[:[a-z]+:\]/gu, (token) => {
    const mapped = POSIX_CLASSES[token];
    if (!mapped) hasUnknownClass = true;
    return mapped ?? token;
  });
  if (hasUnknownClass) return null;
  if (rest.startsWith(']')) rest = `\\]${rest.slice(1)}`;
  if (rest.startsWith('-')) rest = `\\-${rest.slice(1)}`;
  const prefix = isNeg ? '^/' : '';
  return `[${prefix}${rest}]`;
}

function compilePattern(raw: string): { dirOnly: boolean; regex: RegExp } | null {
  let pattern = raw;
  let dirOnly = false;
  if (pattern.endsWith('/') && !pattern.endsWith('\\/')) {
    dirOnly = true;
    pattern = pattern.slice(0, -1);
  }
  if (!pattern) return null;
  const anchored = pattern.startsWith('/') || pattern.includes('/');
  if (pattern.startsWith('/')) pattern = pattern.slice(1);
  if (!pattern) return null;
  let body = '';
  for (let i = 0; i < pattern.length;) {
    const char = pattern[i]!;
    if (char === '\\' && i + 1 < pattern.length) {
      body += escapeRegex(pattern[i + 1]!);
      i += 2;
      continue;
    }
    if (char === '*' && pattern[i + 1] === '*') {
      const after = pattern[i + 2];
      if (after === '/') {
        body += '(?:(?:[^/]+/)*)';
        i += 3;
        continue;
      }
      if (after === undefined) {
        body += '.*';
        i += 2;
        continue;
      }
      body += '[^/]*[^/]*';
      i += 2;
      continue;
    }
    if (char === '*') {
      body += '[^/]*';
      i += 1;
      continue;
    }
    if (char === '?') {
      body += '[^/]';
      i += 1;
      continue;
    }
    if (char === '[') {
      const end = findClassEnd(pattern, i);
      if (end !== -1) {
        const cls = compileClass(pattern.slice(i + 1, end));
        if (cls) {
          body += cls;
          i = end + 1;
          continue;
        }
      }
    }
    body += escapeRegex(char);
    i += 1;
  }
  const prefix = anchored ? '^' : '(?:^|.*/)';
  try {
    return { dirOnly, regex: new RegExp(`${prefix}${body}$`) };
  } catch {
    return null;
  }
}

function parseIgnore(text: string, source: Rule['source']): Rule[] {
  const rules: Rule[] = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const trimmed = trimTrailingSpaces(rawLine);
    if (!trimmed || trimmed.startsWith('#')) continue;
    let line = trimmed;
    let negation = false;
    if (line.startsWith('!')) {
      negation = true;
      line = line.slice(1);
    } else if (line.startsWith('\\#') || line.startsWith('\\!')) {
      line = line.slice(1);
    }
    if (!line) continue;
    const compiled = compilePattern(line);
    if (!compiled) continue;
    rules.push({ source, pattern: line, negation, ...compiled });
  }
  return rules;
}

function readIgnoreFile(path: string, source: Rule['source']): Rule[] {
  if (!existsSync(path)) return [];
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) return [];
    if (stat.size > MAX_IGNORE_BYTES) {
      throw new CliError(
        `${basename(path)} is larger than 256 KiB. Shrink it before status, diff, pull, or push.`,
        EXIT_REFUSED,
      );
    }
    return parseIgnore(readFileSync(path, 'utf8'), source);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(
      `could not read ${basename(path)}. Fix the file before status, diff, pull, or push.`,
      EXIT_REFUSED,
    );
  }
}

function directoryOf(root: string, base: string): string {
  return base ? join(root, ...base.split('/')) : root;
}

export function createIgnoreMatcher(checkoutRoot: string): {
  ignored(checkoutRelative: string, isDirectory: boolean): IgnoreMatch | null;
} {
  const cache = new Map<string, Rule[]>();
  function rulesIn(base: string): Rule[] {
    const dir = directoryOf(checkoutRoot, base);
    const cached = cache.get(dir);
    if (cached) return cached;
    const rules = [
      ...readIgnoreFile(join(dir, '.gitignore'), 'gitignore'),
      ...readIgnoreFile(join(dir, '.gamedevplignore'), 'gamedevplignore'),
    ];
    cache.set(dir, rules);
    return rules;
  }
  function lastMatch(rel: string, isDirectory: boolean): IgnoreMatch | null {
    const parts = rel.split('/');
    const bases = [''];
    let acc = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i]!;
      bases.push(acc);
    }
    let decision: IgnoreMatch | null = null;
    for (const base of bases) {
      const inner = base ? rel.slice(base.length + 1) : rel;
      for (const rule of rulesIn(base)) {
        if (rule.dirOnly && !isDirectory) continue;
        if (!rule.regex.test(inner)) continue;
        decision = rule.negation ? null : { source: rule.source, pattern: rule.pattern };
      }
    }
    return decision;
  }
  return {
    ignored(checkoutRelative: string, isDirectory: boolean): IgnoreMatch | null {
      const parts = checkoutRelative.split('/').filter(Boolean);
      if (parts.includes('.git')) return { source: 'git', pattern: '.git' };
      let acc = '';
      for (let i = 0; i < parts.length; i += 1) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i]!;
        const atEnd = i === parts.length - 1;
        const match = lastMatch(acc, atEnd ? isDirectory : true);
        if (!atEnd && match) return match;
        if (atEnd) return match;
      }
      return null;
    },
  };
}
