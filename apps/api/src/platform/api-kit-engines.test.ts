import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiKitEngines } from '../../scripts/api-kit-engines.js';

afterEach(() => vi.unstubAllEnvs());

describe('shared-only API engine fetch', () => {
  it('loads exact refs, excludes game blobs and ignores ambient checkout filters', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'api-kit-engine-test-'));
    const source = path.join(root, 'source');
    const destination = path.join(root, 'destination');
    const remote = path.join(root, 'remote.git');
    await mkdir(source);
    await mkdir(destination);
    const git = (args: string[], cwd = source) =>
      execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      }).trim();
    try {
      git(['init', '--quiet']);
      await mkdir(path.join(source, 'shared'));
      await mkdir(path.join(source, 'games'));
      await writeFile(path.join(source, 'shared/value.ts'), 'export const value=1;');
      await writeFile(path.join(source, 'shared/hidden.ts'), 'export const hidden=3;');
      await writeFile(path.join(source, 'shared/formatted.ts'), 'export const literal="$Format:%H$";');
      await writeFile(
        path.join(source, 'shared/.gitattributes'),
        'hidden.ts export-ignore\nformatted.ts export-subst\n',
      );
      await writeFile(path.join(source, 'games/private.bin'), 'private-game-media'.repeat(100_000));
      await writeFile(path.join(source, '.gitattributes'), 'shared/value.ts filter=fixture\n');
      git(['add', '.']);
      const commit = () =>
        git([
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.com',
          '-c',
          'core.hooksPath=/dev/null',
          'commit',
          '--quiet',
          '-m',
          'Fixture',
        ]);
      commit();
      const first = git(['rev-parse', 'HEAD']);
      const privateBlob = git(['rev-parse', 'HEAD:games/private.bin']);
      await writeFile(path.join(source, 'shared/value.ts'), 'export const value=2;');
      git(['add', '.']);
      commit();
      const second = git(['rev-parse', 'HEAD']);
      git(['clone', '--quiet', '--bare', source, remote]);
      git(['config', 'uploadpack.allowFilter', 'true'], remote);
      const globalConfig = path.join(root, 'global-config');
      const canary = path.join(root, 'filter-executed');
      await writeFile(globalConfig, `[filter "fixture"]\nsmudge = touch ${canary}; cat\n`);
      vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig);
      const engine = apiKitEngines({
        directory: destination,
        repoUrl: new URL(`file://${remote}`).href,
        refs: [first, second],
      });
      const original = await engine(first);
      expect(Buffer.from(original['shared/value.ts'], 'base64').toString()).toBe('export const value=1;');
      expect(Buffer.from(original['shared/hidden.ts'], 'base64').toString()).toBe('export const hidden=3;');
      expect(Buffer.from(original['shared/formatted.ts'], 'base64').toString()).toBe(
        'export const literal="$Format:%H$";',
      );
      expect(Buffer.from((await engine(second))['shared/value.ts'], 'base64').toString()).toBe('export const value=2;');
      await expect(readFile(canary)).rejects.toThrow();
      const localObjects = git(['cat-file', '--batch-all-objects', '--batch-check=%(objectname)'], destination);
      expect(localObjects.split('\n')).not.toContain(privateBlob);
      await expect(engine('a'.repeat(40))).rejects.toThrow(/window/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('refuses mutable refs before fetching', () => {
    expect(() => apiKitEngines({ directory: '/unused', repoUrl: 'file:///unused', refs: ['main'] })).toThrow(
      /immutable/,
    );
  });
});
