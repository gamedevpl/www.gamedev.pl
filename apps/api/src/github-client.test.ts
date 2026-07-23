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
      if (url.includes('/contents/games/bubble-pop/media/metadata.json')) {
        return new Response(
          JSON.stringify({
            captures: {
              opening: { file: 'opening.png', frame: 0 },
              'first-bubbles': { file: 'first-bubbles.png', frame: 55 },
            },
            video: { file: 'gameplay.mp4' },
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
        media: {
          screenshots: [
            { name: 'opening', file: 'opening.png' },
            { name: 'first-bubbles', file: 'first-bubbles.png' },
          ],
          video: 'gameplay.mp4',
        },
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
      if (url.includes('/contents/games/quoted/media/metadata.json')) {
        return new Response('not found', { status: 404 });
      }
      if (url.includes('/contents/games/untitled/SPEC.md')) {
        return new Response(specMd({ status: 'published' }), { status: 200 });
      }
      throw new Error(`unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');

    expect(catalog).toEqual([
      { slug: 'quoted', title: 'Quoted Title', genre: '', controls: '', status: 'published', media: null },
    ]);
  });
});

describe('getGameMedia', () => {
  it('reads allowed media paths as bytes and rejects unsafe paths', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    await expect(client.getGameMedia('main', 'bubble-pop', 'opening.png')).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(client.getGameMedia('main', 'bubble-pop', '../SPEC.md')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
