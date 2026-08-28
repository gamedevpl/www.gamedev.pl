import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assetName, expectedHash, helperDest, updateCli } from './update.js';
import { CliError } from './exit-codes.js';

describe('updateCli', () => {
  it('names the GitHub asset from platform and arch', () => {
    expect(assetName('linux', 'x64')).toBe('gamedev-linux-x64');
    expect(assetName('darwin', 'arm64')).toBe('gamedev-darwin-arm64');
    expect(assetName('win32', 'x64')).toBe('gamedev-windows-x64.exe');
  });

  it('parses sha256sum lines', () => {
    expect(expectedHash('abc\n', 'nope')).toBeNull();
    const hash = 'a'.repeat(64);
    expect(expectedHash(`${hash}  gamedev-linux-x64\n`, 'gamedev-linux-x64')).toBe(hash);
  });

  it('writes the verified binary and a git-remote helper copy', async () => {
    const bytes = Buffer.from('gamedev-binary');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dest = join(mkdtempSync(join(tmpdir(), 'gdpl-upd-')), 'gamedev');
    const result = await updateCli({
      dest,
      version: '0.1.0',
      platform: 'linux',
      arch: 'x64',
      fetchImpl: async (url) => {
        if (String(url).endsWith('SHA256SUMS')) {
          return new Response(`${hash}  gamedev-linux-x64\n`, { status: 200 });
        }
        if (String(url).endsWith('gamedev-linux-x64')) {
          return new Response(bytes, { status: 200 });
        }
        return new Response('missing', { status: 404 });
      },
    });
    expect(result).toEqual({ version: '0.1.0', asset: 'gamedev-linux-x64' });
    expect(readFileSync(dest)).toEqual(bytes);
    expect(readFileSync(helperDest(dest))).toEqual(bytes);
  });

  it('refuses a checksum mismatch', async () => {
    await expect(
      updateCli({
        dest: join(mkdtempSync(join(tmpdir(), 'gdpl-upd-')), 'gamedev'),
        version: '0.1.0',
        platform: 'linux',
        arch: 'x64',
        fetchImpl: async (url) => {
          if (String(url).endsWith('SHA256SUMS')) {
            return new Response(`${'b'.repeat(64)}  gamedev-linux-x64\n`, { status: 200 });
          }
          return new Response(Buffer.from('nope'), { status: 200 });
        },
      }),
    ).rejects.toBeInstanceOf(CliError);
  });
});
