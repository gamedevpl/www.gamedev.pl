import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
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
export type CodeFile = { path: string; content: string; version: string; revision: string; readOnly: boolean };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const MAX_FILE_BYTES = 1_000_000;

export function codeProjectId(checkout: CodeCheckout): string {
  return digest(`${realpathSync(checkout.root)}\0${checkout.slug}`);
}

export function codeFileAllowed(checkout: CodeCheckout, path: string): boolean {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(checkout.slug)) throw Error('Invalid project');
  const projectPrefix = `games/${checkout.slug}/`;
  const own =
    path.startsWith(projectPrefix) &&
    isDeliverablePath(path.slice(projectPrefix.length)) &&
    !isRasterSourcePath(path.slice(projectPrefix.length));
  const kit = /^shared\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.ts$/.test(path);
  return own || kit;
}

function safePath(checkout: CodeCheckout, path: string): string {
  if (!codeFileAllowed(checkout, path)) throw Error('File outside this project');
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
    const stat = fstatSync(fd, { bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n || stat.size > BigInt(MAX_FILE_BYTES))
      throw Error('File too large or unavailable');
    const bytes = readFileSync(fd);
    const revision = codeFileRevision(stat);
    if (revision !== codeFileRevision(fstatSync(fd, { bigint: true }))) throw Error('File changed while reading');
    const content = bytes.toString('utf8');
    if (content.includes('\0') || !Buffer.from(content).equals(bytes)) throw Error('Only UTF-8 text is available');
    const version = digest(`${revision}:${digest(content)}`);
    return {
      path,
      content,
      version,
      revision,
      readOnly: path.startsWith('shared/'),
    };
  } finally {
    closeSync(fd);
  }
}

export function codeFileRevision(stat: {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}): string {
  return digest(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`);
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
