import { isRasterSourcePath } from '@gamedevpl/contract';
import { checkoutGit, projectGitFiles, type GitLayout } from './git-checkout-layout.js';
import { hashesOf, type TreeFile } from './checkout-sync.js';
import { fastImportScript, versionImportRef } from './git-history-import.js';

export function bindGitDelivery(input: {
  cwd: string;
  slug: string;
  scope: string;
  commit: string;
  version: string;
  files: TreeFile[];
  pushed: TreeFile[];
  layout: GitLayout;
}): void {
  const git = checkoutGit(input.cwd),
    before = hashesOf(input.pushed),
    after = hashesOf(input.files);
  const same =
    Object.keys(before).length === Object.keys(after).length &&
    Object.entries(before).every(([path, hash]) => after[path] === hash);
  if (same) git(['update-ref', versionImportRef(input.slug, input.version, input.scope), input.commit]);
  else
    git(
      ['fast-import', '--quiet'],
      fastImportScript({
        slug: input.slug,
        scope: input.scope,
        parent: input.commit,
        sourceRoot: input.layout.root,
        preserveOutsideSources: true,
        parentSourceFiles: input.pushed.map((file) => file.path),
        versions: [{ version: input.version, createdAt: new Date().toISOString() }],
        trees: new Map([
          [
            input.version,
            projectGitFiles(
              input.files.map((file) => ({
                ...file,
                encoding: isRasterSourcePath(file.path) ? ('base64' as const) : ('utf8' as const),
              })),
              input.layout,
            ),
          ],
        ]),
      }),
    );
}
