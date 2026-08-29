import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cliUsage, gitRemoteUrl } from './bin-name.js';
import type { ApiClient } from './api.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export type TreeFile = { path: string; content: string };

export type VersionRow = {
  version: string;
  createdAt: string;
  sourceFiles: string[];
};

export function unreconciledMessage(): string {
  return `working copy is unreconciled with the platform — ${cliUsage('pull')}, or pass --force`;
}

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
  const left = new Map(local.map((file) => [file.path, file.content]));
  const right = new Map(remote.map((file) => [file.path, file.content]));
  const names = new Set([...left.keys(), ...right.keys()]);
  return [...names].filter((path) => left.get(path) !== right.get(path)).sort();
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
    if (!keep.has(stale.path)) rmSync(join(root, stale.path));
  }
  for (const file of files) {
    const abs = join(dest, 'games', slug, file.path);
    mkdirSync(dirname(abs), { recursive: true });
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
  return { dest: input.dest, remote: gitRemoteUrl(input.slug) };
}

export async function pullGame(input: { api: ApiClient; slug: string; dest: string }): Promise<{ version: string }> {
  const tree = await fetchLatestTree(input.api, input.slug);
  writeGameFiles(input.dest, input.slug, tree.files);
  return { version: tree.version };
}

export async function diffGame(input: {
  api: ApiClient;
  slug: string;
  dest: string;
}): Promise<{ unreconciled: boolean; changed: string[] }> {
  const tree = await fetchLatestTree(input.api, input.slug);
  const changed = changedPaths(localGameFiles(input.dest, input.slug), tree.files);
  return { unreconciled: changed.length > 0, changed };
}
