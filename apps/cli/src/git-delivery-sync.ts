import { isRasterSourcePath } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';
import { checkoutGit, projectGitFiles, type GitLayout } from './git-checkout-layout.js';
import { readHistory, readHistoryTree } from './history-api.js';
import { historyTree } from './history-edit-tree.js';
import { fastImportScript, versionImportRef } from './git-history-import.js';
import { knownHistoryCommits } from './git-history-cache.js';
import { rememberGitDelivery } from './git-push-base.js';
import { bindGitDelivery } from './git-delivery-ref.js';
import type { TreeFile } from './checkout-sync.js';

export async function synchronizeGitDelivery(input: {
  api: ApiClient;
  cwd: string;
  slug: string;
  scope: string;
  layout: GitLayout;
  commit: string;
  version: string;
  pushed: TreeFile[];
}): Promise<{ version: string; files: TreeFile[] }> {
  const git = checkoutGit(input.cwd),
    versions = await readHistory(input.api, input.slug),
    index = versions.findIndex((row) => row.version === input.version);
  if (index < 0) throw Error('Accepted Git delivery is not yet available in platform history.');
  const tree = await readHistoryTree(input.api, input.slug, input.version);
  if (tree.slug !== input.slug || tree.version !== input.version)
    throw Error('Git delivery history identity mismatch.');
  const files = [...historyTree(tree)].map(([path, bytes]) => ({
    path,
    content: bytes.toString(isRasterSourcePath(path) ? 'base64' : 'utf8'),
  }));
  rememberGitDelivery({ ...input, files });
  const known = knownHistoryCommits(input.slug, input.cwd, input.scope);
  let parent: string | undefined,
    previousFiles: string[] = [];
  for (const row of versions.slice(index + 1).reverse()) {
    const cached = known.get(row.version);
    if (cached) parent = cached;
    else {
      const old = await readHistoryTree(input.api, input.slug, row.version);
      if (old.slug !== input.slug || old.version !== row.version) throw Error('Git history identity mismatch.');
      historyTree(old);
      git(
        ['fast-import', '--quiet'],
        fastImportScript({
          slug: input.slug,
          scope: input.scope,
          sourceRoot: input.layout.root,
          versions: [row],
          trees: new Map([[row.version, projectGitFiles(old.files, input.layout)]]),
          parent,
          preserveOutsideSources: true,
          parentSourceFiles: previousFiles,
        }),
      );
      parent = git(['rev-parse', versionImportRef(input.slug, row.version, input.scope)])
        .toString()
        .trim();
    }
    previousFiles = row.sourceFiles;
  }
  let mergeParents: string[] = [];
  if (parent) {
    try {
      git(['merge-base', '--is-ancestor', parent, input.commit]);
    } catch {
      mergeParents = [parent];
    }
  }
  bindGitDelivery({ ...input, files, mergeParents });
  return { version: input.version, files };
}
