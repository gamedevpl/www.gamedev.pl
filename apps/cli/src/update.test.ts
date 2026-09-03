import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assetName, expectedHash, helperDest, updateCli } from './update.js';
import { CliError } from './exit-codes.js';

describe('updateCli', () => {
  it('ships one Node-script asset for every platform', () => {
    expect(assetName()).toBe('gamedev');
  });

  it('parses sha256sum lines', () => {
    expect(expectedHash('abc\n', 'nope')).toBeNull();
    const hash = 'a'.repeat(64);
    expect(expectedHash(`${hash}  gamedev\n`, 'gamedev')).toBe(hash);
  });

  it('writes the verified script and a git-remote helper copy', async () => {
    const bytes = Buffer.from('#!/usr/bin/env node\n');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dest = join(mkdtempSync(join(tmpdir(), 'gdpl-upd-')), 'nested', 'gamedev');
    const result = await updateCli({
      dest,
      version: '0.1.0',
      fetchImpl: async (url) => {
        if (String(url).endsWith('SHA256SUMS')) {
          return new Response(`${hash}  gamedev\n`, { status: 200 });
        }
        if (String(url).endsWith('/gamedev')) {
          return new Response(bytes, { status: 200 });
        }
        return new Response('missing', { status: 404 });
      },
    });
    expect(result).toEqual({ version: '0.1.0', asset: 'gamedev' });
    expect(readFileSync(dest)).toEqual(bytes);
    expect(readFileSync(helperDest(dest))).toEqual(bytes);
  });

  it('still installs the helper when --dest is not named gamedev', async () => {
    const bytes = Buffer.from('#!/usr/bin/env node\n');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dest = join(mkdtempSync(join(tmpdir(), 'gdpl-upd-')), 'custom-bin');
    await updateCli({
      dest,
      version: '0.1.0',
      fetchImpl: async (url) => {
        if (String(url).endsWith('SHA256SUMS')) return new Response(`${hash}  gamedev\n`, { status: 200 });
        if (String(url).endsWith('/gamedev')) return new Response(bytes, { status: 200 });
        return new Response('missing', { status: 404 });
      },
    });
    expect(readFileSync(helperDest(dest))).toEqual(bytes);
    expect(helperDest(dest)).toMatch(/git-remote-gamedev$/);
  });

  it('refuses a checksum mismatch', async () => {
    await expect(
      updateCli({
        dest: join(mkdtempSync(join(tmpdir(), 'gdpl-upd-')), 'gamedev'),
        version: '0.1.0',
        fetchImpl: async (url) => {
          if (String(url).endsWith('SHA256SUMS')) {
            return new Response(`${'b'.repeat(64)}  gamedev\n`, { status: 200 });
          }
          return new Response(Buffer.from('nope'), { status: 200 });
        },
      }),
    ).rejects.toBeInstanceOf(CliError);
  });
});
