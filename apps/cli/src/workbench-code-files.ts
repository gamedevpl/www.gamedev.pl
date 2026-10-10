import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { isDeliverablePath, isRasterSourcePath } from '@gamedevpl/contract';
import { withCheckoutWriter } from './workbench-lock.js';
import { pathInside } from './checkout-sync.js';

export type CodeCheckout = { root: string; slug: string };
export type CodeFile = { path: string; content: string; version: string; readOnly: boolean };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const MAX_FILE_BYTES = 1_000_000;

export function codeProjectId(checkout: CodeCheckout): string {
  return digest(`${realpathSync(checkout.root)}\0${checkout.slug}`);
}

function safePath(checkout: CodeCheckout, path: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(checkout.slug)) throw Error('Invalid project');
  const projectPrefix = `games/${checkout.slug}/`;
  const own =
    path.startsWith(projectPrefix) &&
    isDeliverablePath(path.slice(projectPrefix.length)) &&
    !isRasterSourcePath(path.slice(projectPrefix.length));
  const kit = /^shared\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.ts$/.test(path);
  if (!own && !kit) throw Error('File outside this project');
  const root = realpathSync(checkout.root);
  const absolute = pathInside(root, path);
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw Error('Symbolic links are unavailable');
  }
  return absolute;
}

export function readCodeFile(checkout: CodeCheckout, path: string): CodeFile {
  const absolute = safePath(checkout, path);
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE_BYTES) throw Error('File too large or unavailable');
    const bytes = readFileSync(fd);
    const content = bytes.toString('utf8');
    if (content.includes('\0') || !Buffer.from(content).equals(bytes)) throw Error('Only UTF-8 text is available');
    const version = digest(`${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}:${digest(content)}`);
    return { path, content, version, readOnly: path.startsWith('shared/') };
  } finally {
    closeSync(fd);
  }
}

export function readCodeProject(checkout: CodeCheckout): { projectId: string; files: CodeFile[] } {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(checkout.slug)) throw Error('Invalid project');
  const files: CodeFile[] = [];
  let size = 0;
  let visited = 0;
  const walk = (path: string) => {
    let absolute: string;
    try {
      absolute = pathInside(realpathSync(checkout.root), path);
      let current = realpathSync(checkout.root);
      for (const part of path.split('/')) {
        current = join(current, part);
        if (lstatSync(current).isSymbolicLink()) return;
      }
    } catch {
      return;
    }
    if (path.split('/').length > 20) throw Error('Project tree exceeds editor limits');
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++visited > 20_000) throw Error('Project tree exceeds editor limits');
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const next = `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile()) {
        let file: CodeFile;
        try {
          file = readCodeFile(checkout, next);
        } catch {
          continue;
        }
        size += Buffer.byteLength(file.content);
        if (files.length >= 2000 || size > 16_000_000) throw Error('Project exceeds editor limits');
        files.push(file);
      }
    }
  };
  walk(`games/${checkout.slug}`);
  walk('shared');
  return { projectId: codeProjectId(checkout), files };
}

export async function saveCodeFile(
  checkout: CodeCheckout,
  request: { projectId: string; path: string; version: string; content: string },
  isCurrent: () => boolean,
): Promise<{ status: 'saved'; file: CodeFile } | { status: 'conflict'; file?: CodeFile }> {
  return withCheckoutWriter(checkout.root, async () => {
    if (!isCurrent() || codeProjectId(checkout) !== request.projectId) return { status: 'conflict' };
    const absolute = safePath(checkout, request.path);
    if (request.path.startsWith('shared/')) throw Error('Creator Kit is read-only');
    if (Buffer.byteLength(request.content) > MAX_FILE_BYTES || request.content.includes('\0'))
      throw Error('Invalid text');
    const current = readCodeFile(checkout, request.path);
    if (current.version !== request.version) return { status: 'conflict', file: current };
    const temp = `${absolute}.play-${randomUUID()}`;
    try {
      writeFileSync(temp, request.content, { flag: 'wx', mode: lstatSync(absolute).mode & 0o777 });
      const latest = readCodeFile(checkout, request.path);
      if (!isCurrent() || latest.version !== request.version) return { status: 'conflict', file: latest };
      renameSync(temp, absolute);
      return { status: 'saved', file: readCodeFile(checkout, request.path) };
    } finally {
      rmSync(temp, { force: true });
    }
  });
}
