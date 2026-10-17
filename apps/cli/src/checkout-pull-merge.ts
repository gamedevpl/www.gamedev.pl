import type { ApiClient } from './api.js';
import { isRasterSourcePath } from '@gamedevpl/contract';
import { readBase, type TreeFile } from './checkout-sync.js';
import { mergeCheckout } from './checkout-merge.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { historyIdentity, sourceSnapshot } from './history-edit-files.js';
import { gameSourceRoot, sourceProject } from './source-project.js';
import { cliUsage } from './bin-name.js';
import { sanitizePath } from './ansi.js';

export async function preparePullMerge(input: {
  api: ApiClient;
  slug: string;
  dest: string;
  version: string;
  local: TreeFile[];
  remote: TreeFile[];
  conflicts: string[];
}) {
  const root = gameSourceRoot(input.dest, input.slug),
    snapshot = sourceSnapshot(root),
    identity = historyIdentity(input.dest),
    sourceRepository = Boolean(sourceProject(input.dest));
  for (const file of input.local) {
    const bytes = snapshot.files.get(file.path)?.bytes;
    const content =
      sourceRepository && isRasterSourcePath(file.path) ? bytes?.toString('base64') : bytes?.toString('utf8');
    if (content !== file.content)
      throw new CliError('Sources changed while preparing pull. Retry after reviewing local edits.', EXIT_REFUSED);
  }
  const result = await mergeCheckout({ ...input, base: readBase(input.dest), sourceRepository }).catch(
    (error: unknown) => {
      if (!(error instanceof CliError)) throw error;
      throw new CliError(
        `Cannot merge conflict on ${input.conflicts.map(sanitizePath).join(', ')}: ${error.message}`,
        error.exitCode,
        cliUsage('diff'),
      );
    },
  );
  const latest = await input.api.request<{ versions: { version: string }[] }>(
    'GET',
    `/api/me/studio/games/${input.slug}/versions`,
  );
  if (latest.versions[0]?.version !== input.version)
    throw new CliError('The platform changed during pull. Local files were not changed; retry pull.', EXIT_REFUSED);
  if (sourceSnapshot(root).digest !== snapshot.digest || historyIdentity(input.dest) !== identity)
    throw new CliError(
      'Sources or checkout metadata changed during pull. Local edits were preserved; retry.',
      EXIT_REFUSED,
    );
  return result;
}
