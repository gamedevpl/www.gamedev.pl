import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { handleReplLine, replBanner } from './repl.js';
import { createApi } from './api.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { memoryStore } from './keychain.js';
import { MASCOT_ASCII } from './tui/mascot.js';

describe('repl turn loop', () => {
  it('prints a reply and does not invent a second request', async () => {
    const lines: string[] = [];
    let posts = 0;
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/turn')) {
          posts += 1;
          return new Response(JSON.stringify({ kind: 'reply', text: 'Still building.' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 404 });
      },
    });
    const result = await handleReplLine({ line: 'is it done yet?', api, token: 'tok', write: (s) => lines.push(s) });
    expect(result.next).toBe('continue');
    expect(posts).toBe(1);
    expect(lines.join('\n')).toContain('Still building.');
    expect(lines.join('\n')).not.toMatch(/build /);
  });

  it('talks through the chat endpoint when there is no open game', async () => {
    const lines: string[] = [];
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        const path = String(url);
        seen.push(`${init?.method ?? 'GET'} ${path}`);
        if (path.endsWith('/api/cli/chat')) {
          return new Response(
            JSON.stringify({ kind: 'reply', text: 'What should it feel like?', conversationId: 'conv-1' }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 404 });
      },
    });
    const result = await handleReplLine({
      line: 'A garden full of robots that water the plants.',
      api,
      token: null,
      write: (s) => lines.push(s),
    });
    expect(seen.some((row) => row.includes('/api/cli/chat'))).toBe(true);
    expect(seen.some((row) => row.includes('/refine'))).toBe(false);
    expect(seen.some((row) => row.startsWith('POST ') && row.endsWith('/api/submissions'))).toBe(false);
    expect(result.token).toBeUndefined();
    expect(result.conversationId).toBe('conv-1');
    expect(lines.join('\n')).toContain('What should it feel like');
  });

  it('opens a game only when the chat endpoint returns create', async () => {
    const lines: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        const path = String(url);
        if (path.endsWith('/api/cli/chat')) {
          return new Response(
            JSON.stringify({
              kind: 'create',
              token: 'new-tok',
              slug: 'robot-garden',
              conversationId: 'conv-1',
              ack: 'Opening it.',
            }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 404 });
      },
    });
    const opened = await handleReplLine({
      line: 'Make a garden full of robots that water the plants.',
      api,
      token: null,
      write: (s) => lines.push(s),
    });
    expect(opened.token).toBe('new-tok');
    expect(opened.slug).toBe('robot-garden');
    expect(opened.conversationId).toBe('conv-1');
    expect(lines.join('\n')).toContain('robot-garden');
  });

  it('treats a blank line as a no-op', async () => {
    let posts = 0;
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => {
        posts += 1;
        return new Response('{}', { status: 404 });
      },
    });
    const result = await handleReplLine({ line: '   ', api, token: 'tok', write: () => undefined });
    expect(result.next).toBe('continue');
    expect(posts).toBe(0);
  });

  it('connects from /connect instead of printing a fake success', async () => {
    const lines: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).includes('/api/me/studio?game=')) {
          return new Response(JSON.stringify({ games: [{ slug: 'sky', token: 'tok-1' }] }), { status: 200 });
        }
        if (String(url).endsWith('/connect')) {
          return new Response(
            JSON.stringify({ slug: 'sky', mcpUrl: 'https://www.gamedev.pl/api/mcp', kickoffPrompt: 'Build sky' }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 404 });
      },
    });
    const result = await handleReplLine({
      line: '/connect sky',
      api,
      token: 'tok',
      write: (s) => lines.push(s),
    });
    expect(result.next).toBe('continue');
    expect(lines.join('\n')).toContain('https://www.gamedev.pl/api/mcp');
    expect(lines.join('\n')).not.toBe('run it as gamedevpl connect');
  });

  it('prints the open session status from /status', async () => {
    const lines: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/api/submissions/tok')) {
          return new Response(JSON.stringify({ status: 'needs_changes', previewGate: { green: true } }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 404 });
      },
    });
    const result = await handleReplLine({
      line: '/status',
      api,
      token: 'tok',
      write: (s) => lines.push(s),
    });
    expect(result.next).toBe('continue');
    expect(lines.join('\n')).toContain('needs_changes');
  });

  it('parses slash-verb flags the same way as argv', async () => {
    const lines: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/api/submissions/mine')) {
          return new Response(JSON.stringify({ submissions: [{ slug: 'sky-dodge' }] }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
      },
    });
    const result = await handleReplLine({
      line: '/games --json',
      api,
      token: 'tok',
      write: (s) => lines.push(s),
    });
    expect(result.next).toBe('continue');
    expect(JSON.parse(lines.join('\n'))).toEqual({ submissions: [{ slug: 'sky-dodge' }] });
  });

  it('writes auth errors from slash verbs instead of throwing', async () => {
    const lines: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_dead', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => new Response('{}', { status: 401 }),
    });
    const result = await handleReplLine({
      line: '/games',
      api,
      token: 'tok',
      write: (s) => lines.push(s),
    });
    expect(result.next).toBe('continue');
    expect(lines.join('\n')).toContain('credential expired');
    expect(lines.join('\n')).toContain('gamedevpl login');
  });

  it('treats /submit dest like the one-shot verb, not as a slug', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-repl-sub-'));
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, '.gamedev-slug'), 'ghost-roads');
    const lines: string[] = [];
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        const path = String(url);
        seen.push(path);
        if (path.endsWith('/versions') && !path.includes('/tree')) {
          return new Response(
            JSON.stringify({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] }),
            { status: 200 },
          );
        }
        if (path.includes('/tree')) {
          return new Response(JSON.stringify({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 404 });
      },
    });
    const delivered = await handleReplLine({
      line: `/submit --slug ghost-roads ${dest}`,
      api,
      token: 'tok',
      write: (s) => lines.push(s),
    });
    expect(delivered.next).toBe('continue');
    expect(seen.some((path) => path.includes('/studio/games/ghost-roads/'))).toBe(true);
    expect(lines.join('\n')).toMatch(/nothing to deliver|ghost-roads/);

    lines.length = 0;
    const missing = await handleReplLine({
      line: '/submit not-a-checkout',
      api,
      token: 'tok',
      write: (s) => lines.push(s),
    });
    expect(missing.next).toBe('continue');
    expect(lines.join('\n')).toContain('gamedevpl submit [dir]');
    expect(seen.some((path) => path.includes('/studio/games/not-a-checkout/'))).toBe(false);
  });

  it('prints described help from /help', async () => {
    const lines: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => new Response('{}', { status: 404 }),
    });
    const result = await handleReplLine({
      line: '/help',
      api,
      token: null,
      write: (s) => lines.push(s),
    });
    expect(result.next).toBe('continue');
    expect(lines.join('\n')).toContain('open a browser');
    expect(lines.join('\n')).not.toMatch(/gamedevpl <[a-z]+\|/);
  });
});

describe('repl banner', () => {
  it('draws the mascot on a TTY and stays one line in a pipe', () => {
    expect(replBanner(true, {})).toContain(MASCOT_ASCII);
    expect(replBanner(true, {})).toContain('█');
    expect(replBanner(true, {})).not.toContain('╭');
    expect(replBanner(false, {})).not.toContain('╭');
  });
});
