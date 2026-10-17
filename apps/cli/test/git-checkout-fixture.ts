import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { historyFixture } from './history-edit-fixture.js';
import { initializeGitCheckout } from '../src/git-checkout.js';
import { checkoutGit } from '../src/git-checkout-layout.js';

export function gitFixture(project = false) {
  const f = historyFixture(project);
  rmSync(join(f.root, '.git'), { recursive: true });
  const bytes = checkoutGit(f.root),
    git = (...args: string[]) => bytes(args).toString().trim();
  const commit = (message: string) =>
    git(
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      message,
    );
  return { ...f, bytes, git, commit, setup: () => initializeGitCheckout({ api: f.api, root: f.root }) };
}
