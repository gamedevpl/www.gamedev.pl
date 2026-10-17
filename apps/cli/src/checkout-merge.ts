import { isRasterSourcePath } from '@gamedevpl/contract';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApiClient } from './api.js';
import { sanitizePath } from './ansi.js';
import { hashContent, type BaseRecord, type TreeFile } from './checkout-sync.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { readHistoryTree } from './history-api.js';
import { historyTree, localTree, sourcePath } from './history-edit-tree.js';
import { sourceSpecSlug } from './source-project.js';

function mergeText(path: string, local: string, base: string, remote: string): string {
  if (isRasterSourcePath(path) || [local, base, remote].some((text) => text.includes('\0')))
    throw new CliError(`Binary conflict on ${sanitizePath(path)}. Local files were not changed.`, EXIT_REFUSED);
  const cwd = mkdtempSync(join(tmpdir(), 'gamedev-merge-'));
  try {
    for (const [name, text] of [
      ['local', local],
      ['base', base],
      ['remote', remote],
      ['config', ''],
    ] as const)
      writeFileSync(join(cwd, name), text, { mode: 0o600 });
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
    Object.assign(env, {
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(cwd, 'config'),
      GIT_TERMINAL_PROMPT: '0',
    });
    const result = spawnSync('git', ['merge-file', '-p', '--', 'local', 'base', 'remote'], {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error)
      throw new CliError('Merging source edits requires Git on PATH. Local files were not changed.', EXIT_REFUSED);
    if (result.status !== 0)
      throw new CliError(
        `Conflict on ${sanitizePath(path)}. Local files were not changed. Review gamedevpl diff and reconcile the overlapping changes before retrying.`,
        EXIT_REFUSED,
      );
    return result.stdout;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

export async function mergeCheckout(input: {
  api: ApiClient;
  slug: string;
  base: BaseRecord | null;
  local: TreeFile[];
  remote: TreeFile[];
  sourceRepository: boolean;
}): Promise<{ files: TreeFile[]; kept: string[]; merged: string[] }> {
  const { base } = input;
  if (!base || Array.isArray(base.files) || Object.values(base.files).some((hash) => typeof hash !== 'string'))
    throw new CliError('Cannot merge conflicting sources without a valid synchronization base.', EXIT_REFUSED);
  localTree(input.local);
  localTree(input.remote);
  const tree = await readHistoryTree(input.api, input.slug, base.version);
  if (tree.slug !== input.slug || tree.version !== base.version)
    throw new CliError('Conflicting sources have a mismatched historical base.', EXIT_REFUSED);
  const historical = historyTree(tree),
    original = new Map<string, string>();
  for (const [path, hash] of Object.entries(base.files)) {
    sourcePath(path);
    const bytes = historical.get(path),
      text = bytes?.toString(isRasterSourcePath(path) ? 'base64' : 'utf8');
    if (text === undefined || hashContent(text) !== hash)
      throw new CliError('Cannot merge conflicting sources: historical base hashes do not match.', EXIT_REFUSED);
    original.set(path, text);
  }
  const local = new Map(input.local.map((file) => [file.path, file.content])),
    remote = new Map(input.remote.map((file) => [file.path, file.content]));
  const files: TreeFile[] = [],
    kept: string[] = [],
    merged: string[] = [];
  const names = new Set([...original.keys(), ...local.keys(), ...remote.keys()]);
  for (const path of [...names].sort()) {
    const before = original.get(path),
      ours = local.get(path),
      theirs = remote.get(path);
    let content: string | undefined;
    if (ours === theirs || theirs === before) content = ours;
    else if (ours === before) content = theirs;
    else {
      if (before === undefined || ours === undefined || theirs === undefined)
        throw new CliError(`Add/delete conflict on ${sanitizePath(path)}. Local files were not changed.`, EXIT_REFUSED);
      content = mergeText(path, ours, before, theirs);
      merged.push(path);
    }
    if (content !== undefined) files.push({ path, content });
    if (content !== theirs) kept.push(path);
  }
  localTree(files);
  if (
    input.sourceRepository &&
    sourceSpecSlug(files.find((file) => file.path === 'SPEC.md')?.content ?? '') !== input.slug
  )
    throw new CliError('Merged SPEC.md would change or remove this source repository’s game identity.', EXIT_REFUSED);
  return { files, kept, merged };
}
