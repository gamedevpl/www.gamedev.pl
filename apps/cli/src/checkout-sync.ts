import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { sanitizePath } from './ansi.js';
import { cliUsage } from './bin-name.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export type TreeFile = { path: string; content: string };

export type SyncKind = 'clean' | 'local_only' | 'platform_only' | 'both' | 'conflict' | 'legacy';

export type SyncResult = {
  kind: SyncKind;
  version: string;
  local: string[];
  platform: string[];
  conflict: string[];
};

export type BaseRecord = { version: string; files: Record<string, string> };

export const BASE_FILE = '.gamedev-base.json';

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function pathInside(root: string, rel: string): string {
  if (!rel || isAbsolute(rel) || rel.split(/[\\/]/).some((part) => part === '..' || part === '')) {
    throw new CliError('refusing a path outside the checkout', EXIT_REFUSED);
  }
  const abs = resolve(root, rel);
  const relTo = relative(resolve(root), abs);
  if (relTo.startsWith('..') || isAbsolute(relTo)) {
    throw new CliError('refusing a path outside the checkout', EXIT_REFUSED);
  }
  return abs;
}

export function hashesOf(files: TreeFile[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of files) out[file.path] = hashContent(file.content);
  return out;
}

export function readBase(dest: string): BaseRecord | null {
  const path = join(dest, BASE_FILE);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as BaseRecord;
    if (!parsed || typeof parsed.version !== 'string' || !parsed.files || typeof parsed.files !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeBase(dest: string, version: string, files: TreeFile[]): void {
  const tracked = files.filter((file) => !file.path.split('/').includes('.git'));
  const record: BaseRecord = { version, files: hashesOf(tracked) };
  writeFileSync(join(dest, BASE_FILE), `${JSON.stringify(record, null, 2)}\n`);
}

export function classify(input: {
  local: TreeFile[];
  remote: TreeFile[];
  remoteVersion: string;
  base: BaseRecord | null;
}): SyncResult {
  const local = hashesOf(input.local);
  const remote = hashesOf(input.remote);
  if (!input.base) {
    const changed = changedKeys(local, remote);
    return {
      kind: changed.length ? 'legacy' : 'clean',
      version: input.remoteVersion,
      local: changed,
      platform: [],
      conflict: [],
    };
  }
  const names = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(input.base.files)]);
  const localOnly: string[] = [];
  const platformOnly: string[] = [];
  const conflict: string[] = [];
  for (const path of [...names].sort()) {
    const baseHash = input.base.files[path];
    const localHash = local[path];
    const remoteHash = remote[path];
    const localChanged = localHash !== baseHash;
    const remoteChanged = remoteHash !== baseHash;
    if (localChanged && remoteChanged && localHash !== remoteHash) conflict.push(path);
    else if (localChanged && !remoteChanged) localOnly.push(path);
    else if (remoteChanged && !localChanged) platformOnly.push(path);
  }
  const structuralConflicts: string[] = [];
  for (const l of localOnly) {
    for (const p of platformOnly) {
      if (p.startsWith(`${l}/`) || l.startsWith(`${p}/`)) {
        structuralConflicts.push(l, p);
      }
    }
  }
  if (structuralConflicts.length) {
    conflict.push(...structuralConflicts);
    const conflictSet = new Set(conflict);
    const filteredLocal = localOnly.filter((p) => !conflictSet.has(p));
    const filteredPlatform = platformOnly.filter((p) => !conflictSet.has(p));
    localOnly.length = 0;
    localOnly.push(...filteredLocal);
    platformOnly.length = 0;
    platformOnly.push(...filteredPlatform);
  }
  conflict.sort();
  let kind: SyncKind = 'clean';
  if (conflict.length) kind = 'conflict';
  else if (localOnly.length && platformOnly.length) kind = 'both';
  else if (localOnly.length) kind = 'local_only';
  else if (platformOnly.length) kind = 'platform_only';
  return { kind, version: input.remoteVersion, local: localOnly, platform: platformOnly, conflict };
}

function changedKeys(left: Record<string, string>, right: Record<string, string>): string[] {
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...names].filter((path) => left[path] !== right[path]).sort();
}

function cleanPaths(paths: string[]): string {
  return paths.map(sanitizePath).join(', ');
}

export function formatSyncLines(sync: SyncResult): string[] {
  const lines = [`base ${sync.version || '(none)'} · ${sync.kind.replaceAll('_', ' ')}`];
  if (sync.local.length) lines.push(`local-only: ${cleanPaths(sync.local)}`);
  if (sync.platform.length) lines.push(`platform-only: ${cleanPaths(sync.platform)}`);
  if (sync.conflict.length) lines.push(`conflict: ${cleanPaths(sync.conflict)}`);
  return lines;
}

export function syncRefuse(sync: SyncResult, op: 'pull' | 'submit'): { message: string; next: string } {
  if (sync.kind === 'legacy') {
    return {
      message: `this checkout has no base version — ${cliUsage('diff')} shows what differs; copy games/<slug> aside, then check the game out again so pull cannot guess`,
      next: cliUsage('checkout', '<slug>'),
    };
  }
  if (sync.kind === 'conflict') {
    const alsoLost = sync.local.length ? ` It discards ${cleanPaths(sync.local)} as well.` : '';
    return {
      message: `conflict on ${cleanPaths(sync.conflict)} — ${cliUsage('diff')} shows both sides. Plain pull refuses while they disagree: copy the whole games/<slug> aside, then ${cliUsage('pull', '--force')} replaces it with the platform copy for you to merge yours back into.${alsoLost}`,
      next: cliUsage('diff'),
    };
  }
  if (op === 'pull' && (sync.kind === 'local_only' || sync.kind === 'both')) {
    return {
      message: `local edits would be overwritten (${cleanPaths(sync.local)}) — ${cliUsage('submit')} delivers them first, or copy them aside and ${cliUsage('pull', '--force')} to discard them`,
      next: cliUsage('submit'),
    };
  }
  if (op === 'submit' && sync.kind === 'platform_only') {
    return {
      message: `platform is ahead (${cleanPaths(sync.platform)}) — ${cliUsage('pull')} brings those files down, and keeps anything you changed`,
      next: cliUsage('pull'),
    };
  }
  return {
    message: `working copy is ${sync.kind.replaceAll('_', ' ')} versus ${sync.version} — ${cliUsage('diff')} shows the detail`,
    next: op === 'pull' ? cliUsage('submit') : cliUsage('pull'),
  };
}

export function unreconciledMessage(sync?: SyncResult): string {
  if (!sync) {
    return `working copy conflicts with the platform — copy local files aside, then ${cliUsage('pull')}`;
  }
  return syncRefuse(sync, 'pull').message;
}
