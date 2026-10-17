import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HistorySourceFile, HistoryVersion } from '@gamedevpl/contract';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { fastImportScript, versionImportRef } from './git-history-import.js';

export type HistoryGit = {
  (args: string[], input?: Buffer): string;
  bytes: (args: string[], input?: Buffer) => Buffer;
};
export async function withHistoryGit<T>(
  input: {
    slug: string;
    versions: HistoryVersion[];
    trees: Map<string, HistorySourceFile[]>;
  },
  run: (git: HistoryGit) => T,
): Promise<T> {
  const cwd = mkdtempSync(join(tmpdir(), 'gamedev-history-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const config = join(cwd, 'empty-config');
  writeFileSync(config, '');
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config, GIT_TERMINAL_PROMPT: '0' });
  const bytes = (args: string[], input?: Buffer): Buffer => {
    const result = spawnSync('git', ['--no-pager', ...args], {
      cwd,
      env,
      input,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0)
      throw new CliError(result.stderr?.toString().trim() || 'history requires Git on PATH', EXIT_REFUSED);
    return result.stdout;
  };
  const git: HistoryGit = Object.assign((args: string[], input?: Buffer) => bytes(args, input).toString('utf8'), {
    bytes,
  });
  try {
    git(['init', '--quiet', '--template=']);
    git(['fast-import', '--quiet'], fastImportScript(input));
    return run(git);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

export function versionPatch(git: HistoryGit, slug: string, before: string | null, after: string): string {
  const target = versionImportRef(slug, after);
  return before
    ? git(['diff', '--no-ext-diff', '--no-textconv', versionImportRef(slug, before), target, '--'])
    : git(['show', '--format=', '--no-ext-diff', '--no-textconv', '--root', target, '--']);
}

export type HistoryBlameLine = {
  line: number;
  originalLine: number;
  version: string;
  createdAt: string;
  content: string;
};
export function versionBlame(
  git: HistoryGit,
  slug: string,
  version: string,
  path: string,
  versions: HistoryVersion[],
): HistoryBlameLine[] {
  const output = git(['blame', '--line-porcelain', versionImportRef(slug, version), '--', `games/${slug}/${path}`]);
  const rows: HistoryBlameLine[] = [];
  let originalLine = 0,
    line = 0,
    attributed = '';
  const dates = new Map(versions.map((row) => [row.version, row.createdAt]));
  for (const text of output.split('\n')) {
    const header = /^[0-9a-f]{40,64} (\d+) (\d+)(?: \d+)?$/.exec(text);
    if (header) {
      originalLine = Number(header[1]);
      line = Number(header[2]);
    } else if (text.startsWith('summary ')) attributed = text.slice(8);
    else if (text.startsWith('\t'))
      rows.push({
        line,
        originalLine,
        version: attributed,
        createdAt: dates.get(attributed) ?? '',
        content: text.slice(1),
      });
  }
  return rows;
}
