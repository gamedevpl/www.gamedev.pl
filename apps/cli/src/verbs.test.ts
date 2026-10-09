import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { dispatchReadVerb } from './verbs.js';
import { EXIT_GREEN } from './exit-codes.js';
import { CLI_VERSION } from './update.js';

afterEach(() => vi.unstubAllGlobals());

function out() {
  const stdout = new PassThrough();
  let text = '';
  stdout.on('data', (chunk: Buffer) => {
    text += chunk.toString();
  });
  return {
    stdout: stdout as unknown as NodeJS.WriteStream,
    read: () => text,
  };
}

describe('dispatchReadVerb', () => {
  it.each([false, true])('prints installed changes as text or a single JSON object (json=%s)', async (json) => {
    const io = out();
    const api = createApi({ origin: 'https://www.gamedev.pl', store: memoryStore(null) });
    const bytes = Buffer.from('#!/usr/bin/env node\n');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dest = join(mkdtempSync(join(tmpdir(), 'gdpl-update-notes-')), 'gamedevpl');
    vi.stubGlobal('fetch', async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.endsWith('SHA256SUMS')) return new Response(`${hash}  gamedevpl\n`);
      if (path.endsWith('/gamedevpl')) return new Response(bytes);
      if (path.endsWith('CHANGELOG.md')) return new Response('## 9.0.0 — 2026-10-10\n### Fixed\n- Repair details');
      throw new Error(`Unexpected URL ${path}`);
    });
    expect(await dispatchReadVerb({ verb: 'update', args: [], flags: { version: '9.0.0', dest, json }, api, io })).toBe(
      EXIT_GREEN,
    );
    expect(readFileSync(dest)).toEqual(bytes);
    if (json) {
      const data = JSON.parse(io.read());
      expect(data).toMatchObject({
        version: '9.0.0',
        asset: 'gamedevpl',
        releaseNotes: { previousVersion: CLI_VERSION, status: 'available' },
      });
      expect(data.releaseNotes.releases[0].changes[0].text).toBe('Repair details');
    } else {
      expect(io.read()).toContain(`updated gamedevpl ${CLI_VERSION} -> 9.0.0`);
      expect(io.read()).toContain('Fixed: Repair details');
    }
  });

  it('keeps a successful install green when release notes fail', async () => {
    const io = out();
    const api = createApi({ origin: 'https://www.gamedev.pl', store: memoryStore(null) });
    const bytes = Buffer.from('#!/usr/bin/env node\n');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dest = join(mkdtempSync(join(tmpdir(), 'gdpl-update-offline-')), 'gamedevpl');
    vi.stubGlobal('fetch', async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.endsWith('SHA256SUMS')) return new Response(`${hash}  gamedevpl\n`);
      if (path.endsWith('/gamedevpl')) return new Response(bytes);
      throw new Error('offline');
    });
    expect(
      await dispatchReadVerb({
        verb: 'update',
        args: [],
        flags: { version: '9.0.0', dest },
        api,
        io,
        runningVersion: CLI_VERSION,
      }),
    ).toBe(EXIT_GREEN);
    expect(readFileSync(dest)).toEqual(bytes);
    expect(io.read()).toContain('Release notes unavailable. Changelog:');
    expect(io.read()).toContain('This session is still running');
    expect(io.read()).toContain('Use /exit');
  });

  it('lists games from /api/submissions/mine', async () => {
    const io = out();
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () =>
        new Response(JSON.stringify({ submissions: [{ slug: 'ghost-roads', title: 'Ghost' }] }), { status: 200 }),
    });
    expect(await dispatchReadVerb({ verb: 'games', args: [], flags: {}, api, io })).toBe(EXIT_GREEN);
    expect(io.read()).toContain('ghost-roads');
  });

  it('reads builder from owner studio + submission status', async () => {
    const io = out();
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        seen.push(String(url));
        if (String(url).includes('/api/me/studio')) {
          return new Response(JSON.stringify({ games: [{ slug: 'sky-dodge', token: 'tok-1' }] }), { status: 200 });
        }
        if (String(url).endsWith('/api/submissions/tok-1')) {
          return new Response(JSON.stringify({ status: 'building', builder: 'self' }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
      },
    });
    expect(await dispatchReadVerb({ verb: 'builder', args: ['sky-dodge'], flags: {}, api, io })).toBe(EXIT_GREEN);
    expect(io.read()).toContain('self');
    expect(seen.some((url) => url.includes('/api/me/studio?game=sky-dodge'))).toBe(true);
    expect(seen.some((url) => url.endsWith('/api/submissions/tok-1'))).toBe(true);
    expect(seen.some((url) => url.includes('/connect'))).toBe(false);
  });

  it('prints a play URL for share', async () => {
    const io = out();
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => new Response('{}', { status: 200 }),
    });
    expect(await dispatchReadVerb({ verb: 'share', args: ['sky-dodge'], flags: {}, api, io })).toBe(EXIT_GREEN);
    expect(io.read()).toContain('/play/sky-dodge');
  });

  it('prints quota as a sentence, not raw JSON', async () => {
    const io = out();
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => new Response(JSON.stringify({ submissions: { used: 1, limit: 5 } }), { status: 200 }),
    });
    expect(await dispatchReadVerb({ verb: 'quota', args: [], flags: {}, api, io })).toBe(EXIT_GREEN);
    expect(io.read().trim()).toBe('1 of 5 submissions today');
  });
});
