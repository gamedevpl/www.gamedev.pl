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
        multiplayer: null,
        orientation: 'any',
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
      {
        slug: 'quoted',
        title: 'Quoted Title',
        genre: '',
        controls: '',
        status: 'published',
        media: null,
        multiplayer: null,
        orientation: 'any',
      },
    ]);
  });

  it('reads flat multiplayer frontmatter keys, and ignores malformed ones', async () => {
    const specs: Record<string, Record<string, string>> = {
      // Well-formed: the shape the seed games ship.
      party: {
        title: 'Arena Tag',
        status: 'published',
        multiplayer: 'controllers',
        min_players: '2',
        max_players: '4',
      },
      // min > max — nonsense bounds must not reach the lobby.
      backwards: {
        title: 'Backwards',
        status: 'published',
        multiplayer: 'controllers',
        min_players: '4',
        max_players: '2',
      },
      // Over the platform slot ceiling.
      crowded: {
        title: 'Crowded',
        status: 'published',
        multiplayer: 'controllers',
        min_players: '2',
        max_players: '99',
      },
      // An unknown mode is not a mode we can host.
      exotic: { title: 'Exotic', status: 'published', multiplayer: 'lockstep', min_players: '2', max_players: '4' },
      // Declared multiplayer but no bounds at all.
      vague: { title: 'Vague', status: 'published', multiplayer: 'controllers' },
    };

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/contents/games?')) {
        return new Response(JSON.stringify(Object.keys(specs).map((name) => ({ name, type: 'dir' }))), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      for (const [name, frontmatter] of Object.entries(specs)) {
        if (url.includes(`/contents/games/${name}/SPEC.md`)) {
          return new Response(specMd(frontmatter), { status: 200 });
        }
      }
      if (url.includes('/media/metadata.json')) {
        return new Response('not found', { status: 404 });
      }
      throw new Error(`unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');
    const bySlug = Object.fromEntries(catalog.map((entry) => [entry.slug, entry.multiplayer]));

    expect(bySlug.party).toEqual({ mode: 'controllers', minPlayers: 2, maxPlayers: 4 });
    expect(bySlug.backwards).toBeNull();
    expect(bySlug.crowded).toBeNull();
    expect(bySlug.exotic).toBeNull();
    expect(bySlug.vague).toBeNull();
  });

  it('reads the orientation a game asks for, degrading anything odd to "any"', async () => {
    const specs: Record<string, Record<string, string>> = {
      wide: { title: 'Wide', status: 'published', orientation: 'landscape' },
      tall: { title: 'Tall', status: 'published', orientation: 'portrait' },
      shouty: { title: 'Shouty', status: 'published', orientation: 'LANDSCAPE' },
      // A typo must not take a perfectly playable game off the site — and must
      // not make the player nag someone to rotate towards nothing.
      typo: { title: 'Typo', status: 'published', orientation: 'sideways' },
      silent: { title: 'Silent', status: 'published' },
    };

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/contents/games?')) {
        return new Response(JSON.stringify(Object.keys(specs).map((name) => ({ name, type: 'dir' }))), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      for (const [name, frontmatter] of Object.entries(specs)) {
        if (url.includes(`/contents/games/${name}/SPEC.md`)) {
          return new Response(specMd(frontmatter), { status: 200 });
        }
      }
      if (url.includes('/media/metadata.json')) {
        return new Response('not found', { status: 404 });
      }
      throw new Error(`unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');
    const bySlug = Object.fromEntries(catalog.map((entry) => [entry.slug, entry.orientation]));

    expect(bySlug.wide).toBe('landscape');
    expect(bySlug.tall).toBe('portrait');
    expect(bySlug.shouty).toBe('landscape');
    expect(bySlug.typo).toBe('any');
    expect(bySlug.silent).toBe('any');
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

describe('getGameSources', () => {
  it('bundles selected GameKit modules, audio assets, and shared shell styles before the game', async () => {
    const files = new Map<string, string | Uint8Array>([
      ['games/coin-catcher/index.html', '<canvas id="game"></canvas>'],
      ['games/coin-catcher/game.ts', 'const game: { update(): void } = { update() {} }; GameKit.mount(game);'],
      ['games/coin-catcher/style.css', '.game { color: gold; }'],
      ['games/coin-catcher/SPEC.md', specMd({ title: 'Coin Catcher' })],
      [
        'games/coin-catcher/GAME.json',
        JSON.stringify({ engine: { modules: ['input', 'audio'] }, audio: { sounds: ['ui-toggle', 'coin'] } }),
      ],
      ['shared/game-shell.css', '.shell { display: grid; }'],
      ['shared/modules/core.ts', 'const version: number = 1; window.GameKit = { mount() {} };'],
      ['shared/modules/input.ts', 'GameKit.createInput = function (): void {};'],
      ['shared/modules/audio.ts', 'GameKit.createAudio = function (): void {};'],
      ['shared/audio/assets/ui-toggle.wav', new Uint8Array([1, 2])],
      ['shared/audio/assets/coin.wav', new Uint8Array([3, 4])],
    ]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      const marker = '/contents/';
      const path = decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length));
      const value = files.get(path);
      return value === undefined ? new Response('not found', { status: 404 }) : new Response(value, { status: 200 });
    }) as unknown as typeof fetch;
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    const sources = await client.getGameSources('main', 'coin-catcher');

    expect(sources?.title).toBe('Coin Catcher');
    expect(sources?.styleCss).toBe('.shell { display: grid; }\n.game { color: gold; }');
    expect(sources?.gameJs).toContain('"ui-toggle":"data:audio/wav;base64,AQI="');
    expect(sources?.gameJs).toContain('"coin":"data:audio/wav;base64,AwQ="');
    expect(sources?.gameJs.indexOf('window.GameKit =')).toBeLessThan(
      sources?.gameJs.indexOf('GameKit.createInput') ?? 0,
    );
    expect(sources?.gameJs.indexOf('GameKit.createInput')).toBeLessThan(
      sources?.gameJs.indexOf('GameKit.createAudio') ?? 0,
    );
    expect(sources?.gameJs.indexOf('Object.freeze(window.GameKit)')).toBeLessThan(
      sources?.gameJs.indexOf('GameKit.mount(game)') ?? 0,
    );
    expect(sources?.gameJs).not.toContain(': number');
    expect(sources?.gameJs).not.toContain('): void');
    expect(() => new Function(sources?.gameJs ?? '')).not.toThrow();
  });

  it('bundles a game-local TypeScript module graph from GitHub', async () => {
    const files = new Map<string, string | Uint8Array>([
      ['games/modular/index.html', '<canvas id="game"></canvas>'],
      ['games/modular/game.ts', "import { startGame } from './game/runtime.ts'; startGame();"],
      [
        'games/modular/game/runtime.ts',
        "import type { Score } from './model.ts'; export function startGame(): void { const score: Score = { value: 3 }; GameKit.mount({ score }); }",
      ],
      ['games/modular/game/model.ts', 'export type Score = { value: number };'],
      ['games/modular/style.css', '.game { color: gold; }'],
      ['games/modular/SPEC.md', specMd({ title: 'Modular Game' })],
      ['games/modular/GAME.json', JSON.stringify({ engine: { modules: [] } })],
      ['shared/game-shell.css', '.shell { display: grid; }'],
      ['shared/modules/core.ts', 'window.GameKit = { mount() {} };'],
    ]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      const marker = '/contents/';
      const requestedPath = decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length));
      const value = files.get(requestedPath);
      return value === undefined ? new Response('not found', { status: 404 }) : new Response(value, { status: 200 });
    }) as unknown as typeof fetch;
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    const sources = await client.getGameSources('main', 'modular');

    expect(sources?.title).toBe('Modular Game');
    expect(sources?.gameJs).toContain('value: 3');
    expect(sources?.gameJs).toContain('startGame()');
    expect(sources?.gameJs).not.toContain('import ');
    expect(sources?.gameJs).not.toContain('Score');
    expect(() => new Function(sources?.gameJs ?? '')).not.toThrow();
  });

  it.each([
    ["import '../other-game/runtime.ts';", 'game imports must be TypeScript files inside'],
    ["import 'some-package';", 'game runtime dependency is forbidden'],
  ])('rejects an unsafe game import: %s', async (entrySource, expectedError) => {
    const files = new Map<string, string>([
      ['games/unsafe/index.html', '<canvas id="game"></canvas>'],
      ['games/unsafe/game.ts', entrySource],
      ['games/unsafe/style.css', '.game {}'],
      ['games/unsafe/SPEC.md', specMd({ title: 'Unsafe Game' })],
      ['games/unsafe/GAME.json', JSON.stringify({ engine: { modules: [] } })],
      ['shared/game-shell.css', '.shell {}'],
      ['shared/modules/core.ts', 'window.GameKit = {};'],
    ]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      const marker = '/contents/';
      const requestedPath = decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length));
      const value = files.get(requestedPath);
      return value === undefined ? new Response('not found', { status: 404 }) : new Response(value, { status: 200 });
    }) as unknown as typeof fetch;
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    await expect(client.getGameSources('main', 'unsafe')).rejects.toThrow(expectedError);
  });
});

