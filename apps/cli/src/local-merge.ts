import { isRasterSourcePath } from '@gamedevpl/contract';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { localTree } from './history-edit-tree.js';
import type { TreeFile } from './checkout-sync.js';

export type LocalConflict = {
  paths: string[];
  kind: 'text' | 'binary' | 'add-delete' | 'structural';
  resolved: boolean;
};
export const hasConflictMarkers = (text: string): boolean =>
  /^(?:<{7}(?: |$)|\|{7} base(?:\r?$)|>{7}(?: |$))/m.test(text);
const related = (a: string, b: string) => {
  const x = a.toLowerCase(),
    y = b.toLowerCase();
  return x === y || x.startsWith(y + '/') || y.startsWith(x + '/');
};

function textMerge(ours: string, base: string, theirs: string): { content: string; conflict: boolean } {
  const cwd = mkdtempSync(join(tmpdir(), 'gamedev-merge-'));
  try {
    for (const [name, content] of [
      ['local', ours],
      ['base', base],
      ['incoming', theirs],
      ['config', ''],
    ] as const)
      writeFileSync(join(cwd, name), content, { mode: 0o600 });
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
    Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(cwd, 'config'), GIT_TERMINAL_PROMPT: '0' });
    const result = spawnSync(
      'git',
      ['merge-file', '-p', '--diff3', '-L', 'local', '-L', 'base', '-L', 'incoming', '--', 'local', 'base', 'incoming'],
      {
        cwd,
        env,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (result.error || result.status === null || result.status < 0 || result.status > 127)
      throw new CliError('Text merging requires Git on PATH. Local files were not changed.', EXIT_REFUSED);
    return { content: result.stdout, conflict: result.status !== 0 };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

export function mergeLocalTrees(baseFiles: TreeFile[], oursFiles: TreeFile[], theirsFiles: TreeFile[]) {
  for (const files of [baseFiles, oursFiles, theirsFiles]) localTree(files);
  const base = new Map(baseFiles.map((f) => [f.path, f.content])),
    ours = new Map(oursFiles.map((f) => [f.path, f.content])),
    theirs = new Map(theirsFiles.map((f) => [f.path, f.content])),
    names = [...new Set([...base.keys(), ...ours.keys(), ...theirs.keys()])].sort(),
    conflicts: LocalConflict[] = [],
    merged: string[] = [],
    result = new Map<string, string>();
  const groups: string[][] = [];
  for (const name of names) {
    const hits = groups.filter((group) => group.some((path) => related(path, name)));
    if (!hits.length) groups.push([name]);
    else {
      hits[0]!.push(name);
      for (const group of hits.slice(1)) {
        hits[0]!.push(...group);
        groups.splice(groups.indexOf(group), 1);
      }
    }
  }
  const structural = new Set<string>();
  for (const paths of groups.filter((group) => group.length > 1)) {
    const before = baseFiles.filter((f) => paths.includes(f.path)),
      left = oursFiles.filter((f) => paths.includes(f.path)),
      right = theirsFiles.filter((f) => paths.includes(f.path));
    const same = (a: TreeFile[], b: TreeFile[]) =>
      JSON.stringify([...a].sort((x, y) => x.path.localeCompare(y.path))) ===
      JSON.stringify([...b].sort((x, y) => x.path.localeCompare(y.path)));
    const selected = same(left, right) || same(right, before) ? left : same(left, before) ? right : undefined;
    for (const path of paths) structural.add(path);
    for (const file of selected ?? left) result.set(file.path, file.content);
    if (!selected) conflicts.push({ paths, kind: 'structural', resolved: false });
  }
  for (const path of names) {
    if (structural.has(path)) continue;
    const before = base.get(path),
      left = ours.get(path),
      right = theirs.get(path);
    let content: string | undefined;
    if (left === right || right === before) content = left;
    else if (left === before) content = right;
    else if (before === undefined || left === undefined || right === undefined) {
      content = left;
      conflicts.push({ paths: [path], kind: 'add-delete', resolved: false });
    } else if (isRasterSourcePath(path) || [before, left, right].some((text) => text.includes('\0'))) {
      content = left;
      conflicts.push({ paths: [path], kind: 'binary', resolved: false });
    } else {
      const value = textMerge(left, before, right);
      content = value.content;
      if (value.conflict) conflicts.push({ paths: [path], kind: 'text', resolved: false });
      else merged.push(path);
    }
    if (content !== undefined) result.set(path, content);
  }
  const files = [...result].map(([path, content]) => ({ path, content }));
  localTree(files);
  return { files, conflicts, merged, kept: names.filter((path) => result.get(path) !== theirs.get(path)) };
}
