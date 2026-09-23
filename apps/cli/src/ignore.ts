import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const MAX_PATTERN = 240;
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

function compilePattern(raw: string): { dirOnly: boolean; regex: RegExp } | null {
  if (raw.length > MAX_PATTERN) return null;
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
      const end = pattern.indexOf(']', i + 1);
      const cls = end > i + 1 ? pattern.slice(i + 1, end) : '';
      if (cls && /^!?[\w.-]+$/u.test(cls)) {
        const neg = cls.startsWith('!') ? '^' : '';
        const rest = cls.startsWith('!') ? cls.slice(1) : cls;
        body += `[${neg}${rest}]`;
        i = end + 1;
        continue;
      }
    }
    body += escapeRegex(char);
    i += 1;
  }
  const prefix = anchored ? '^' : '(?:^|.*/)';
  return { dirOnly, regex: new RegExp(`${prefix}${body}$`) };
}

function parseIgnore(text: string, source: Rule['source']): Rule[] {
  const rules: Rule[] = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const trimmed = trimTrailingSpaces(rawLine).trimStart();
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
    if (!stat.isFile() || stat.size > MAX_IGNORE_BYTES) return [];
    return parseIgnore(readFileSync(path, 'utf8'), source);
  } catch {
    return [];
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
