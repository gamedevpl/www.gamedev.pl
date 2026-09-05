import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cliUsage, gitRemoteUrl } from './bin-name.js';
import type { ApiClient } from './api.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import {
  classify,
  hashesOf,
  pathInside,
  readBase,
  writeBase,
  unreconciledMessage,
  type SyncResult,
  type TreeFile,
} from './checkout-sync.js';

export type { TreeFile, SyncResult } from './checkout-sync.js';
export { unreconciledMessage, formatSyncLines, syncRefuse, writeBase, readBase } from './checkout-sync.js';

export type VersionRow = {
  version: string;
  createdAt: string;
  sourceFiles: string[];
};

export function readCheckoutSlug(cwd: string): string | null {
  const path = join(cwd, '.gamedev-slug');
  return existsSync(path) ? readFileSync(path, 'utf8').trim() || null : null;
}

function defaultRun(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new CliError(result.stderr || `${cmd} failed`, EXIT_REFUSED);
}

function walkFiles(root: string, rel = ''): TreeFile[] {
  const dir = rel ? join(root, rel) : root;
  if (!existsSync(dir)) return [];
  const dirStat = lstatSync(dir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return [];
  const out: TreeFile[] = [];
  for (const entry of readdirSync(dir)) {
    const nextRel = rel ? `${rel}/${entry}` : entry;
    const abs = join(dir, entry);
    const st = lstatSync(abs);
    // Do not follow links — rmSync would escape.
    if (st.isSymbolicLink()) {
      out.push({ path: nextRel, content: '' });
      continue;
    }
    if (st.isDirectory()) out.push(...walkFiles(root, nextRel));
    else if (st.isFile()) out.push({ path: nextRel, content: readFileSync(abs, 'utf8') });
  }
  return out;
}

export function localGameFiles(dest: string, slug: string): TreeFile[] {
  return walkFiles(join(dest, 'games', slug));
}

export function changedPaths(local: TreeFile[], remote: TreeFile[]): string[] {
  const left = hashesOf(local);
  const right = hashesOf(remote);
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...names].filter((path) => left[path] !== right[path]).sort();
}

export async function fetchLatestTree(api: ApiClient, slug: string): Promise<{ version: string; files: TreeFile[] }> {
  const listed = await api.request<{ versions: VersionRow[] }>('GET', `/api/me/studio/games/${slug}/versions`);
  const latest = listed.versions[0];
  if (!latest) throw new CliError('this game has no delivered version yet', EXIT_REFUSED);
  const tree = await api.request<{ version: string; files: TreeFile[] }>(
    'GET',
    `/api/me/studio/games/${slug}/versions/${latest.version}/tree`,
  );
  return { version: tree.version, files: tree.files };
}

export function writeGameFiles(dest: string, slug: string, files: TreeFile[]): void {
  const keep = new Set(files.map((file) => file.path));
  const root = join(dest, 'games', slug);
  for (const stale of walkFiles(root)) {
    if (!keep.has(stale.path)) rmSync(pathInside(root, stale.path));
  }
  for (const file of files) {
    const abs = pathInside(root, file.path);
    mkdirSync(dirname(abs), { recursive: true });
    if (existsSync(abs) && lstatSync(abs).isSymbolicLink()) rmSync(abs);
    writeFileSync(abs, file.content);
  }
}

export async function checkoutGame(input: {
  api: ApiClient;
  slug: string;
  dest: string;
  fetchBuffer?: (url: string) => Promise<Buffer>;
  run?: (cmd: string, args: string[], cwd: string) => void;
}): Promise<{ dest: string; remote: string }> {
  const run = input.run ?? defaultRun;
  mkdirSync(input.dest, { recursive: true });
  const archive = input.fetchBuffer
    ? await input.fetchBuffer(`${input.api.origin}/api/me/studio/games/${input.slug}/workspace`)
    : await input.api.requestBytes(`/api/me/studio/games/${input.slug}/workspace`);
  const tgz = join(input.dest, '.gamedev-workspace.tgz');
  writeFileSync(tgz, archive);
  try {
    run('tar', ['-xzf', '.gamedev-workspace.tgz'], input.dest);
    writeFileSync(join(input.dest, '.gamedev-slug'), input.slug);
    run('git', ['init'], input.dest);
    run('git', ['remote', 'add', 'origin', gitRemoteUrl(input.slug)], input.dest);
  } finally {
    rmSync(tgz, { force: true });
  }
  try {
    const tree = await fetchLatestTree(input.api, input.slug);
    writeGameFiles(input.dest, input.slug, tree.files);
    writeBase(input.dest, tree.version, tree.files);
  } catch {
    const local = localGameFiles(input.dest, input.slug);
    if (local.length) writeBase(input.dest, 'archive', local);
  }
  return { dest: input.dest, remote: gitRemoteUrl(input.slug) };
}

export async function inspectGame(input: { api: ApiClient; slug: string; dest: string }): Promise<{
  sync: SyncResult;
  tree: { version: string; files: TreeFile[] };
}> {
  const tree = await fetchLatestTree(input.api, input.slug);
  const base = readBase(input.dest);
  const local = localGameFiles(input.dest, input.slug);
  const sync = classify({ local, remote: tree.files, remoteVersion: tree.version, base });
  if (sync.kind === 'clean') {
    writeBase(input.dest, tree.version, tree.files);
  }
  return { sync, tree };
}

export async function pullGame(input: {
  api: ApiClient;
  slug: string;
  dest: string;
  force?: boolean;
}): Promise<{ version: string; sync: SyncResult; kept: string[] }> {
  const { sync, tree } = await inspectGame(input);
  const kept: string[] = [];
  if (input.force) {
    writeGameFiles(input.dest, input.slug, tree.files);
    writeBase(input.dest, tree.version, tree.files);
    return { version: tree.version, sync, kept: [] };
  }
  if (sync.kind === 'clean' || sync.kind === 'platform_only') {
    writeGameFiles(input.dest, input.slug, tree.files);
    writeBase(input.dest, tree.version, tree.files);
    return { version: tree.version, sync, kept };
  }
  if (sync.kind === 'both') {
    const localMap = new Map(localGameFiles(input.dest, input.slug).map((file) => [file.path, file]));
    const remoteMap = new Map(tree.files.map((file) => [file.path, file]));
    const merged: TreeFile[] = [];
    const names = new Set([...localMap.keys(), ...remoteMap.keys()]);
    for (const path of names) {
      if (sync.local.includes(path)) {
        const file = localMap.get(path);
        if (file) merged.push(file);
        kept.push(path);
      } else if (remoteMap.has(path)) {
        merged.push(remoteMap.get(path)!);
      }
    }
    writeGameFiles(input.dest, input.slug, merged);
    writeBase(input.dest, tree.version, tree.files);
    return { version: tree.version, sync, kept };
  }
  throw new CliError(
    unreconciledMessage(sync),
    EXIT_REFUSED,
    sync.kind === 'local_only' ? cliUsage('submit') : cliUsage('checkout', '<slug>'),
  );
}

export async function diffGame(input: { api: ApiClient; slug: string; dest: string }): Promise<SyncResult> {
  return (await inspectGame(input)).sync;
}
