import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { fetchGamesRepoArchive } from './games-repo-archive.js';
import { createGitHubClient, resolveGameTypeScriptPath } from './github-client.js';

describe('resolveGameTypeScriptPath', () => {
  it.each([
    ['./runtime.ts', '/games/foo/game/runtime.ts'],
    ['./runtime.js', '/games/foo/game/runtime.ts'],
    ['./runtime', '/games/foo/game/runtime.ts'],
    ['../util.js', '/games/foo/util.ts'],
  ])('maps %s under the game directory', (specifier, expected) => {
    expect(resolveGameTypeScriptPath('/games/foo/game', specifier)).toBe(expected);
  });

  it('rejects bare package imports and non-TS assets', () => {
    expect(resolveGameTypeScriptPath('/games/foo', 'lodash')).toBeNull();
    expect(resolveGameTypeScriptPath('/games/foo', './levels.json')).toBeNull();
    expect(resolveGameTypeScriptPath('/games/foo', './sprite.png')).toBeNull();
  });
});

const repo = 'gamedevpl/www.gamedev.pl-games';

function specMd(frontmatter: Record<string, string>): string {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`);
  return ['---', ...lines, '---', '', '## Concept', 'A game.'].join('\n');
}

/**
 * Answers the catalog's Contents listing + GraphQL chunk pattern. `files` maps
 * repo-relative paths to text (or null for a missing blob).
 */
function catalogFetchImpl(dirs: string[], files: Record<string, string | null>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/contents/catalog.json')) {
      // No committed artifact on this ref — exercises the GraphQL fallback below.
      return new Response('not found', { status: 404 });
    }
    if (url.includes('/contents/games?')) {
      return new Response(
        JSON.stringify([
          ...dirs.map((name) => ({ name, type: 'dir' as const })),
          { name: 'README.md', type: 'file' as const },
          { name: 'Bad Name!', type: 'dir' as const },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/graphql')) {
      const payload = init?.body ? (JSON.parse(String(init.body)) as { query?: string }) : {};
      const query = payload.query ?? '';
      const repository: Record<string, { text: string } | null> = {};
      for (const match of query.matchAll(/(\w+)\s*:\s*object\(expression:\s*"([^"]+)"\)/g)) {
        const alias = match[1];
        const expression = match[2];
        const colon = expression.indexOf(':');
        const repoPath = colon >= 0 ? expression.slice(colon + 1) : expression;
        const text = Object.prototype.hasOwnProperty.call(files, repoPath) ? files[repoPath] : null;
        repository[alias] = text === null || text === undefined ? null : { text };
      }
      return new Response(JSON.stringify({ data: { repository } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }) as unknown as typeof fetch;
}

describe('getCatalog', () => {
  it('builds catalog entries from games/ directories and SPEC.md frontmatter', async () => {
    const fetchImpl = catalogFetchImpl(['bubble-pop', 'zig-zag'], {
      'games/bubble-pop/SPEC.md': specMd({
        title: 'Bubble Pop Rush',
        slug: 'bubble-pop',
        status: 'published',
        genre: 'arcade',
        controls: 'Mouse to aim and pop',
      }),
      'games/bubble-pop/media/metadata.json': JSON.stringify({
        captures: {
          opening: { file: 'opening.png', frame: 0 },
          'first-bubbles': { file: 'first-bubbles.png', frame: 55 },
        },
        video: { file: 'gameplay.mp4' },
      }),
      // Missing SPEC.md — the game is skipped rather than failing the catalog.
      'games/zig-zag/SPEC.md': null,
      'games/zig-zag/media/metadata.json': null,
    });

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
        saves: null,
        world: null,
        orientation: 'any',
        submittedBy: null,
      },
    ]);
    // Artifact probe + one directory listing + one GraphQL chunk — not one
    // Contents read per file.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(vi.mocked(fetchImpl).mock.calls[2]?.[0])).toContain('/graphql');
  });

  it('strips quotes from frontmatter values and skips games without a title', async () => {
    const fetchImpl = catalogFetchImpl(['quoted', 'untitled'], {
      'games/quoted/SPEC.md': specMd({ title: '"Quoted Title"', status: 'published' }),
      'games/quoted/media/metadata.json': null,
      'games/untitled/SPEC.md': specMd({ status: 'published' }),
      'games/untitled/media/metadata.json': null,
    });

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
        saves: null,
        world: null,
        orientation: 'any',
        submittedBy: null,
      },
    ]);
  });

  it('reads submitted_by as a byline, treating nullish YAML as absent', async () => {
    const specs: Record<string, Record<string, string>> = {
      named: { title: 'Named', status: 'published', submitted_by: 'alice' },
      platform: { title: 'Platform', status: 'published', submitted_by: 'gamedev-platform' },
      none: { title: 'None', status: 'published', submitted_by: 'null' },
      silent: { title: 'Silent', status: 'published' },
    };
    const files: Record<string, string | null> = {};
    for (const [name, frontmatter] of Object.entries(specs)) {
      files[`games/${name}/SPEC.md`] = specMd(frontmatter);
      files[`games/${name}/media/metadata.json`] = null;
    }
    const fetchImpl = catalogFetchImpl(Object.keys(specs), files);
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');
    const bySlug = Object.fromEntries(catalog.map((entry) => [entry.slug, entry.submittedBy]));

    expect(bySlug.named).toBe('alice');
    expect(bySlug.platform).toBe('gamedev-platform');
    expect(bySlug.none).toBeNull();
    expect(bySlug.silent).toBeNull();
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

    const files: Record<string, string | null> = {};
    for (const [name, frontmatter] of Object.entries(specs)) {
      files[`games/${name}/SPEC.md`] = specMd(frontmatter);
      files[`games/${name}/media/metadata.json`] = null;
    }
    const fetchImpl = catalogFetchImpl(Object.keys(specs), files);

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

    const files: Record<string, string | null> = {};
    for (const [name, frontmatter] of Object.entries(specs)) {
      files[`games/${name}/SPEC.md`] = specMd(frontmatter);
      files[`games/${name}/media/metadata.json`] = null;
    }
    const fetchImpl = catalogFetchImpl(Object.keys(specs), files);

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');
    const bySlug = Object.fromEntries(catalog.map((entry) => [entry.slug, entry.orientation]));

    expect(bySlug.wide).toBe('landscape');
    expect(bySlug.tall).toBe('portrait');
    expect(bySlug.shouty).toBe('landscape');
    expect(bySlug.typo).toBe('any');
    expect(bySlug.silent).toBe('any');
  });

  it('batches large catalogs into multiple GraphQL chunks instead of per-file Contents reads', async () => {
    const slugs = Array.from({ length: 35 }, (_, i) => `game-${String(i).padStart(2, '0')}`);
    const files: Record<string, string | null> = {};
    for (const slug of slugs) {
      files[`games/${slug}/SPEC.md`] = specMd({ title: slug, status: 'published' });
      files[`games/${slug}/media/metadata.json`] = null;
    }
    const fetchImpl = catalogFetchImpl(slugs, files);
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    const catalog = await client.getCatalog('main');
    expect(catalog).toHaveLength(35);
    // 1 artifact probe + 1 listing + 2 GraphQL chunks (chunk size 30).
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const graphqlCalls = vi.mocked(fetchImpl).mock.calls.filter((call) => String(call[0]).includes('/graphql'));
    expect(graphqlCalls).toHaveLength(2);
  });

  it('serves the committed catalog.json in a single request when present', async () => {
    const committed = [
      {
        slug: 'bubble-pop',
        title: 'Bubble Pop Rush',
        genre: 'arcade',
        controls: 'Mouse to aim and pop',
        status: 'published',
        touch: 'gamekit',
        orientation: 'portrait',
        multiplayer: null,
        saves: null,
        world: null,
        media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: 'gameplay.mp4' },
      },
      {
        slug: 'arena-tag',
        title: 'Arena Tag',
        genre: 'party',
        controls: 'D-pad',
        status: 'draft',
        touch: 'controllers',
        orientation: 'any',
        multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
        media: null,
      },
    ];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/contents/catalog.json')) {
        return new Response(JSON.stringify(committed), { status: 200 });
      }
      throw new Error(`unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');

    // The whole point: no listing, no GraphQL, no per-game reads.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(catalog).toEqual([
      {
        slug: 'bubble-pop',
        title: 'Bubble Pop Rush',
        genre: 'arcade',
        controls: 'Mouse to aim and pop',
        status: 'published',
        touch: 'gamekit',
        orientation: 'portrait',
        multiplayer: null,
        saves: null,
        world: null,
        media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: 'gameplay.mp4' },
        submittedBy: null,
      },
      {
        slug: 'arena-tag',
        title: 'Arena Tag',
        genre: 'party',
        controls: 'D-pad',
        // draft coerces exactly like the GraphQL path: merged means visible.
        status: 'published',
        touch: 'controllers',
        orientation: 'any',
        multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
        saves: null,
        world: null,
        media: null,
        submittedBy: null,
      },
    ]);
  });

  it('carries the saves declaration through the committed catalog, and only for the one valid value', async () => {
    const committed = [
      { slug: 'crypt-delver', title: 'Crypt Delver', status: 'published', saves: 'player' },
      { slug: 'brick-storm', title: 'Brick Storm', status: 'published', saves: 'world' },
      { slug: 'sky-dodge', title: 'Sky Dodge', status: 'published' },
    ];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/contents/catalog.json')) {
        return new Response(JSON.stringify(committed), { status: 200 });
      }
      throw new Error(`unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');

    // `player` is the only mode; anything else — a typo, or a value from a games repo
    // newer than this deploy — reads as "does not save" rather than failing the catalog.
    expect(catalog.map((entry) => [entry.slug, entry.saves])).toEqual([
      ['crypt-delver', 'player'],
      ['brick-storm', null],
      ['sky-dodge', null],
    ]);
  });

  it('carries touch, which no SPEC-derived path can produce', async () => {
    // The regression this guards: touch is computed from each game's code by the
    // games repo. Losing it here silently tells phone visitors nothing.
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/contents/catalog.json')) {
        return new Response(
          JSON.stringify([{ slug: 'thumbly', title: 'Thumbly', status: 'published', touch: 'native' }]),
          { status: 200 },
        );
      }
      throw new Error('unexpected request');
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    expect((await client.getCatalog('main'))[0]?.touch).toBe('native');
  });

  it('re-validates committed entries instead of trusting the artifact', async () => {
    const committed = [
      // Unsafe media filename, unknown touch class, out-of-range player bounds and
      // a bogus orientation: each must be dropped without dropping the game.
      {
        slug: 'sneaky',
        title: 'Sneaky',
        status: 'published',
        touch: 'telepathy',
        orientation: 'SIDEWAYS',
        multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 99 },
        media: { screenshots: [{ name: 'opening', file: '../../etc/passwd.png' }], video: null },
      },
      // Not a game entry at all.
      { slug: 'No Slug!', title: 'Bad' },
      'garbage',
    ];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/contents/catalog.json')) {
        return new Response(JSON.stringify(committed), { status: 200 });
      }
      throw new Error('unexpected request');
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');

    expect(catalog).toEqual([
      {
        slug: 'sneaky',
        title: 'Sneaky',
        genre: '',
        controls: '',
        status: 'published',
        orientation: 'any',
        multiplayer: null,
        saves: null,
        world: null,
        media: null,
        submittedBy: null,
      },
    ]);
  });

  it('publishes a game whose entry claims no status, and honours a withdrawal', async () => {
    // The games repo stopped authoring `status` — merging a game publishes it, and a
    // spec speaks up only to withdraw itself. An entry with no status must therefore
    // resolve to `published`, or retiring the field would empty the site.
    //
    // Withdrawal is decided one layer up, not here: `getCatalog` reports every game
    // it read, and the `/api/catalog` route is what keeps only `published`. So
    // `archived`/`disabled` surviving this call *verbatim* is exactly what lets that
    // filter drop them — flattening them to `published` here would put them back on
    // the site. Hence the assertions below expect all four entries back.
    const committed = [
      { slug: 'silent', title: 'Silent' },
      { slug: 'retired', title: 'Retired', status: 'archived' },
      { slug: 'off', title: 'Off', status: 'disabled' },
      // A stale artifact written before the change still carries the old default.
      { slug: 'legacy', title: 'Legacy', status: 'draft' },
    ];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/contents/catalog.json')) {
        return new Response(JSON.stringify(committed), { status: 200 });
      }
      throw new Error('unexpected request');
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');

    expect(catalog.map((entry) => [entry.slug, entry.status])).toEqual([
      ['silent', 'published'],
      ['retired', 'archived'],
      ['off', 'disabled'],
      ['legacy', 'published'],
    ]);
  });

  it('falls back rather than blanking the site when no committed entry is usable', async () => {
    // A schema change in the games repo (a renamed field, say) would leave a valid
    // JSON array whose every row fails validation. Serving that as an empty catalog
    // would hide all games; the fan-out must take over instead.
    const base = catalogFetchImpl(['bubble-pop'], {
      'games/bubble-pop/SPEC.md': specMd({ title: 'Bubble Pop Rush', status: 'published' }),
      'games/bubble-pop/media/metadata.json': null,
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/contents/catalog.json')) {
        return new Response(JSON.stringify([{ id: 'renamed-field' }, 'garbage']), { status: 200 });
      }
      return base(input, init);
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');

    expect(catalog).toHaveLength(1);
    expect(catalog[0].slug).toBe('bubble-pop');
  });

  it('treats a genuinely empty artifact as an empty catalog, not a failure', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/contents/catalog.json')) {
        return new Response('[]', { status: 200 });
      }
      throw new Error('unexpected request: the fan-out must not run');
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    expect(await client.getCatalog('main')).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to the GraphQL fan-out when catalog.json is not valid JSON', async () => {
    const base = catalogFetchImpl(['bubble-pop'], {
      'games/bubble-pop/SPEC.md': specMd({ title: 'Bubble Pop Rush', status: 'published' }),
      'games/bubble-pop/media/metadata.json': null,
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/contents/catalog.json')) {
        return new Response('<<not json>>', { status: 200 });
      }
      return base(input, init);
    }) as unknown as typeof fetch;

    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });
    const catalog = await client.getCatalog('main');

    expect(catalog).toHaveLength(1);
    expect(catalog[0].slug).toBe('bubble-pop');
    expect(catalog[0].touch).toBeUndefined();
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

describe('getRefSha', () => {
  it('resolves a ref to its commit and refuses one that could address something else', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ sha: 'abc123' }), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    await expect(client.getRefSha('main')).resolves.toBe('abc123');
    // Slashed refs stay slashed — they have to, to resolve at all — so traversal is
    // refused outright rather than escaped away.
    await expect(client.getRefSha('../../octocat/hello/commits/main')).resolves.toBeNull();
    await expect(client.getRefSha('main; rm -rf')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('answers null when the ref does not resolve, so the caller starts nothing', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    await expect(client.getRefSha('main')).resolves.toBeNull();
  });
});

describe('getGameSources', () => {
  it('bundles selected GameKit modules, audio assets, music catalog, and shared shell styles', async () => {
    const files = new Map<string, string | Uint8Array>([
      ['games/coin-catcher/index.html', '<canvas id="game"></canvas>'],
      ['games/coin-catcher/game.ts', 'const game: { update(): void } = { update() {} }; GameKit.mount(game);'],
      ['games/coin-catcher/style.css', '.game { color: gold; }'],
      ['games/coin-catcher/SPEC.md', specMd({ title: 'Coin Catcher' })],
      [
        'games/coin-catcher/GAME.json',
        JSON.stringify({
          engine: { modules: ['input', 'audio'] },
          audio: { sounds: ['ui-toggle', 'coin'], music: 'menu-theme' },
        }),
      ],
      ['shared/game-shell.css', '.shell { display: grid; }'],
      ['shared/modules/core.ts', 'const version: number = 1; window.GameKit = { mount() {} };'],
      ['shared/modules/input.ts', 'GameKit.createInput = function (): void {};'],
      ['shared/modules/audio.ts', 'GameKit.createAudio = function (): void {};'],
      ['shared/audio/assets/ui-toggle.wav', new Uint8Array([1, 2])],
      ['shared/audio/assets/coin.wav', new Uint8Array([3, 4])],
      [
        'shared/audio/music.json',
        JSON.stringify({
          tracks: {
            'menu-theme': { loop: true, data: 'data:audio/mpeg;base64,AAA=' },
            'other-theme': { loop: false, data: 'data:audio/mpeg;base64,BBB=' },
          },
        }),
      ],
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
    // Games-repo contract: selected name as a string, plus a one-entry tracks map.
    expect(sources?.gameJs).toContain('window.__GAME_AUDIO_MUSIC__ = "menu-theme";');
    expect(sources?.gameJs).toContain(
      'window.__GAME_MUSIC_TRACKS__ = Object.freeze({"menu-theme":{"loop":true,"data":"data:audio/mpeg;base64,AAA="}});',
    );
    expect(sources?.gameJs).not.toContain('other-theme');
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

  it('accepts the post-draw-surface module order including gfx and actors', async () => {
    const files = new Map<string, string | Uint8Array>([
      ['games/squad/index.html', '<canvas id="game"></canvas>'],
      ['games/squad/game.ts', 'GameKit.mount({ ok: true });'],
      ['games/squad/style.css', '.game {}'],
      ['games/squad/SPEC.md', specMd({ title: 'Squad' })],
      [
        'games/squad/GAME.json',
        JSON.stringify({
          engine: { modules: ['input', 'collision', 'world', 'drawing', 'actors', 'gfx', 'effects', 'audio'] },
          audio: { sounds: ['shot'], music: 'battle' },
        }),
      ],
      ['shared/game-shell.css', '.shell {}'],
      ['shared/modules/core.ts', 'window.GameKit = { mount() {} };'],
      ['shared/modules/input.ts', 'GameKit.input = true;'],
      ['shared/modules/collision.ts', 'GameKit.collision = true;'],
      ['shared/modules/world.ts', 'GameKit.world = true;'],
      ['shared/modules/drawing.ts', 'GameKit.drawing = true;'],
      ['shared/modules/actors.ts', 'GameKit.actors = true;'],
      ['shared/modules/gfx.ts', 'GameKit.gfx = true;'],
      ['shared/modules/effects.ts', 'GameKit.effects = true;'],
      ['shared/modules/audio.ts', 'GameKit.audio = true;'],
      ['shared/audio/assets/shot.wav', new Uint8Array([9])],
      ['shared/audio/music.json', JSON.stringify({ tracks: { battle: { loop: true } } })],
    ]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      const marker = '/contents/';
      const requestedPath = decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length));
      const value = files.get(requestedPath);
      return value === undefined ? new Response('not found', { status: 404 }) : new Response(value, { status: 200 });
    }) as unknown as typeof fetch;
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    const sources = await client.getGameSources('main', 'squad');

    expect(sources?.gameJs).toContain('GameKit.gfx = true');
    expect(sources?.gameJs).toContain('GameKit.actors = true');
    expect(sources?.gameJs).toContain('GameKit.world = true');
    expect(sources?.gameJs.indexOf('GameKit.world = true')).toBeLessThan(
      sources?.gameJs.indexOf('GameKit.gfx = true') ?? 0,
    );
    expect(() => new Function(sources?.gameJs ?? '')).not.toThrow();
  });

  it('rejects a GAME.json that still uses a pre-draw-surface module list as incomplete order', async () => {
    // modules that omit required ordering relative to the canonical list are fine
    // as a subset — but unknown names must throw (the live 502 root cause).
    const files = new Map<string, string>([
      ['games/legacy/index.html', '<canvas></canvas>'],
      ['games/legacy/game.ts', 'GameKit.mount({});'],
      ['games/legacy/style.css', '.g{}'],
      ['games/legacy/SPEC.md', specMd({ title: 'Legacy' })],
      [
        'games/legacy/GAME.json',
        // "sprite" is not in GAME_KIT_MODULES — this is what production was throwing on
        // when games selected `gfx` against a stale allow-list.
        JSON.stringify({ engine: { modules: ['input', 'sprite', 'audio'] }, audio: { sounds: ['a'], music: 'x' } }),
      ],
      ['shared/game-shell.css', '.shell{}'],
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

    await expect(client.getGameSources('main', 'legacy')).rejects.toThrow('invalid engine modules');
  });

  it.each([
    {
      label: '.ts suffix',
      entry: "import { startGame } from './game/runtime.ts'; startGame();",
      runtimeImport:
        "import type { Score } from './model.ts'; export function startGame(): void { const score: Score = { value: 3 }; GameKit.mount({ score }); }",
    },
    {
      // TypeScript's Node ESM convention — import path says .js, source file is .ts.
      label: '.js suffix',
      entry: "import { startGame } from './game/runtime.js'; startGame();",
      runtimeImport:
        "import type { Score } from './model.js'; export function startGame(): void { const score: Score = { value: 3 }; GameKit.mount({ score }); }",
    },
    {
      label: 'extensionless',
      entry: "import { startGame } from './game/runtime'; startGame();",
      runtimeImport:
        "import type { Score } from './model'; export function startGame(): void { const score: Score = { value: 3 }; GameKit.mount({ score }); }",
    },
  ])('bundles a game-local TypeScript module graph from GitHub ($label)', async ({ entry, runtimeImport }) => {
    const files = new Map<string, string | Uint8Array>([
      ['games/modular/index.html', '<canvas id="game"></canvas>'],
      ['games/modular/game.ts', entry],
      ['games/modular/game/runtime.ts', runtimeImport],
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

  it('resolves an extensionless directory import to index.ts', async () => {
    const files = new Map<string, string | Uint8Array>([
      ['games/modular/index.html', '<canvas id="game"></canvas>'],
      // Import a subdirectory (not `./game`, which would collide with this entry file).
      ['games/modular/game.ts', "import { startGame } from './lib'; startGame();"],
      ['games/modular/lib/index.ts', 'export function startGame(): void { GameKit.mount({ ok: true }); }'],
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

    expect(sources?.gameJs).toContain('ok: true');
    expect(() => new Function(sources?.gameJs ?? '')).not.toThrow();
  });

  it.each([
    ["import '../other-game/runtime.ts';", 'game imports must be TypeScript files inside'],
    ["import 'some-package';", 'game runtime dependency is forbidden'],
    ["import './levels.json';", 'game imports must be TypeScript files inside'],
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

describe('archive-backed file source', () => {
  const BLOCK = 512;
  const ROOT = 'gamedevpl-www.gamedev.pl-games-3f8a1c9';

  const gameFiles = new Map<string, string | Uint8Array>([
    ['games/coin-catcher/index.html', '<canvas id="game"></canvas>'],
    ['games/coin-catcher/game.ts', 'const game: { update(): void } = { update() {} }; GameKit.mount(game);'],
    ['games/coin-catcher/style.css', '.game { color: gold; }'],
    ['games/coin-catcher/SPEC.md', specMd({ title: 'Coin Catcher' })],
    ['games/coin-catcher/GAME.json', JSON.stringify({ engine: { modules: ['input'] } })],
    ['games/coin-catcher/media/opening.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
    ['shared/game-shell.css', '.shell { display: grid; }'],
    ['shared/modules/core.ts', 'const version: number = 1; window.GameKit = { mount() {} };'],
    ['shared/modules/input.ts', 'GameKit.createInput = function (): void {};'],
  ]);

  function tarball(): Buffer {
    const blocks = [...gameFiles].map(([name, body]) => {
      const payload = Buffer.from(body as Uint8Array | string);
      const header = Buffer.alloc(BLOCK);
      header.write(`${ROOT}/${name}`, 0, 100, 'utf8');
      header.write(`${payload.length.toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
      header.write('0', 156, 1, 'utf8');
      header.write('ustar\0', 257, 6, 'utf8');
      return Buffer.concat([header, payload, Buffer.alloc((BLOCK - (payload.length % BLOCK)) % BLOCK)]);
    });
    return gzipSync(Buffer.concat([...blocks, Buffer.alloc(BLOCK * 2)]));
  }

  /** The contents API: one request per file. */
  function createContentsFetch() {
    return vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      const marker = '/contents/';
      const path = decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length));
      const value = gameFiles.get(path);
      return value === undefined ? new Response('not found', { status: 404 }) : new Response(value, { status: 200 });
    });
  }

  it('assembles a game identically to the contents API, and stops asking GitHub for files', async () => {
    const contentsFetch = createContentsFetch();
    const viaApi = await createGitHubClient({
      token: 'test-token',
      repo,
      fetchImpl: contentsFetch as unknown as typeof fetch,
    }).getGameSources('main', 'coin-catcher');
    // The old path: index.html, game.ts, style.css, SPEC.md, GAME.json, shell css, core, input.
    expect(contentsFetch.mock.calls.length).toBeGreaterThan(5);

    const archiveFetch = vi.fn(async () => new Response(tarball()));
    const files = await fetchGamesRepoArchive({
      repo,
      ref: 'main',
      token: 'test-token',
      fetchImpl: archiveFetch as unknown as typeof fetch,
    });
    const forbiddenFetch = (async () => {
      throw new Error('the archive path must not read files over the API');
    }) as unknown as typeof fetch;
    const viaArchive = await createGitHubClient({
      token: 'test-token',
      repo,
      fetchImpl: forbiddenFetch,
      files,
    }).getGameSources('main', 'coin-catcher');

    expect(viaArchive).toEqual(viaApi);
    expect(archiveFetch).toHaveBeenCalledTimes(1);
  });

  it('serves media bytes from the archive too', async () => {
    const files = await fetchGamesRepoArchive({
      repo,
      ref: 'main',
      token: 'test-token',
      fetchImpl: (async () => new Response(tarball())) as unknown as typeof fetch,
    });
    const client = createGitHubClient({
      token: 'test-token',
      repo,
      fetchImpl: (() => {
        throw new Error('must not fetch');
      }) as unknown as typeof fetch,
      files,
    });

    const bytes = await client.getGameMedia('main', 'coin-catcher', 'opening.png');
    expect(Buffer.from(bytes ?? [])).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await expect(client.getGameMedia('main', 'coin-catcher', 'absent.png')).resolves.toBeNull();
  });
});

