import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assetName,
  compareSemver,
  defaultInstallDest,
  expectedHash,
  helperDest,
  resolveUpdateVersion,
  runningBinaryPath,
  updateCli,
} from './update.js';
import { CliError } from './exit-codes.js';

describe('updateCli', () => {
  it('ships one Node-script asset for every platform', () => {
    expect(assetName()).toBe('gamedevpl');
  });

  it('parses sha256sum lines', () => {
    expect(expectedHash('abc\n', 'nope')).toBeNull();
    const hash = 'a'.repeat(64);
    expect(expectedHash(`${hash}  gamedevpl\n`, 'gamedevpl')).toBe(hash);
  });

  it('installs git-remote-gamedevpl beside the CLI binary', () => {
    expect(helperDest('/home/me/.local/bin/gamedevpl')).toBe('/home/me/.local/bin/git-remote-gamedevpl');
    expect(helperDest('/home/me/.local/bin/git-remote-gamedevpl')).toBe('/home/me/.local/bin/git-remote-gamedevpl');
    expect(helperDest('/tmp/gamedevpl.exe')).toBe('/tmp/git-remote-gamedevpl.exe');
    expect(helperDest('/tmp/GAMEDEVPL.EXE')).toBe('/tmp/git-remote-gamedevpl.exe');
  });

  it('writes the verified script and a git-remote helper copy', async () => {
    const bytes = Buffer.from('#!/usr/bin/env node\n');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dest = join(mkdtempSync(join(tmpdir(), 'gdpl-upd-')), 'nested', 'gamedevpl');
    const result = await updateCli({
      dest,
      version: '0.1.0',
      fetchImpl: async (url) => {
        if (String(url).endsWith('SHA256SUMS')) {
          return new Response(`${hash}  gamedevpl\n`, { status: 200 });
        }
        if (String(url).endsWith('/gamedevpl')) {
          return new Response(bytes, { status: 200 });
        }
        return new Response('missing', { status: 404 });
      },
    });
    expect(result).toEqual({ version: '0.1.0', asset: 'gamedevpl' });
    expect(readFileSync(dest)).toEqual(bytes);
    expect(readFileSync(helperDest(dest))).toEqual(bytes);
  });

  it('still installs the helper when --dest is not named gamedevpl', async () => {
    const bytes = Buffer.from('#!/usr/bin/env node\n');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dest = join(mkdtempSync(join(tmpdir(), 'gdpl-upd-')), 'custom-bin');
    await updateCli({
      dest,
      version: '0.1.0',
      fetchImpl: async (url) => {
        if (String(url).endsWith('SHA256SUMS')) return new Response(`${hash}  gamedevpl\n`, { status: 200 });
        if (String(url).endsWith('/gamedevpl')) return new Response(bytes, { status: 200 });
        return new Response('missing', { status: 404 });
      },
    });
    expect(readFileSync(helperDest(dest))).toEqual(bytes);
    expect(helperDest(dest)).toMatch(/git-remote-gamedevpl$/);
  });

  it('refuses a checksum mismatch', async () => {
    await expect(
      updateCli({
        dest: join(mkdtempSync(join(tmpdir(), 'gdpl-upd-')), 'gamedevpl'),
        version: '0.1.0',
        fetchImpl: async (url) => {
          if (String(url).endsWith('SHA256SUMS')) {
            return new Response(`${'b'.repeat(64)}  gamedevpl\n`, { status: 200 });
          }
          return new Response(Buffer.from('nope'), { status: 200 });
        },
      }),
    ).rejects.toBeInstanceOf(CliError);
  });

  it('compares semver numerically across segments', () => {
    expect(compareSemver('0.9.0', '0.10.0')).toBeLessThan(0);
    expect(compareSemver('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareSemver('0.10.0', '0.10.0')).toBe(0);
    expect(compareSemver('0.10.1', '0.10.0')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '0.10.0')).toBeGreaterThan(0);
  });

  it('resolves the newest semver release even when GitHub returns tags out of semver order', async () => {
    const mockReleases = [
      { tag_name: 'cli-v0.9.0' },
      { tag_name: 'cli-v0.8.0' },
      { tag_name: 'cli-v0.10.0' },
      { tag_name: 'cli-v0.7.0' },
      { tag_name: 'untagged-build' },
    ];
    const version = await resolveUpdateVersion({
      fetchImpl: async () => new Response(JSON.stringify(mockReleases), { status: 200 }),
    });
    expect(version).toBe('0.10.0');
  });

  describe('runningBinaryPath', () => {
    it('recognizes installed gamedevpl and companion git-remote helper paths', () => {
      expect(runningBinaryPath('/usr/local/bin/gamedevpl')).toBe('/usr/local/bin/gamedevpl');
      expect(runningBinaryPath('/usr/local/bin/git-remote-gamedevpl')).toBe('/usr/local/bin/gamedevpl');
      expect(runningBinaryPath('/opt/homebrew/bin/gamedevpl')).toBe('/opt/homebrew/bin/gamedevpl');
    });

    it('preserves Windows executable extensions', () => {
      expect(runningBinaryPath('C:\\bin\\gamedevpl.exe')).toBe('C:\\bin\\gamedevpl.exe');
      expect(runningBinaryPath('C:\\bin\\git-remote-gamedevpl.exe')).toBe('C:\\bin\\gamedevpl.exe');
    });

    it('rejects node_modules development paths and non-cli filenames', () => {
      expect(runningBinaryPath('/repo/apps/cli/src/main.ts')).toBeNull();
      expect(runningBinaryPath('/repo/apps/cli/dist/main.js')).toBeNull();
      expect(runningBinaryPath('/repo/node_modules/vitest/vitest.mjs')).toBeNull();
      expect(runningBinaryPath('/repo/node_modules/.bin/gamedevpl')).toBeNull();
      expect(runningBinaryPath(undefined)).toBeNull();
    });
  });

  describe('defaultInstallDest', () => {
    it('defaults to ~/.local/bin/gamedevpl when outside installed binary', () => {
      expect(defaultInstallDest({ env: {}, currentPath: '/repo/apps/cli/src/main.ts' })).toMatch(
        /[/\\]\.local[/\\]bin[/\\]gamedevpl$/,
      );
    });

    it('honors GAMEDEV_BIN_DIR when set', () => {
      expect(defaultInstallDest({ env: { GAMEDEV_BIN_DIR: '/custom/bin' }, currentPath: '/repo/main.ts' })).toBe(
        '/custom/bin/gamedevpl',
      );
      expect(
        defaultInstallDest({
          env: { GAMEDEV_BIN_DIR: 'C:\\custom\\bin' },
          currentPath: 'C:\\other\\gamedevpl.exe',
        }),
      ).toBe('C:\\custom\\bin\\gamedevpl.exe');
    });

    it('preserves the active running binary installation path', () => {
      expect(defaultInstallDest({ env: {}, currentPath: '/opt/bin/gamedevpl' })).toBe('/opt/bin/gamedevpl');
      expect(defaultInstallDest({ env: {}, currentPath: '/opt/bin/git-remote-gamedevpl' })).toBe(
        '/opt/bin/gamedevpl',
      );
      expect(defaultInstallDest({ env: {}, currentPath: 'C:\\tools\\gamedevpl.exe' })).toBe(
        'C:\\tools\\gamedevpl.exe',
      );
    });
  });
});
