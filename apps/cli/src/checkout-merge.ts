import { isRasterSourcePath } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';
import { hashContent, type BaseRecord, type TreeFile } from './checkout-sync.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { readHistoryTree } from './history-api.js';
import { historyTree, localTree, sourcePath } from './history-edit-tree.js';
import { sourceSpecSlug } from './source-project.js';
import { mergeLocalTrees } from './local-merge.js';

export async function mergeCheckout(input: {
  api: ApiClient;
  slug: string;
  base: BaseRecord | null;
  local: TreeFile[];
  remote: TreeFile[];
  sourceRepository: boolean;
}): Promise<ReturnType<typeof mergeLocalTrees>> {
  const { base } = input;
  if (!base || Array.isArray(base.files) || Object.values(base.files).some((hash) => typeof hash !== 'string'))
    throw new CliError('Cannot merge conflicting sources without a valid synchronization base.', EXIT_REFUSED);
  localTree(input.local);
  localTree(input.remote);
  if (base.version === 'undelivered' && !Object.keys(base.files).length)
    return mergeLocalTrees([], input.local, input.remote);
  const tree = await readHistoryTree(input.api, input.slug, base.version);
  if (tree.slug !== input.slug || tree.version !== base.version)
    throw new CliError('Conflicting sources have a mismatched historical base.', EXIT_REFUSED);
  const historical = historyTree(tree),
    original = new Map<string, string>();
  for (const [path, hash] of Object.entries(base.files)) {
    sourcePath(path);
    const bytes = historical.get(path),
      text = bytes?.toString(isRasterSourcePath(path) ? 'base64' : 'utf8');
    if (text === undefined || hashContent(text) !== hash)
      throw new CliError('Cannot merge conflicting sources: historical base hashes do not match.', EXIT_REFUSED);
    original.set(path, text);
  }
  const result = mergeLocalTrees(
    [...original].map(([path, content]) => ({ path, content })),
    input.local,
    input.remote,
  );
  if (
    input.sourceRepository &&
    sourceSpecSlug(result.files.find((file) => file.path === 'SPEC.md')?.content ?? '') !== input.slug &&
    !result.conflicts.some((c) => c.paths.includes('SPEC.md'))
  )
    throw new CliError('Merged SPEC.md would change or remove this game identity.', EXIT_REFUSED);
  return result;
}
