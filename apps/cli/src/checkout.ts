import { withCheckoutWriter } from './workbench-lock.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
  syncRefuse,
  type SyncResult,
  type TreeFile,
} from './checkout-sync.js';
import { createIgnoreMatcher, type IgnoredHit } from './ignore.js';
import { formatCheckoutIncoming, formatPatches, formatPullNotices, ignoredClashMessage } from './working-copy.js';

export type { TreeFile, SyncResult } from './checkout-sync.js';
export type { IgnoredHit } from './ignore.js';
export { unreconciledMessage, formatSyncLines, syncRefuse, writeBase, readBase } from './checkout-sync.js';
export { formatWorkingCopy } from './working-copy.js';

export type DiffReport = SyncResult & { ignored: IgnoredHit[]; patches: string[]; incoming: IncomingIgnore };

export type IncomingIgnore = { blocked: string[]; absent: string[]; git: string[] };

export type VersionRow = {
  version: string;
  createdAt: string;
  sourceFiles: string[];
};

export function readCheckoutSlug(cwd: string): string | null {
  const path = join(cwd, '.gamedev-slug');
  return existsSync(path) ? readFileSync(path, 'utf8').trim() || null : null;
}

// Walk up, so any subdirectory of a checkout finds it.
export function findCheckout(cwd: string): { slug: string; root: string } | null {
  let dir = resolve(cwd);
  for (let depth = 0; depth < 40; depth += 1) {
    const slug = readCheckoutSlug(dir);
    if (slug) return { slug, root: dir };
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function defaultRun(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new CliError(result.stderr || `${cmd} failed`, EXIT_REFUSED);
}

function trackedPaths(dest: string): Set<string> {
  const tracked = new Set<string>();
  for (const path of Object.keys(readBase(dest)?.files ?? {})) {
    if (!path.split('/').includes('.git')) tracked.add(path);
  }
  return tracked;
}

function coversTracked(path: string, tracked: Set<string>): boolean {
  if (tracked.has(path)) return true;
  const prefix = `${path}/`;
  for (const name of tracked) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

function scanGame(dest: string, slug: string): { files: TreeFile[]; ignored: IgnoredHit[] } {
  const root = join(dest, 'games', slug);
  const files: TreeFile[] = [];
  const ignored: IgnoredHit[] = [];
  if (!existsSync(root)) return { files, ignored };
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return { files, ignored };
  const matcher = createIgnoreMatcher(dest);
  const tracked = trackedPaths(dest);
  const prefix = `games/${slug}`;
  const visit = (rel: string): void => {
    const dir = rel ? join(root, rel) : root;
    const dirStat = lstatSync(dir);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return;
    for (const entry of readdirSync(dir)) {
      const nextRel = rel ? `${rel}/${entry}` : entry;
      const abs = join(dir, entry);
      const stat = lstatSync(abs);
      const directory = !stat.isSymbolicLink() && stat.isDirectory();
      // A link is recorded, never followed, so a later delete cannot escape.
      if (nextRel.split('/').includes('.git')) {
        ignored.push({ path: nextRel, source: 'git', pattern: '.git', directory: directory || entry === '.git' });
        continue;
      }
      const match = matcher.ignored(`${prefix}/${nextRel}`, directory);
      if (match && !coversTracked(nextRel, tracked)) {
        ignored.push({ path: nextRel, source: match.source, pattern: match.pattern, directory });
        continue;
      }
      if (stat.isSymbolicLink()) {
        files.push({ path: nextRel, content: '' });
        continue;
      }
      if (directory) visit(nextRel);
      else if (stat.isFile()) files.push({ path: nextRel, content: readFileSync(abs, 'utf8') });
    }
  };
  visit('');
  return { files, ignored };
}

export function localGameFiles(dest: string, slug: string): TreeFile[] {
  return scanGame(dest, slug).files;
}

export function ignoredGameFiles(dest: string, slug: string): IgnoredHit[] {
  return scanGame(dest, slug).ignored;
}

function ignoredUntracked(
  dest: string,
  slug: string,
  rel: string,
  tracked: Set<string>,
  matcher = createIgnoreMatcher(dest),
  isDirectory = false,
): boolean {
  if (rel.split('/').includes('.git')) return true;
  const match = matcher.ignored(`games/${slug}/${rel}`, isDirectory);
  return match !== null && !coversTracked(rel, tracked);
}

export function trackedTree(dest: string, slug: string, files: TreeFile[]): TreeFile[] {
  const tracked = trackedPaths(dest);
  const matcher = createIgnoreMatcher(dest);
  return files.filter((file) => !ignoredUntracked(dest, slug, file.path, tracked, matcher));
}

export function classifyIncoming(dest: string, slug: string, files: TreeFile[]): IncomingIgnore {
  const tracked = trackedPaths(dest);
  const matcher = createIgnoreMatcher(dest);
  const blocked: string[] = [];
  const absent: string[] = [];
  const git: string[] = [];
  const root = join(dest, 'games', slug);
  for (const file of files) {
    if (file.path.split('/').includes('.git')) {
      git.push(file.path);
      continue;
    }
    let abs: string;
    try {
      abs = pathInside(root, file.path);
    } catch {
      blocked.push(file.path);
      continue;
    }
    const stat = existsSync(abs) ? lstatSync(abs) : null;
    const directory = stat !== null && !stat.isSymbolicLink() && stat.isDirectory();
    if (!ignoredUntracked(dest, slug, file.path, tracked, matcher, directory)) continue;
    if (!stat) {
      absent.push(file.path);
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isFile() || readFileSync(abs, 'utf8') !== file.content) blocked.push(file.path);
  }
  return {
    blocked: [...new Set(blocked)].sort(),
    absent: [...new Set(absent)].sort(),
    git: [...new Set(git)].sort(),
  };
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
  if (!latest) return { version: 'undelivered', files: [] };
  const tree = await api.request<{ version: string; files: TreeFile[] }>(
    'GET',
    `/api/me/studio/games/${slug}/versions/${latest.version}/tree`,
  );
  return { version: tree.version, files: tree.files };
}

export function writeGameFiles(dest: string, slug: string, files: TreeFile[]): void {
  const keep = new Set(files.map((file) => file.path));
  const root = join(dest, 'games', slug);
  for (const stale of localGameFiles(dest, slug)) {
    if (!keep.has(stale.path)) rmSync(pathInside(root, stale.path));
  }
  for (const file of files) {
    if (file.path.split('/').includes('.git')) continue;
    const abs = pathInside(root, file.path);
    mkdirSync(dirname(abs), { recursive: true });
    if (existsSync(abs) && lstatSync(abs).isSymbolicLink()) rmSync(abs);
    writeFileSync(abs, file.content);
  }
}

export function initializeCheckoutGit(dest: string, slug: string, run = defaultRun): void {
  run('git', ['init'], dest);
  run('git', ['remote', 'add', 'origin', gitRemoteUrl(slug)], dest);
}

export async function checkoutGame(input: {
  api: ApiClient;
  slug: string;
  dest: string;
  fetchBuffer?: (url: string) => Promise<Buffer>;
  run?: (cmd: string, args: string[], cwd: string) => void;
  allowUndelivered?: boolean;
}): Promise<{ dest: string; remote: string; notices: string[] }> {
  const run = input.run ?? defaultRun;
  if (
    existsSync(input.dest) &&
    (lstatSync(input.dest).isSymbolicLink() ||
      !lstatSync(input.dest).isDirectory() ||
      readdirSync(input.dest).length > 0)
  ) {
    throw new CliError(
      'Checkout destination is not empty; your files were left untouched.',
      EXIT_REFUSED,
      `Choose another directory: ${cliUsage('checkout', `${input.slug} <new-directory>`)}`,
    );
  }
  mkdirSync(input.dest, { recursive: true });
  const archive = input.fetchBuffer
    ? await input.fetchBuffer(`${input.api.origin}/api/me/studio/games/${input.slug}/workspace`)
    : await input.api.requestBytes(
        `/api/me/studio/games/${input.slug}/workspace${input.allowUndelivered ? '?allowUndelivered=true' : ''}`,
      );
  const tgz = join(input.dest, '.gamedev-workspace.tgz');
  writeFileSync(tgz, archive);
  try {
    run('tar', ['-xzf', '.gamedev-workspace.tgz'], input.dest);
    writeFileSync(join(input.dest, '.gamedev-slug'), input.slug);
    initializeCheckoutGit(input.dest, input.slug, run);
  } finally {
    rmSync(tgz, { force: true });
  }
  const notices: string[] = [];
  try {
    const tree = await fetchLatestTree(input.api, input.slug);
    if (tree.version !== 'undelivered') {
      const incoming = classifyIncoming(input.dest, input.slug, tree.files);
      writeGameFiles(input.dest, input.slug, tree.files);
      notices.push(...formatCheckoutIncoming(incoming));
    }
    writeBase(input.dest, tree.version, trackedTree(input.dest, input.slug, tree.files));
  } catch {
    const local = localGameFiles(input.dest, input.slug);
    if (local.length) writeBase(input.dest, 'archive', local);
  }
  const instructions = join(input.dest, 'AGENTS.md');
  const note =
    '\n## Playing this game\n\nWhen the creator asks to play, run `gamedevpl play` from this checkout. It opens a sandboxed local preview with automatic reload after successful builds. Repeating it reuses the server. `--no-open` prints the URL; `--stop` stops it. Errors preserve the last playable build. Playing never submits or publishes.\n';
  const previous = existsSync(instructions) ? readFileSync(instructions, 'utf8') : '';
  if (!previous.includes('## Playing this game')) writeFileSync(instructions, previous + note);
  return { dest: input.dest, remote: gitRemoteUrl(input.slug), notices };
}

export async function inspectGame(input: { api: ApiClient; slug: string; dest: string }): Promise<{
  sync: SyncResult;
  tree: { version: string; files: TreeFile[] };
  ignored: IgnoredHit[];
}> {
  const tree = await fetchLatestTree(input.api, input.slug);
  const base = readBase(input.dest);
  const ignored = ignoredGameFiles(input.dest, input.slug);
  const local = localGameFiles(input.dest, input.slug);
  const remote = trackedTree(input.dest, input.slug, tree.files);
  const sync = classify({ local, remote, remoteVersion: tree.version, base });
  const incoming = classifyIncoming(input.dest, input.slug, tree.files);
  if (sync.kind === 'clean' && !incoming.blocked.length) {
    writeBase(input.dest, tree.version, remote);
  }
  const seen = new Set(ignored.map((hit) => hit.path));
  const remoteGit = tree.files
    .filter((file) => file.path.split('/').includes('.git') && !seen.has(file.path))
    .map((file) => ({ path: file.path, source: 'git' as const, pattern: '.git', directory: false }));
  return { sync, tree, ignored: [...ignored, ...remoteGit] };
}

async function pullGameUnlocked(input: {
  api: ApiClient;
  slug: string;
  dest: string;
  force?: boolean;
}): Promise<{ version: string; sync: SyncResult; kept: string[]; notices: string[] }> {
  const { sync, tree } = await inspectGame(input);
  const incoming = classifyIncoming(input.dest, input.slug, tree.files);
  if (incoming.blocked.length && !input.force) {
    throw new CliError(ignoredClashMessage(incoming.blocked), EXIT_REFUSED, cliUsage('pull', '--force'));
  }
  const notices = formatPullNotices(incoming, input.force === true);
  const kept: string[] = [];
  const tracked = trackedTree(input.dest, input.slug, tree.files);
  if (input.force) {
    writeGameFiles(input.dest, input.slug, tree.files);
    writeBase(input.dest, tree.version, tree.files);
    return { version: tree.version, sync, kept: [], notices };
  }
  if (sync.kind === 'clean' || sync.kind === 'platform_only') {
    writeGameFiles(input.dest, input.slug, tracked);
    writeBase(input.dest, tree.version, tracked);
    return { version: tree.version, sync, kept, notices };
  }
  if (sync.kind === 'both') {
    const localMap = new Map(localGameFiles(input.dest, input.slug).map((file) => [file.path, file]));
    const remoteMap = new Map(tracked.map((file) => [file.path, file]));
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
    writeBase(input.dest, tree.version, tracked);
    return { version: tree.version, sync, kept, notices };
  }
  const refused = syncRefuse(sync, 'pull');
  throw new CliError(refused.message, EXIT_REFUSED, refused.next);
}

export async function diffGame(input: { api: ApiClient; slug: string; dest: string }): Promise<DiffReport> {
  const { sync, tree, ignored } = await inspectGame(input);
  const patches = formatPatches(sync, localGameFiles(input.dest, input.slug), tree.files);
  const incoming = classifyIncoming(input.dest, input.slug, tree.files);
  return { ...sync, ignored, patches, incoming };
}

export function pullGame(input: Parameters<typeof pullGameUnlocked>[0]): ReturnType<typeof pullGameUnlocked> {
  return withCheckoutWriter(input.dest, () => pullGameUnlocked(input));
}
