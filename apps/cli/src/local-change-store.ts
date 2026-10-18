import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { kitPath } from './kit-install.js';
import { localTree } from './history-edit-tree.js';
import type { TreeFile } from './checkout-sync.js';
import type { SourceSnapshot } from './history-edit-files.js';

export const OPERATION_FILE = '.gamedev/merge.json';
export const filesSchema = z.array(z.object({ path: z.string().max(512), content: z.string() }).strict()).max(2000);
const modeSchema = z.number().int().min(0).max(0o777);
export const snapshotSchema = z
  .object({
    files: z.array(z.object({ path: z.string().max(512), content: z.string(), mode: modeSchema }).strict()).max(2000),
    directories: z.array(z.tuple([z.string().max(512), modeSchema])).max(2000),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type StoredSnapshot = z.infer<typeof snapshotSchema>;

export function writeLocalJson(root: string, relative: string, value: unknown): void {
  const path = kitPath(root, relative),
    temporary = kitPath(root, relative + '.' + randomUUID());
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const content = JSON.stringify(value);
  if (Buffer.byteLength(content) > 96_000_000) throw new CliError('Local source record exceeds 96 MB.', EXIT_REFUSED);
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
export function readLocalJson(root: string, relative: string): unknown {
  const path = kitPath(root, relative),
    stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 96_000_000) throw new CliError('Invalid local source record.', EXIT_REFUSED);
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function checkedFiles(files: TreeFile[]): TreeFile[] {
  localTree(files);
  if (new Set(files.map((file) => file.path)).size !== files.length)
    throw new CliError('Duplicate local source path.', EXIT_REFUSED);
  return files;
}
export function storedSnapshot(snapshot: SourceSnapshot): StoredSnapshot {
  return {
    files: [...snapshot.files].map(([path, file]) => ({
      path,
      content: file.bytes.toString('base64'),
      mode: file.mode,
    })),
    directories: [...snapshot.directories],
    digest: snapshot.digest,
  };
}
export function restoreSnapshot(root: string, value: StoredSnapshot): SourceSnapshot {
  const files: SourceSnapshot['files'] = new Map(),
    directories = new Map<string, number>();
  let size = 0;
  for (const file of value.files) {
    kitPath(root, file.path);
    const bytes = Buffer.from(file.content, 'base64');
    size += bytes.length;
    if (bytes.toString('base64') !== file.content || size > 32_000_000 || files.has(file.path))
      throw new CliError('Invalid local source snapshot.', EXIT_REFUSED);
    files.set(file.path, { bytes, mode: file.mode });
  }
  for (const [path, mode] of value.directories) {
    if (path) kitPath(root, path);
    if (directories.has(path)) throw new CliError('Duplicate local source directory.', EXIT_REFUSED);
    directories.set(path, mode);
  }
  const names = new Set(files.keys());
  for (const path of [...files.keys(), ...directories.keys()]) {
    if (directories.has(path) && names.has(path)) throw new CliError('Overlapping snapshot paths.', EXIT_REFUSED);
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++)
      if (names.has(parts.slice(0, i).join('/'))) throw new CliError('Overlapping snapshot paths.', EXIT_REFUSED);
  }
  if (!directories.has('')) throw new CliError('Missing source snapshot root.', EXIT_REFUSED);
  return { files, directories, digest: value.digest };
}
export function hasLocalMerge(root: string): boolean {
  return existsSync(kitPath(root, OPERATION_FILE));
}
