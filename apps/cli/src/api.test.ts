import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { CliError, EXIT_AUTH } from './exit-codes.js';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

describe('oauth refresh', () => {
  it('retries a JSON request after a successful refresh', async () => {
    const store = memoryStore({
      accessToken: 'old',
      refreshToken: 'gdpl_ort_1',
      tokenType: 'Bearer',
      scope: 'creator',
    });
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store,
      env: {},
      fetch: async (url, init) => {
        const path = String(url);
        seen.push(`${init?.method ?? 'GET'} ${path}`);
        if (path.endsWith('/oauth/token')) {
          const body = String(init?.body ?? '');
          expect(body).toContain('grant_type=refresh_token');
          expect(body).toContain('refresh_token=gdpl_ort_1');
          return json({
            access_token: 'new',
            refresh_token: 'gdpl_ort_2',
            token_type: 'Bearer',
            scope: 'creator',
          });
        }
        const auth = String((init?.headers as Record<string, string> | undefined)?.authorization ?? '');
        if (auth === 'Bearer old') return json({ error: 'expired' }, 401);
        expect(auth).toBe('Bearer new');
        return json({ handle: 'ada' });
      },
    });
    expect(await api.request<{ handle: string }>('GET', '/api/me/profile')).toEqual({ handle: 'ada' });
    expect((await store.get())?.refreshToken).toBe('gdpl_ort_2');
    expect(seen.filter((row) => row.includes('/oauth/token'))).toHaveLength(1);
  });

  it('retries an archive download after a successful refresh', async () => {
    const store = memoryStore({
      accessToken: 'old',
      refreshToken: 'gdpl_ort_1',
      tokenType: 'Bearer',
      scope: 'creator',
    });
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store,
      env: {},
      fetch: async (url, init) => {
        const auth = String((init?.headers as Record<string, string> | undefined)?.authorization ?? '');
        if (String(url).endsWith('/oauth/token')) {
          return json({ access_token: 'new', refresh_token: 'gdpl_ort_2', token_type: 'Bearer', scope: 'creator' });
        }
        if (auth === 'Bearer old') return json({ error: 'expired' }, 401);
        return new Response(Buffer.from('tgz'), { status: 200 });
      },
    });
    expect((await api.requestBytes('/api/me/studio/games/sky/workspace')).toString()).toBe('tgz');
  });

  it('shares one refresh across concurrent 401s', async () => {
    const store = memoryStore({
      accessToken: 'old',
      refreshToken: 'gdpl_ort_1',
      tokenType: 'Bearer',
      scope: 'creator',
    });
    let refreshes = 0;
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store,
      env: {},
      fetch: async (url, init) => {
        if (String(url).endsWith('/oauth/token')) {
          refreshes += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return json({ access_token: 'new', refresh_token: 'gdpl_ort_2', token_type: 'Bearer', scope: 'creator' });
        }
        const auth = String((init?.headers as Record<string, string> | undefined)?.authorization ?? '');
        if (auth === 'Bearer old') return json({ error: 'expired' }, 401);
        return json({ ok: true });
      },
    });
    await Promise.all([api.request('GET', '/api/me/profile'), api.request('GET', '/api/me/quota')]);
    expect(refreshes).toBe(1);
  });

  it('names a revoked grant separately from expiry', async () => {
    const store = memoryStore({
      accessToken: 'old',
      refreshToken: 'gdpl_ort_dead',
      tokenType: 'Bearer',
      scope: 'creator',
    });
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store,
      env: {},
      fetch: async (url) => {
        if (String(url).endsWith('/oauth/token')) return json({ error: 'invalid_grant' }, 400);
        return json({ error: 'expired' }, 401);
      },
    });
    await expect(api.request('GET', '/api/me/profile')).rejects.toMatchObject({
      message: expect.stringMatching(/revoked/),
      exitCode: EXIT_AUTH,
    });
  });

  it('does not refresh a PAT from GAMEDEV_TOKEN', async () => {
    const store = memoryStore({
      accessToken: 'unused',
      refreshToken: 'gdpl_ort_1',
      tokenType: 'Bearer',
      scope: 'creator',
    });
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store,
      env: { GAMEDEV_TOKEN: 'gdpl_pat_ci' },
      fetch: async (url, init) => {
        seen.push(`${init?.method ?? 'GET'} ${String(url)}`);
        return json({ error: 'expired' }, 401);
      },
    });
    await expect(api.request('GET', '/api/me/profile')).rejects.toBeInstanceOf(CliError);
    expect(seen.some((row) => row.includes('/oauth/token'))).toBe(false);
    expect(seen[0]).toContain('/api/me/profile');
  });

  it('does not retry a writing call in a loop after one refresh', async () => {
    const store = memoryStore({
      accessToken: 'old',
      refreshToken: 'gdpl_ort_1',
      tokenType: 'Bearer',
      scope: 'creator',
    });
    let puts = 0;
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store,
      env: {},
      fetch: async (url) => {
        if (String(url).endsWith('/oauth/token')) {
          return json({ access_token: 'new', refresh_token: 'gdpl_ort_2', token_type: 'Bearer', scope: 'creator' });
        }
        puts += 1;
        return json({ error: 'expired' }, 401);
      },
    });
    await expect(
      api.request('PUT', '/api/me/studio/games/sky/sources/stage', { path: 'game.ts', content: 'x' }),
    ).rejects.toBeInstanceOf(CliError);
    expect(puts).toBe(2);
  });
});
