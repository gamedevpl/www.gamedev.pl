import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { historyFixture } from './history-edit-fixture.js';
import { initializeGitCheckout } from '../src/git-checkout.js';
import { checkoutGit } from '../src/git-checkout-layout.js';
import { isRasterSourcePath } from '@gamedevpl/contract';
import type { TreeFile } from '../src/checkout-sync.js';

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
  const deliver = (version: string, files: TreeFile[]) => {
    f.trees[version] = files.map((file) =>
      isRasterSourcePath(file.path) ? { ...file, encoding: 'base64' } : { ...file },
    );
    const createdAt = new Date(Date.parse(f.versions[0]?.createdAt ?? '2026-10-01T00:00:00Z') + 1000).toISOString();
    f.versions.unshift({
      ...f.versions[0],
      version,
      createdAt,
      sourceFiles: files.map((file) => file.path),
      jobId: 0,
      verdict: 'passed',
    });
    return { kind: 'delivered' as const, version, files, staged: [], ignored: [] };
  };
  return { ...f, bytes, git, commit, deliver, setup: () => initializeGitCheckout({ api: f.api, root: f.root }) };
}
