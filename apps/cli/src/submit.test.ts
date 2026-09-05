import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { memoryStore } from './keychain.js';
import { submitGame } from './submit.js';
import { CliError, EXIT_RED, EXIT_REFUSED } from './exit-codes.js';

const SLUG = 'ghost-roads';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function checkout(files: Array<{ path: string; content: string }>, version = 'v1'): string {
  const dest = mkdtempSync(join(tmpdir(), 'gdpl-sub-'));
  writeGameFiles(dest, SLUG, files);
  writeBase(dest, version, files);
  writeFileSync(join(dest, '.gamedev-slug'), SLUG);
  return dest;
}

describe('submitGame', () => {
  it('stages local-only edits and delivers without --force', async () => {
    const dest = checkout([{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, 'games', SLUG, 'game.ts'), 'B');
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        const path = String(url);
        seen.push(`${init?.method ?? 'GET'} ${path}`);
        if (path.endsWith('/versions') && !path.includes('/tree')) {
          return json({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] });
        }
        if (path.includes('/tree')) return json({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] });
        if (path.endsWith('/sources/stage') && init?.method === 'PUT') {
          const body = JSON.parse(String(init?.body ?? '{}')) as { path: string; content: string };
          expect(body).toEqual({ path: 'game.ts', content: 'B' });
          return json({ accepted: true });
        }
        if (path.endsWith('/sources/deliver')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { mode: string; attestation: boolean };
          expect(body).toEqual({ mode: 'preview', attestation: true });
          return json({ accepted: true, version: 'v2', mode: 'preview', gateStarted: true, buildId: 'b1' });
        }
        return json({}, 404);
      },
    });
    const result = await submitGame({
      api,
      slug: SLUG,
      dest,
      run: () => ({ status: 0, stderr: '' }),
    });
    expect(result.kind).toBe('delivered');
    if (result.kind === 'delivered') {
      expect(result.gateStarted).toBe(true);
      expect(result.staged).toEqual(['game.ts']);
      expect(result.mode).toBe('preview');
    }
    expect(seen.some((row) => row.startsWith('PUT ') && row.endsWith('/sources/stage'))).toBe(true);
    expect(seen.some((row) => row.startsWith('POST ') && row.endsWith('/sources/deliver'))).toBe(true);
  });

  it('does not upload when the local ladder is red', async () => {
    const dest = checkout([{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, 'games', SLUG, 'game.ts'), 'B');
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        seen.push(`${init?.method ?? 'GET'} ${String(url)}`);
        if (String(url).endsWith('/versions')) {
          return json({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] });
        }
        if (String(url).includes('/tree')) return json({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] });
        return json({}, 404);
      },
    });
    await expect(
      submitGame({ api, slug: SLUG, dest, run: () => ({ status: 1, stderr: 'typecheck failed' }) }),
    ).rejects.toMatchObject({ exitCode: EXIT_RED, message: expect.stringMatching(/typecheck/) });
    expect(seen.some((row) => row.includes('/sources/'))).toBe(false);
  });

  it('refuses a conflict without overwriting local files', async () => {
    const dest = checkout([{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, 'games', SLUG, 'game.ts'), 'B');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return json({ versions: [{ version: 'v2', createdAt: '2026-09-02', sourceFiles: ['game.ts'] }] });
        }
        if (String(url).includes('/tree')) return json({ version: 'v2', files: [{ path: 'game.ts', content: 'C' }] });
        return json({}, 404);
      },
    });
    await expect(submitGame({ api, slug: SLUG, dest, run: () => ({ status: 0, stderr: '' }) })).rejects.toBeInstanceOf(
      CliError,
    );
    expect(readFileSync(join(dest, 'games', SLUG, 'game.ts'), 'utf8')).toBe('B');
  });

  it('stops when the platform moves during verify', async () => {
    const dest = checkout([{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, 'games', SLUG, 'game.ts'), 'B');
    let versionReads = 0;
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        seen.push(`${init?.method ?? 'GET'} ${String(url)}`);
        if (String(url).endsWith('/versions')) {
          versionReads += 1;
          const version = versionReads === 1 ? 'v1' : 'v2';
          return json({ versions: [{ version, createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] });
        }
        if (String(url).includes('/tree')) {
          if (versionReads === 1) return json({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] });
          return json({ version: 'v2', files: [{ path: 'game.ts', content: 'C' }] });
        }
        return json({}, 404);
      },
    });
    await expect(submitGame({ api, slug: SLUG, dest, run: () => ({ status: 0, stderr: '' }) })).rejects.toMatchObject({
      exitCode: EXIT_REFUSED,
      message: expect.stringMatching(/platform changed/),
    });
    expect(seen.some((row) => row.includes('/sources/'))).toBe(false);
    expect(readFileSync(join(dest, 'games', SLUG, 'game.ts'), 'utf8')).toBe('B');
  });

  it('reports a refused upload without claiming a gate', async () => {
    const dest = checkout([{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, 'games', SLUG, 'game.ts'), 'B');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return json({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] });
        }
        if (String(url).includes('/tree')) return json({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] });
        if (String(url).endsWith('/sources/stage')) return json({ accepted: true });
        if (String(url).endsWith('/sources/deliver')) return json({ accepted: false, rejected: 'rate_limited' });
        return json({}, 404);
      },
    });
    await expect(submitGame({ api, slug: SLUG, dest, run: () => ({ status: 0, stderr: '' }) })).rejects.toMatchObject({
      message: expect.stringMatching(/rate_limited/),
    });
  });
});