describe('findLinkedPR', () => {
  const linkedPrData = {
    repository: {
      issue: {
        timelineItems: {
          nodes: [
            {
              source: {
                __typename: 'PullRequest',
                number: 30,
                state: 'OPEN',
                merged: false,
                isDraft: true,
                title: 'Add Space Runner',
                body: '- [ ] Add collision detection',
                headRefName: 'copilot/space-runner',
                headRefOid: 'sha-1',
                files: { nodes: [{ path: 'games/space-runner/index.html' }] },
                commits: {
                  nodes: [{ commit: { messageHeadline: 'Scaffold', committedDate: '2026-01-01T00:00:00Z' } }],
                },
                comments: { nodes: [] },
              },
            },
          ],
        },
      },
    },
  };

  it('still resolves the PR when the token may not read the CI rollup', async () => {
    const queries: string[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const query = JSON.parse(String(init?.body)).query as string;
      queries.push(query);
      // GitHub rejects the whole query for a forbidden field — the status page must
      // not go down with it.
      if (query.includes('statusCheckRollup')) {
        return new Response(
          JSON.stringify({ errors: [{ message: 'Resource not accessible by personal access token' }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: linkedPrData }), { status: 200 });
    });

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: fetchImpl as unknown as typeof fetch });

    const first = await client.findLinkedPR(7);
    expect(first?.number).toBe(30);
    expect(first?.checksState).toBeNull();
    expect(queries).toHaveLength(2);

    // Having learned the field is unavailable, it stops asking for it.
    const second = await client.findLinkedPR(7);
    expect(second?.number).toBe(30);
    expect(queries).toHaveLength(3);
    expect(queries[2]).not.toContain('statusCheckRollup');
  });

  it('surfaces the CI rollup when the token can read it', async () => {
    const withRollup = structuredClone(linkedPrData) as typeof linkedPrData & Record<string, unknown>;
    (
      withRollup.repository.issue.timelineItems.nodes[0]!.source.commits.nodes[0]!.commit as Record<string, unknown>
    ).statusCheckRollup = { state: 'FAILURE' };

    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: withRollup }), { status: 200 }));
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect((await client.findLinkedPR(7))?.checksState).toBe('FAILURE');
  });

  it('throws when the whole query fails for a reason other than the rollup field', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ errors: [{ message: 'Bad credentials' }] }), { status: 200 }),
    );
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.findLinkedPR(7)).rejects.toThrow('Bad credentials');
  });
});
