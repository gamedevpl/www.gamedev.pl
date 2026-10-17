import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isRasterSourcePath, type HistorySourceFile } from '@gamedevpl/contract';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export type GitLayout = { root: string; rasters: 'raw' | 'base64' };
export type CheckoutGit = (args: string[], input?: Buffer) => Buffer;
export function checkoutGit(cwd: string, indexFile?: string): CheckoutGit {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' });
  if (indexFile) env.GIT_INDEX_FILE = indexFile;
  return (args, input) => {
    const result = spawnSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null', ...args], {
      env,
      input,
      maxBuffer: 80 * 1024 * 1024,
    });
    if (result.status !== 0)
      throw new CliError(result.stderr?.toString().trim() || 'Git integration requires Git on PATH.', EXIT_REFUSED);
    return result.stdout;
  };
}
export function gitConfig(git: CheckoutGit, key: string): string | undefined {
  try {
    return git(['config', '--get', key]).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}
export function remoteLayout(git: CheckoutGit, slug: string, remote: string): GitLayout {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(remote)) throw new CliError('Invalid Git remote name.', EXIT_REFUSED);
  const root = gitConfig(git, `remote.${remote}.gamedevpl-root`) ?? `games/${slug}`;
  const rasters = gitConfig(git, `remote.${remote}.gamedevpl-rasters`) ?? 'raw';
  if (
    ![`games/${slug}`, 'src'].includes(root) ||
    !['raw', 'base64'].includes(rasters) ||
    (root === 'src' && rasters !== 'raw')
  )
    throw new CliError('Invalid gamedevpl Git layout.', EXIT_REFUSED);
  return { root, rasters: rasters as GitLayout['rasters'] };
}
export function historyScope(origin: string, slug: string, layout: GitLayout): string {
  const extra =
    layout.root === `games/${slug}` && layout.rasters === 'raw' ? '' : `\0${layout.root}\0${layout.rasters}`;
  return createHash('sha256')
    .update(origin + extra)
    .digest('hex')
    .slice(0, 16);
}
export function projectGitFiles(files: HistorySourceFile[], layout: GitLayout): HistorySourceFile[] {
  return files.map((file) =>
    layout.rasters === 'base64' && isRasterSourcePath(file.path) ? { ...file, encoding: 'utf8' } : file,
  );
}
