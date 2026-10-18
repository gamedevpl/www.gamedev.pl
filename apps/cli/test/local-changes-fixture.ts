import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { historyFixture, sourceLines } from './history-edit-fixture.js';
import { stashCommand } from '../src/local-stash.js';
import { resolveCommand } from '../src/local-change-command.js';
import { pullGame } from '../src/checkout.js';

export function localChangesFixture(project = false, git = false) {
  const f = historyFixture(project);
  if (!git) rmSync(join(f.root, '.git'), { recursive: true });
  const stash = async (args: string[] = [], flags: Record<string, string | boolean> = {}) =>
    stashCommand({ api: f.api, cwd: f.root, args, flags });
  const resolve = async (args: string[] = [], flags: Record<string, string | boolean> = {}) =>
    resolveCommand({ api: f.api, cwd: f.root, args, flags, write: () => {} });
  const advance = (content = sourceLines(8, 3)) => {
    f.trees.v4 = f.trees.v3!.map((file) => (file.path === 'game.ts' ? { ...file, content } : { ...file }));
    f.versions.unshift({
      ...f.versions[0]!,
      version: 'v4',
      createdAt: '2026-10-04T00:00:00Z',
      sourceFiles: f.trees.v4.map((file) => file.path),
    });
  };
  const draft = (content = sourceLines(9, 3)) => writeFileSync(join(f.game, 'game.ts'), content);
  const pull = () => pullGame({ api: f.api, slug: 'probe', dest: f.root });
  return { ...f, stash, resolve, advance, draft, pull };
}
