import { readFileSync } from 'node:fs';
import { isRasterSourcePath } from '@gamedevpl/contract';
import { findCheckout, localGameFiles } from './checkout.js';
import { hashContent, readBase, type TreeFile } from './checkout-sync.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { readHistoryTree } from './history-api.js';
import { historyIdentity, prepareSources, sourceSnapshot, type SourceSnapshot } from './history-edit-files.js';
import { historyTree, localBytes, localTree, sourcePath } from './history-edit-tree.js';
import { gameSourcePath, sourceProject, sourceSpecSlug } from './source-project.js';
import { kitPath } from './kit-install.js';
import { createIgnoreMatcher } from './ignore.js';
import type { ApiClient } from './api.js';

export function localWorkspace(cwd: string) {
  const here = findCheckout(cwd);
  if (!here) throw new CliError('Run this command inside a game checkout.', EXIT_INPUT);
  const source = gameSourcePath(here.root, here.slug),
    project = Boolean(sourceProject(here.root));
  const base = readBase(here.root);
  if (!base || Array.isArray(base.files) || Object.values(base.files).some((hash) => !/^[a-f0-9]{64}$/.test(hash)))
    throw new CliError('A valid synchronization base is required. Review gamedevpl status first.', EXIT_REFUSED);
  Object.keys(base.files).forEach(sourcePath);
  const identity = historyIdentity(here.root),
    before = sourceSnapshot(kitPath(here.root, source)),
    files = localGameFiles(here.root, here.slug);
  for (const file of files) {
    const bytes = before.files.get(file.path)?.bytes;
    if (bytes?.toString(project && isRasterSourcePath(file.path) ? 'base64' : 'utf8') !== file.content)
      throw new CliError('Sources changed while capturing local changes. Retry.', EXIT_REFUSED);
  }
  if (historyIdentity(here.root) !== identity || sourceSnapshot(kitPath(here.root, source)).digest !== before.digest)
    throw new CliError('Sources or metadata changed while capturing local changes. Retry.', EXIT_REFUSED);
  return {
    ...here,
    source,
    project,
    base,
    baseText: readFileSync(kitPath(here.root, '.gamedev-base.json'), 'utf8'),
    identity,
    context: historyIdentity(here.root, true),
    before,
    files,
  };
}
export type LocalWorkspace = ReturnType<typeof localWorkspace>;
export async function workspaceBase(api: ApiClient, ws: LocalWorkspace): Promise<TreeFile[]> {
  if (ws.base.version === 'undelivered' && !Object.keys(ws.base.files).length) return [];
  const tree = await readHistoryTree(api, ws.slug, ws.base.version);
  if (tree.slug !== ws.slug || tree.version !== ws.base.version)
    throw new CliError('Mismatched stash base.', EXIT_REFUSED);
  const all = historyTree(tree),
    files: TreeFile[] = [];
  for (const [path, hash] of Object.entries(ws.base.files)) {
    const bytes = all.get(path),
      content = bytes?.toString(isRasterSourcePath(path) ? 'base64' : 'utf8');
    if (content === undefined || hashContent(content) !== hash)
      throw new CliError('Historical sources do not match the synchronization base.', EXIT_REFUSED);
    files.push({ path, content });
  }
  return files;
}
export function prepareLocalSources(
  ws: Pick<LocalWorkspace, 'root' | 'slug' | 'source' | 'project'>,
  before: SourceSnapshot,
  managed: string[],
  files: TreeFile[],
) {
  const tree = localTree(files),
    matcher = createIgnoreMatcher(ws.root),
    paths = new Set(managed);
  if (ws.project && sourceSpecSlug(tree.get('SPEC.md')?.toString('utf8') ?? '') !== ws.slug)
    throw new CliError('Resolved SPEC.md must retain this game’s identity.', EXIT_REFUSED);
  for (const path of tree.keys())
    if (!paths.has(path) && matcher.ignored(`${ws.source}/${path}`, false))
      throw new CliError(`Unignore the incoming source before applying: ${path}`, EXIT_REFUSED);
  return prepareSources(
    before,
    paths,
    new Map([...tree].map(([path, bytes]) => [path, localBytes(path, bytes, ws.project)])),
  );
}
