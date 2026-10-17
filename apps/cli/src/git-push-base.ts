import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isRasterSourcePath } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';
import { hashesOf, type BaseRecord, type TreeFile } from './checkout-sync.js';
import { checkoutGit, type GitLayout } from './git-checkout-layout.js';
import { knownHistoryCommits } from './git-history-cache.js';
import { readHistory } from './history-api.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { kitPath } from './kit-install.js';

function cachePath(cwd: string, slug: string, scope: string, commit: string): string {
  if (!/^[0-9a-f]{16}$/.test(scope) || !/^[0-9a-f]{40,64}$/.test(commit))
    throw new CliError('Invalid Git delivery cache identity.', EXIT_REFUSED);
  const common = resolve(cwd, checkoutGit(cwd)(['rev-parse', '--git-common-dir']).toString().trim());
  return kitPath(common, `gamedevpl/bases/${scope}/${slug}/${commit}.json`);
}
export function rememberGitDelivery(input: {
  cwd: string;
  slug: string;
  scope: string;
  commit: string;
  version: string;
  files: TreeFile[];
}): void {
  const path = cachePath(input.cwd, input.slug, input.scope, input.commit);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = path + '.' + randomUUID();
  writeFileSync(temp, JSON.stringify({ version: input.version, files: hashesOf(input.files) }), {
    flag: 'wx',
    mode: 0o600,
  });
  renameSync(temp, path);
}
function commitFiles(cwd: string, commit: string, layout: GitLayout): TreeFile[] {
  const git = checkoutGit(cwd),
    prefix = layout.root + '/';
  return git(['ls-tree', '-r', '-z', commit, '--', layout.root])
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [header, path] = line.split('\t'),
        mode = header?.split(' ')[0];
      if (!path?.startsWith(prefix) || !['100644', '100755'].includes(mode ?? ''))
        throw new CliError('Git sources must be regular files.', EXIT_REFUSED);
      const relative = path.slice(prefix.length),
        bytes = git(['show', `${commit}:${path}`]);
      return {
        path: relative,
        content: bytes.toString(isRasterSourcePath(relative) && layout.rasters === 'raw' ? 'base64' : 'utf8'),
      };
    });
}
export async function gitPushBase(input: {
  cwd: string;
  slug: string;
  scope: string;
  commit: string;
  layout: GitLayout;
  api: ApiClient;
}): Promise<BaseRecord> {
  const git = checkoutGit(input.cwd),
    ancestors = new Set(git(['rev-list', '--max-count=10000', input.commit]).toString().trim().split('\n')),
    known = knownHistoryCommits(input.slug, input.cwd, input.scope),
    candidates = new Map<string, BaseRecord>();
  for (const commit of ancestors) {
    const path = cachePath(input.cwd, input.slug, input.scope, commit);
    if (!existsSync(path)) continue;
    if (!lstatSync(path).isFile() || lstatSync(path).size > 1_000_000)
      throw new CliError('Invalid Git delivery cache.', EXIT_REFUSED);
    const record = JSON.parse(readFileSync(path, 'utf8')) as BaseRecord;
    if (
      typeof record.version !== 'string' ||
      !record.files ||
      Array.isArray(record.files) ||
      Object.values(record.files).some((hash) => typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash))
    )
      throw new CliError('Invalid Git delivery base.', EXIT_REFUSED);
    candidates.set(record.version, record);
  }
  const versions = await readHistory(input.api, input.slug);
  if (!versions.length) return { version: 'undelivered', files: {} };
  for (const row of versions) {
    const cached = candidates.get(row.version);
    if (cached) return cached;
    const commit = known.get(row.version);
    if (commit && ancestors.has(commit))
      return { version: row.version, files: hashesOf(commitFiles(input.cwd, commit, input.layout)) };
  }
  throw new CliError(
    'The pushed commit has no known platform base. Fetch and merge the platform history first, or deliver local files with gamedevpl push.',
    EXIT_REFUSED,
  );
}
