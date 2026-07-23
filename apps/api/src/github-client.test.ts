import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient } from './github-client.js';

const repo = 'gamedevpl/www.gamedev.pl-games';

function specMd(frontmatter: Record<string, string>): string {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`);
  return ['---', ...lines, '---', '', '## Concept', 'A game.'].join('\n');
}

describe('getCatalog', () => {
  it('builds catalog entries from games/ directories and SPEC.md frontmatter', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/contents/games?')) {
        return new Response(
          JSON.stringify([
            { name: 'bubble-pop', type: 'dir' },
            { name: 'zig-zag', type: 'dir' },
            { name: 'README.md', type: 'file' },
            { name: 'Bad Name!', type: 'dir' },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/contents/games/bubble-pop/SPEC.md')) {
        return new Response(
          specMd({
            title: 'Bubble Pop Rush',
            slug: 'bubble-pop',
            status: 'published',
            genre: 'arcade',
            controls: 'Mouse to aim and pop',
          }),
          { status: 200 },
        );
      }
      if (url.includes('/contents/games/zig-zag/SPEC.md')) {
        // Missing SPEC.md — the game is skipped rather than failing the catalog.
        return new Response('not found', { status: 404 });
      }
      throw new Error(`unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');

    expect(catalog).toEqual([
      {
        slug: 'bubble-pop',
        title: 'Bubble Pop Rush',
        genre: 'arcade',
        controls: 'Mouse to aim and pop',
        status: 'published',
      },
    ]);
  });

  it('strips quotes from frontmatter values and skips games without a title', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/contents/games?')) {
        return new Response(
          JSON.stringify([
            { name: 'quoted', type: 'dir' },
            { name: 'untitled', type: 'dir' },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/contents/games/quoted/SPEC.md')) {
        return new Response(specMd({ title: '"Quoted Title"', status: 'published' }), { status: 200 });
      }
      if (url.includes('/contents/games/untitled/SPEC.md')) {
        return new Response(specMd({ status: 'published' }), { status: 200 });
      }
      throw new Error(`unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');

    expect(catalog).toEqual([{ slug: 'quoted', title: 'Quoted Title', genre: '', controls: '', status: 'published' }]);
  });
});
