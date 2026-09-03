import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assetName, expectedHash, helperDest, updateCli } from './update.js';
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
});
