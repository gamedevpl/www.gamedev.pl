import { describe, expect, it } from 'vitest';
import { handleReplLine } from './repl.js';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';

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
  });
});
