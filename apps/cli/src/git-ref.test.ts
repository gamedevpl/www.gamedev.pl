import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { materializePushCheckout } from './git-ref.js';
import { writeBase, writeGameFiles } from './checkout.js';

const SLUG = 'ghost-roads';

function git(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || args.join(' '));
}

function dirtyRepo(): string {
  const dest = mkdtempSync(join(tmpdir(), 'gdpl-git-'));
  git(dest, ['init']);
  git(dest, ['config', 'user.email', 'cli@test']);
  git(dest, ['config', 'user.name', 'cli']);
  git(dest, ['config', 'commit.gpgsign', 'false']);
  writeGameFiles(dest, SLUG, [{ path: 'game.ts', content: 'COMMITTED-B' }]);
  writeFileSync(join(dest, '.gamedev-slug'), SLUG);
  writeBase(dest, 'v1', [{ path: 'game.ts', content: 'COMMITTED-B' }]);
  git(dest, ['add', '-A']);
  git(dest, ['commit', '-m', 'b']);
  writeFileSync(join(dest, 'games', SLUG, 'game.ts'), 'UNCOMMITTED-C');
  return dest;
}

describe('materializePushCheckout', () => {
  it('archives the src commit and leaves the working tree alone', () => {
    const repo = dirtyRepo();
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-push-'));
    materializePushCheckout({ repo, srcRef: 'HEAD', slug: SLUG, cwd: repo, dest });
    expect(readFileSync(join(dest, 'games', SLUG, 'game.ts'), 'utf8')).toBe('COMMITTED-B');
    expect(readFileSync(join(repo, 'games', SLUG, 'game.ts'), 'utf8')).toBe('UNCOMMITTED-C');
    expect(readFileSync(join(dest, '.gamedev-slug'), 'utf8').trim()).toBe(SLUG);
    expect(readFileSync(join(dest, '.gamedev-base.json'), 'utf8')).toContain('v1');
  });

  it('copies package.json, tools, and kit so the src commit can typecheck', () => {
    const repo = dirtyRepo();
    writeFileSync(join(repo, 'package.json'), '{"scripts":{"typecheck":"node -e process.exit(0)"}}\n');
    mkdirSync(join(repo, 'tools'));
    writeFileSync(join(repo, 'tools', 'check.mjs'), 'export {}\n');
    mkdirSync(join(repo, 'shared'));
    writeFileSync(join(repo, 'shared', 'kit.ts'), 'export const kit = 1;\n');
    mkdirSync(join(repo, 'node_modules'));
    writeFileSync(join(repo, 'node_modules', 'marker'), 'kit\n');
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-push-'));
    materializePushCheckout({ repo, srcRef: 'HEAD', slug: SLUG, cwd: repo, dest });
    expect(readFileSync(join(dest, 'package.json'), 'utf8')).toContain('typecheck');
    expect(readFileSync(join(dest, 'tools', 'check.mjs'), 'utf8')).toContain('export');
    expect(readFileSync(join(dest, 'shared', 'kit.ts'), 'utf8')).toContain('kit');
    expect(readFileSync(join(dest, 'node_modules', 'marker'), 'utf8')).toBe('kit\n');
    expect(readFileSync(join(dest, 'games', SLUG, 'game.ts'), 'utf8')).toBe('COMMITTED-B');
    expect(existsSync(join(dest, '.git'))).toBe(false);
  });

  it('refuses a missing games tree on the source ref', () => {
    const repo = mkdtempSync(join(tmpdir(), 'gdpl-empty-'));
    git(repo, ['init']);
    git(repo, ['config', 'user.email', 'cli@test']);
    git(repo, ['config', 'user.name', 'cli']);
    git(repo, ['config', 'commit.gpgsign', 'false']);
    mkdirSync(join(repo, 'games', SLUG), { recursive: true });
    writeFileSync(join(repo, 'games', SLUG, 'game.ts'), 'A');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'a']);
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-push-'));
    expect(() => materializePushCheckout({ repo, srcRef: 'HEAD', slug: 'other-game', cwd: repo, dest })).toThrow(
      /other-game|did not match|pathspec/i,
    );
  });
});
