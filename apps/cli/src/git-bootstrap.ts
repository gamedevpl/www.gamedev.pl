import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { checkoutGit } from './git-checkout-layout.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { kitPath } from './kit-install.js';

export function bootstrapGitBranch(root: string, branch: string, commit: string): void {
  const git = checkoutGit(root),
    index = resolve(root, git(['rev-parse', '--git-path', 'index']).toString().trim()),
    nonce = randomUUID(),
    temp = index + '.gamedev-' + nonce,
    lock = index + '.lock';
  kitPath(dirname(index), basename(index));
  let locked = false,
    created = false;
  try {
    checkoutGit(root, temp)(['read-tree', commit]);
    writeFileSync(lock, nonce, { flag: 'wx', mode: 0o600 });
    locked = true;
    if (git(['symbolic-ref', 'HEAD']).toString().trim() !== branch || git(['ls-files', '-z']).length)
      throw new CliError('Git branch or index changed during setup; retry after reviewing it.', EXIT_REFUSED);
    git(['update-ref', branch, commit, '0'.repeat(commit.length)]);
    created = true;
    renameSync(temp, index);
    created = false;
  } catch (error) {
    if (created) git(['update-ref', '-d', branch, commit]);
    throw error;
  } finally {
    rmSync(temp, { force: true });
    if (locked && existsSync(lock) && readFileSync(lock, 'utf8') === nonce) rmSync(lock);
  }
}
