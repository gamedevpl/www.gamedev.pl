// The CLI changelog is the release source of truth: parse, validate, bump, cut.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..');

export const CHANGELOG_PATH = 'apps/cli/CHANGELOG.md';
export const CLI_PACKAGE_JSON_PATH = 'apps/cli/package.json';
export const CLI_INSTALLERS_PATH = 'apps/api/src/platform/cli-installers.ts';

export const CATEGORIES = ['Breaking', 'Added', 'Fixed', 'Internal'];
export const UNRELEASED = 'Unreleased';

const SECTION_RE = /^## (Unreleased|(\d+)\.(\d+)\.(\d+))(?:\s+[—-]\s+(\d{4}-\d{2}-\d{2}))?\s*$/;
const CATEGORY_RE = /^### (\w+)\s*$/;
const ENTRY_RE = /^- (.+)$/;

// Paths whose change means "the shipped CLI changed", so the changelog must move too.
export function cliSourceTouched(files) {
  return files.some((file) => {
    if (!file.startsWith('apps/cli/')) return false;
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) return false;
    return (
      file.startsWith('apps/cli/src/') ||
      file.startsWith('apps/cli/scripts/') ||
      file === 'apps/cli/adapters.json'
    );
  });
}

export function parseChangelog(text) {
  const lines = text.split('\n');
  const sections = [];
  const errors = [];
  let preambleEnd = null;
  let section = null;
  let category = null;

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch) {
      if (preambleEnd === null) preambleEnd = index;
      section = {
        version: sectionMatch[1],
        date: sectionMatch[5] ?? null,
        categories: Object.fromEntries(CATEGORIES.map((name) => [name, []])),
        start: index,
        end: lines.length,
      };
      if (sections.length > 0) sections[sections.length - 1].end = index;
      sections.push(section);
      category = null;
      return;
    }
    if (line.startsWith('## ')) {
      errors.push(`${lineNo}: malformed section header "${line}" (want "## Unreleased" or "## 1.2.3 — YYYY-MM-DD")`);
      return;
    }
    const categoryMatch = CATEGORY_RE.exec(line);
    if (categoryMatch) {
      if (!section) {
        errors.push(`${lineNo}: category before any "## " section`);
        return;
      }
      if (!CATEGORIES.includes(categoryMatch[1])) {
        errors.push(`${lineNo}: unknown category "${categoryMatch[1]}" (want ${CATEGORIES.join(' | ')})`);
        category = null;
        return;
      }
      category = categoryMatch[1];
      return;
    }
    const entryMatch = ENTRY_RE.exec(line);
    if (entryMatch && section) {
      if (!category) {
        errors.push(`${lineNo}: entry outside a "### Category" in section ${section.version}`);
        return;
      }
      section.categories[category].push(entryMatch[1].trim());
      return;
    }
    if (/^\s+\S/.test(line) && section && category) {
      const list = section.categories[category];
      if (list.length > 0) list[list.length - 1] += ` ${line.trim()}`;
    }
  });

  const unreleased = sections.filter((s) => s.version === UNRELEASED);
  if (unreleased.length === 0) errors.push('missing "## Unreleased" section');
  if (unreleased.length > 1) errors.push('more than one "## Unreleased" section');
  const seen = new Set();
  for (const s of sections) {
    if (s.version === UNRELEASED) continue;
    if (seen.has(s.version)) errors.push(`version ${s.version} appears twice`);
    seen.add(s.version);
    if (!s.date) errors.push(`section ${s.version} has no date`);
  }

  return {
    preamble: lines.slice(0, preambleEnd ?? lines.length).join('\n'),
    sections,
    errors,
    lines,
  };
}

export function unreleasedSection(parsed) {
  return parsed.sections.find((s) => s.version === UNRELEASED) ?? null;
}

// Highest category present decides; Internal alone never releases.
export function bumpKind(section) {
  if (!section) return null;
  const { categories } = section;
  if (categories.Breaking.length > 0) return 'major';
  if (categories.Added.length > 0) return 'minor';
  if (categories.Fixed.length > 0) return 'patch';
  return null;
}

// Before 1.0 a breaking change bumps minor; 1.0 itself is a hand-written decision.
export function nextVersion(current, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`current version "${current}" is not x.y.z`);
  let [major, minor, patch] = match.slice(1).map(Number);
  const effective = kind === 'major' && major === 0 ? 'minor' : kind;
  if (effective === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (effective === 'minor') {
    minor += 1;
    patch = 0;
  } else if (effective === 'patch') {
    patch += 1;
  } else {
    return null;
  }
  return `${major}.${minor}.${patch}`;
}

function renderCategories(section, { includeInternal }) {
  const out = [];
  for (const name of CATEGORIES) {
    if (name === 'Internal' && !includeInternal) continue;
    const entries = section.categories[name];
    if (entries.length === 0) continue;
    out.push(`### ${name}`, '');
    for (const entry of entries) out.push(`- ${entry}`);
    out.push('');
  }
  return out;
}

// Move Unreleased under a version header; leave a fresh empty Unreleased above it.
export function renderCut(text, version, date) {
  const parsed = parseChangelog(text);
  if (parsed.errors.length > 0) throw new Error(parsed.errors.join('\n'));
  const section = unreleasedSection(parsed);
  const before = parsed.lines.slice(0, section.start);
  const after = parsed.lines.slice(section.end);
  const released = [
    `## ${UNRELEASED}`,
    '',
    `## ${version} — ${date}`,
    '',
    ...renderCategories(section, { includeInternal: true }),
  ];
  return [...before, ...released, ...after].join('\n').replace(/\n{3,}/g, '\n\n');
}

export function releaseNotes(text, version) {
  const parsed = parseChangelog(text);
  const section = parsed.sections.find((s) => s.version === version);
  if (!section) return null;
  const body = renderCategories(section, { includeInternal: false });
  if (body.length === 0) {
    const raw = parsed.lines.slice(section.start + 1, section.end).join('\n').trim();
    return raw.length > 0 ? raw : null;
  }
  return body.join('\n').trim();
}

export function readRepoFile(relative) {
  return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

export function writeRepoFile(relative, content) {
  fs.writeFileSync(path.join(REPO_ROOT, relative), content);
}

export function currentCliVersion() {
  return JSON.parse(readRepoFile(CLI_PACKAGE_JSON_PATH)).version;
}

export function bumpVersionStrings(version) {
  const pkg = readRepoFile(CLI_PACKAGE_JSON_PATH);
  const pkgNext = pkg.replace(/"version":\s*"\d+\.\d+\.\d+"/, `"version": "${version}"`);
  if (pkgNext === pkg) throw new Error(`no "version" field found in ${CLI_PACKAGE_JSON_PATH}`);
  writeRepoFile(CLI_PACKAGE_JSON_PATH, pkgNext);

  const installers = readRepoFile(CLI_INSTALLERS_PATH);
  const installersNext = installers.replace(
    /export const CLI_VERSION = '\d+\.\d+\.\d+';/,
    `export const CLI_VERSION = '${version}';`,
  );
  if (installersNext === installers) throw new Error(`no CLI_VERSION constant found in ${CLI_INSTALLERS_PATH}`);
  writeRepoFile(CLI_INSTALLERS_PATH, installersNext);
}
