import { afterEach, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitFixture } from '../test/git-checkout-fixture.js';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';
import { localGameFiles } from './checkout.js';
import { checkoutGit, remoteLayout, historyScope } from './git-checkout-layout.js';
import { bindGitDelivery } from './git-delivery-ref.js';
import { versionImportRef } from './git-history-import.js';
import { gitPushBase, rememberGitDelivery } from './git-push-base.js';

afterEach(cleanupHistoryFixtures);
it.each([false, true])(
  'projects canonical sources on the pushed commit without moving HEAD, source repository=%s',
  async (project) => {
    const f = gitFixture(project);
    await f.setup();
    writeFileSync(join(f.root, 'README.md'), 'repository context\n');
    f.git('add', '-f', 'README.md');
    f.commit('repository context');
    const commit = f.git('rev-parse', 'HEAD'),
      pushed = localGameFiles(f.root, 'probe');
    const layout = remoteLayout(checkoutGit(f.root), 'probe', 'origin'),
      scope = historyScope(f.api.origin, 'probe', layout);
    const files = pushed.map((file) =>
      file.path === 'game.ts'
        ? { ...file, content: sourceLines(2, 9) }
        : file.path === 'images/test.png'
          ? { ...file, content: Buffer.from([0, 255, 9]).toString('base64') }
          : file,
    );
    bindGitDelivery({ cwd: f.root, slug: 'probe', scope, layout, commit, version: 'v4', pushed, files });
    const ref = versionImportRef('probe', 'v4', scope);
    expect(f.git('rev-parse', `${ref}^`)).toBe(commit);
    expect(f.git('show', `${ref}:README.md`)).toBe('repository context');
    expect(f.bytes(['show', `${ref}:${f.prefix}/images/test.png`])).toEqual(
      project ? Buffer.from([0, 255, 9]) : Buffer.from(Buffer.from([0, 255, 9]).toString('base64')),
    );
    expect(f.git('rev-parse', 'HEAD')).toBe(commit);
    expect(f.git('status', '--porcelain', '--untracked-files=no')).toBe('');
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(2, 3));
    rememberGitDelivery({ cwd: f.root, slug: 'probe', scope, commit, version: 'v4', files });
    f.versions.unshift({ ...f.versions[0]!, version: 'v4', createdAt: '2026-10-04T00:00:00Z' });
    await expect(gitPushBase({ cwd: f.root, slug: 'probe', scope, commit, layout, api: f.api })).rejects.toThrow(
      'Platform history is ahead',
    );
    f.git('merge', '--ff-only', ref);
    expect(
      (await gitPushBase({ cwd: f.root, slug: 'probe', scope, commit: f.git('rev-parse', 'HEAD'), layout, api: f.api }))
        .version,
    ).toBe('v4');
  },
);