describe('createBranchWithFiles', () => {
  /** Records every write so the git-data sequence can be asserted as a sequence. */
  function gitDataFetch() {
    const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url: href, method, body });

      if (href.includes('/commits/')) {
        return new Response(JSON.stringify({ sha: 'base-sha', commit: { tree: { sha: 'base-tree-sha' } } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (href.endsWith('/git/trees')) {
        return new Response(JSON.stringify({ sha: 'new-tree-sha' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (href.endsWith('/git/commits')) {
        return new Response(JSON.stringify({ sha: 'new-commit-sha' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ref: 'refs/heads/seed/job-42' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    return { fetchImpl, calls };
  }

  it('writes every file in one commit on a new branch', async () => {
    const { fetchImpl, calls } = gitDataFetch();
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    const result = await client.createBranchWithFiles({
      branch: 'seed/job-42',
      baseRef: 'main',
      message: 'Seed round 0',
      files: [
        { path: 'games/x/game.ts', content: 'export {};\n' },
        { path: 'games/x/game/model.ts', content: 'export const A = 1;\n' },
      ],
    });

    expect(result).toEqual({ branch: 'seed/job-42', sha: 'new-commit-sha' });
    // Four requests regardless of file count: resolve, tree, commit, ref. A
    // contents-API write would have been one request per file plus the ref.
    expect(calls).toHaveLength(4);

    const tree = calls[1];
    expect(tree.url).toContain('/git/trees');
    expect(tree.body.base_tree).toBe('base-tree-sha');
    // Content inline rather than a blob per file — that is what keeps this at four.
    expect(tree.body.tree).toEqual([
      { path: 'games/x/game.ts', mode: '100644', type: 'blob', content: 'export {};\n' },
      { path: 'games/x/game/model.ts', mode: '100644', type: 'blob', content: 'export const A = 1;\n' },
    ]);

    expect(calls[2].body).toEqual({ message: 'Seed round 0', tree: 'new-tree-sha', parents: ['base-sha'] });
    expect(calls[3].body).toEqual({ ref: 'refs/heads/seed/job-42', sha: 'new-commit-sha' });
  });

  it('throws rather than branching from nowhere when the base ref does not resolve', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    await expect(
      client.createBranchWithFiles({ branch: 'seed/job-1', baseRef: 'nope', message: 'x', files: [] }),
    ).rejects.toThrow(/cannot resolve base ref/);
  });
});

/**
 * A 403 from this API is at least three different problems, and for months every one of
 * them logged the same eleven words. GitHub says which it is in the response body and in
 * `x-accepted-github-permissions`; the client used to read neither.
 */
describe('failed request reporting', () => {
  const repo = 'gamedevpl/www.gamedev.pl-games';

  function respondWith(status: number, body: string, headers: Record<string, string> = {}) {
    return vi.fn(async () => new Response(body, { status, headers })) as unknown as typeof fetch;
  }

  it('reports the permission a refused write actually wanted', async () => {
    const fetchImpl = respondWith(403, JSON.stringify({ message: 'Resource not accessible by personal access token' }), {
      'x-accepted-github-permissions': 'contents=write',
      // Present and non-zero: this is a permission problem, not a throttle, and the
      // client must not retry it as one.
      'x-ratelimit-remaining': '4998',
    });
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    const error = await client.deleteBranch('copilot/spent').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('403');
    expect(message).toContain('Resource not accessible by personal access token');
    expect(message).toContain('needs contents=write');
    // The path names which call it was — the fact that took a disassembled stack trace.
    expect(message).toContain('/git/refs/heads/');
    // One attempt: a bare 403 is permanent and retrying it only delays the truth.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Nothing that could carry the credential is anywhere in it.
    expect(message).not.toContain('test-token');
  });

  it('marks an exhausted rate limit as the temporary thing it is', async () => {
    const fetchImpl = respondWith(403, JSON.stringify({ message: 'API rate limit exceeded for user ID 1.' }), {
      'x-ratelimit-remaining': '0',
    });
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    const error = await client.deleteBranch('copilot/spent').catch((err: unknown) => err);

    expect((error as Error).message).toContain('rate limit exhausted');
  });

  it('keeps the status when the body explains nothing', async () => {
    const fetchImpl = respondWith(500, '<html>upstream is having a day</html>');
    const client = createGitHubClient({ token: 'test-token', repo, fetchImpl });

    const error = await client.deleteBranch('copilot/spent').catch((err: unknown) => err);

    // No worse than what it replaced: an unparseable body costs the explanation, not
    // the error.
    expect((error as Error).message).toContain('500');
  });
});
