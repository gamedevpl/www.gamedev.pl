import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { connectGame } from './connect.js';
import { memoryStore } from './keychain.js';
import { CliError } from './exit-codes.js';
import { CREATOR_TOKEN_PATTERN } from './delegate.js';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

describe('connectGame', () => {
  it('prints a working MCP handoff from the connect route', async () => {
    const lines: string[] = [];
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_creator', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        seen.push(`${init?.method ?? 'GET'} ${String(url)}`);
        if (String(url).includes('/api/me/studio?game=')) {
          return json({ games: [{ slug: 'sky-dodge', token: 'tok-1', title: 'Sky' }] });
        }
        if (String(url).endsWith('/api/submissions/tok-1/connect')) {
          return json({
            slug: 'sky-dodge',
            mcpUrl: 'https://www.gamedev.pl/api/mcp',
            kickoffPrompt: 'Build "Sky" for gamedev.pl.\nStart with the gamedevpl tool, slug: sky-dodge',
            authorizationHeader: 'Bearer gdpl_cak_secret',
            authorizationHeaderMasked: 'Bearer gdpl_cak_…cret',
            installSnippets: { claudeCode: 'claude mcp add --transport http gamedevpl https://www.gamedev.pl/api/mcp' },
          });
        }
        return json({}, 404);
      },
    });
    const result = await connectGame({
      api,
      slug: 'sky-dodge',
      dest: '/tmp',
      write: (line) => lines.push(line),
    });
    expect(result).toEqual({ spawned: false, mcp: true });
    expect(seen).toContain('GET https://www.gamedev.pl/api/me/studio?game=sky-dodge');
    expect(seen).toContain('GET https://www.gamedev.pl/api/submissions/tok-1/connect');
    expect(lines.join('\n')).toContain('https://www.gamedev.pl/api/mcp');
    expect(lines.join('\n')).toContain('slug: sky-dodge');
    expect(lines.join('\n')).toContain('Bearer gdpl_cak_secret');
  });

  it('does not pretend success when connect is unavailable', async () => {
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_creator', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).includes('/api/me/studio?game=')) {
          return json({ games: [{ slug: 'sky-dodge', token: 'tok-1' }] });
        }
        return json({ error: 'connect_unavailable', reason: 'not_self_round' }, 409);
      },
    });
    await expect(connectGame({ api, slug: 'sky-dodge', dest: '/tmp', write: () => undefined })).rejects.toBeInstanceOf(
      CliError,
    );
  });

  it('spawns an adapter without the creator OAuth or PAT', async () => {
    const seenEnv: NodeJS.ProcessEnv[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_creator', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).includes('/api/me/studio?game=')) {
          return json({ games: [{ slug: 'sky-dodge', token: 'round-tok' }] });
        }
        if (String(url).includes('/connect')) {
          return json({
            slug: 'sky-dodge',
            mcpUrl: 'https://www.gamedev.pl/api/mcp',
            kickoffPrompt: 'Build it',
          });
        }
        return json({}, 404);
      },
    });
    await connectGame({
      api,
      slug: 'sky-dodge',
      dest: '/tmp/workspace',
      env: { PATH: '/usr/bin', GAMEDEV_TOKEN: 'gdpl_pat_ci', SECRET: 'gdpl_oat_hidden', HOME: '/tmp' },
      agent: 'claude',
      which: (cmd) => (cmd === 'claude' ? '/usr/bin/claude' : null),
      runAdapter: async ({ env, cwd, spec }) => {
        seenEnv.push(env);
        expect(spec.name).toBe('claude');
        expect(cwd).toBe('/tmp/workspace/games/sky-dodge');
        return { code: 0, lines: ['{"text":"edited"}'] };
      },
      write: () => undefined,
    });
    expect(seenEnv).toHaveLength(1);
    expect(JSON.stringify(seenEnv[0])).not.toMatch(CREATOR_TOKEN_PATTERN);
    expect(seenEnv[0]?.GAMEDEV_TOKEN).toBeUndefined();
    expect(seenEnv[0]?.GAMEDEV_ROUND_TOKEN).toBe('round-tok');
  });

  it('posts a self handoff when asked, then reads connect', async () => {
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        seen.push(`${init?.method ?? 'GET'} ${String(url)}`);
        if (String(url).includes('/api/me/studio?game='))
          return json({ games: [{ slug: 'sky-dodge', token: 'tok-1' }] });
        if (String(url).endsWith('/handoff')) return json({ ok: true });
        if (String(url).endsWith('/connect')) {
          return json({ slug: 'sky-dodge', mcpUrl: 'https://www.gamedev.pl/api/mcp', kickoffPrompt: 'Build it' });
        }
        return json({}, 404);
      },
    });
    await connectGame({
      api,
      slug: 'sky-dodge',
      dest: '/tmp',
      handoff: true,
      write: () => undefined,
    });
    expect(seen.some((row) => row.startsWith('POST ') && row.endsWith('/handoff'))).toBe(true);
    expect(seen.some((row) => row.startsWith('GET ') && row.endsWith('/connect'))).toBe(true);
  });

  it('does not hand off when the requested adapter is missing', async () => {
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        seen.push(`${init?.method ?? 'GET'} ${String(url)}`);
        if (String(url).includes('/api/me/studio?game='))
          return json({ games: [{ slug: 'sky-dodge', token: 'tok-1' }] });
        if (String(url).endsWith('/handoff')) return json({ ok: true });
        return json({}, 404);
      },
    });
    await expect(
      connectGame({
        api,
        slug: 'sky-dodge',
        dest: '/tmp',
        agent: 'claude',
        handoff: true,
        which: () => null,
        write: () => undefined,
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/not on PATH/) });
    expect(seen.some((row) => row.endsWith('/handoff'))).toBe(false);
  });
});
