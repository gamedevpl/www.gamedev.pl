import { describe, expect, it } from 'vitest';
import { handleReplLine, replBanner } from './repl.js';
import { createApi } from './api.js';
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

  it('drives refine then submit when there is no open game', async () => {
    const lines: string[] = [];
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        const path = String(url);
        seen.push(`${init?.method ?? 'GET'} ${path}`);
        if (path.endsWith('/api/submissions/refine')) {
          return new Response(JSON.stringify({ questions: [], suggestedTitle: 'Robot Garden' }), { status: 200 });
        }
        if (path.endsWith('/api/submissions') && init?.method === 'POST') {
          return new Response(JSON.stringify({ token: 'new-tok', slug: 'robot-garden' }), { status: 200 });
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
    expect(seen.some((row) => row.includes('/refine'))).toBe(true);
    expect(seen.some((row) => row.startsWith('POST ') && row.endsWith('/api/submissions'))).toBe(true);
    expect(result.token).toBe('new-tok');
    expect(result.slug).toBe('robot-garden');
    expect(lines.join('\n')).toContain('robot-garden');
  });

  it('asks refine questions before submitting', async () => {
    const lines: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        const path = String(url);
        if (path.endsWith('/api/submissions/refine')) {
          return new Response(
            JSON.stringify({
              questions: [{ id: 'tone', question: 'What tone?', options: [{ label: 'calm' }] }],
              suggestedTitle: 'Robot Garden',
            }),
            { status: 200 },
          );
        }
        if (path.endsWith('/api/submissions') && init?.method === 'POST') {
          return new Response(JSON.stringify({ token: 'new-tok', slug: 'robot-garden' }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
      },
    });
    const asked = await handleReplLine({
      line: 'A garden full of robots.',
      api,
      token: null,
      write: (s) => lines.push(s),
    });
    expect(asked.draft?.questions).toHaveLength(1);
    expect(lines.join('\n')).toContain('What tone?');
    const opened = await handleReplLine({
      line: 'calm',
      api,
      token: null,
      draft: asked.draft,
      write: (s) => lines.push(s),
    });
    expect(opened.token).toBe('new-tok');
    expect(opened.draft).toBeNull();
    expect(opened.slug).toBe('robot-garden');
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

  it('tells the user to run known non-REPL verbs as gamedevpl <verb>', async () => {
    const lines: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_oat_t', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => new Response('{}', { status: 404 }),
    });
    const result = await handleReplLine({
      line: '/connect sky',
      api,
      token: 'tok',
      write: (s) => lines.push(s),
    });
    expect(result.next).toBe('continue');
    expect(lines.join('\n')).toBe('run it as gamedevpl connect');
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
