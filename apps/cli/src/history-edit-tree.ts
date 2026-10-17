import { randomUUID } from 'node:crypto';
import {
  isDeliverablePath,
  isRasterSourcePath,
  type HistorySourceFile,
  type HistoryVersion,
  type VersionHistoryTree,
} from '@gamedevpl/contract';
import type { TreeFile } from './checkout-sync.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { withHistoryGit } from './history-git.js';
import { versionImportRef } from './git-history-import.js';

export type SourceTree = Map<string, Buffer>;
export function sourcePath(path: string): string {
  if (
    typeof path !== 'string' ||
    !isDeliverablePath(path) ||
    path.length > 512 ||
    path.includes('\\') ||
    path.includes(':') ||
    [...path].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    path.split('/').some((p) => !p || p === '.' || p === '..' || p.toLowerCase() === '.git' || /[. ]$/.test(p))
  )
    throw new CliError('Invalid history source path.', EXIT_REFUSED);
  return path;
}

function decode(content: string, base64: boolean): Buffer {
  if (typeof content !== 'string') throw new CliError('Invalid history source content.', EXIT_REFUSED);
  const bytes = Buffer.from(content, base64 ? 'base64' : 'utf8');
  if (base64 && bytes.toString('base64') !== content)
    throw new CliError('Invalid binary history source.', EXIT_REFUSED);
  return bytes;
}

export function validateTree(tree: SourceTree): SourceTree {
  let size = 0;
  const names = new Set<string>();
  for (const [path, bytes] of tree) {
    sourcePath(path);
    const folded = path.toLowerCase();
    if (names.has(folded)) throw new CliError('Case-colliding history source paths.', EXIT_REFUSED);
    names.add(folded);
    size += bytes.length;
    if (size > 32_000_000 || tree.size > 2000)
      throw new CliError('History sources exceed 32 MB or 2000 files.', EXIT_REFUSED);
  }
  for (const name of names) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++)
      if (names.has(parts.slice(0, i).join('/'))) throw new CliError('Overlapping history source paths.', EXIT_REFUSED);
  }
  return tree;
}

export function historyTree(tree: VersionHistoryTree): SourceTree {
  const result: SourceTree = new Map();
  for (const file of tree.files) {
    if (result.has(file.path) || (file.encoding !== undefined && !['utf8', 'base64'].includes(file.encoding)))
      throw new CliError('Invalid history source tree.', EXIT_REFUSED);
    result.set(sourcePath(file.path), decode(file.content, file.encoding === 'base64'));
  }
  if (
    !Array.isArray(tree.metadata.sourceFiles) ||
    new Set(tree.metadata.sourceFiles).size !== tree.metadata.sourceFiles.length ||
    result.size !== tree.metadata.sourceFiles.length ||
    tree.metadata.sourceFiles.some((p) => !result.has(p))
  )
    throw new CliError('Incomplete history source tree.', EXIT_REFUSED);
  return validateTree(result);
}

export function localTree(files: TreeFile[]): SourceTree {
  return validateTree(new Map(files.map((f) => [sourcePath(f.path), decode(f.content, isRasterSourcePath(f.path))])));
}

export function localBytes(path: string, bytes: Buffer, sourceRepository: boolean): Buffer {
  return isRasterSourcePath(path) && !sourceRepository ? Buffer.from(bytes.toString('base64')) : bytes;
}

export async function reverseVersion(
  slug: string,
  version: string,
  target: SourceTree,
  parent: SourceTree | undefined,
  current: SourceTree,
): Promise<SourceTree> {
  const working = `working-${randomUUID()}`,
    before = `parent-${randomUUID()}`;
  const snapshots = [
    ...(parent ? [[before, parent] as const] : []),
    [version, target] as const,
    [working, current] as const,
  ];
  const versions = snapshots.map(([name, files], i): HistoryVersion => ({
    version: name,
    createdAt: new Date(i * 1000).toISOString(),
    sourceFiles: [...files.keys()],
    jobId: 0,
    verdict: 'passed',
  }));
  const trees = new Map(
    snapshots.map(([name, files]) => [
      name,
      [...files].map(([path, bytes]): HistorySourceFile => ({
        path,
        content: bytes.toString('base64'),
        encoding: 'base64',
      })),
    ]),
  );
  return withHistoryGit({ slug, versions, trees }, (git) => {
    git(['checkout', '--quiet', '--detach', versionImportRef(slug, working)]);
    try {
      git([
        '-c',
        'user.name=gamedevpl',
        '-c',
        'user.email=cli@gamedev.pl',
        '-c',
        'core.hooksPath=/dev/null',
        'revert',
        '--no-commit',
        versionImportRef(slug, version),
      ]);
    } catch (error) {
      const conflicts = git(['diff', '--name-only', '--diff-filter=U', '-z']).split('\0').filter(Boolean);
      if (conflicts.length)
        throw new CliError(
          `Revert conflicts on ${conflicts.map((p) => p.replace(`games/${slug}/`, '')).join(', ')}. Local sources were not changed.`,
          EXIT_REFUSED,
        );
      throw error;
    }
    const prefix = `games/${slug}/`,
      result: SourceTree = new Map();
    for (const path of git(['ls-files', '-z']).split('\0').filter(Boolean)) {
      if (!path.startsWith(prefix)) throw new CliError('Unexpected reverted source path.', EXIT_REFUSED);
      result.set(sourcePath(path.slice(prefix.length)), git.bytes(['show', `:${path}`]));
    }
    return validateTree(result);
  });
}
