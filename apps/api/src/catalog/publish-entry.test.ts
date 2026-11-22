import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient, type GitHubClient } from './github-client.js';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { createGcsObjectStore } from '../delivery/gcs-sign.js';
import { createGcsGamesStore } from '../delivery/games-store.js';
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';
import { InMemoryStore } from '../platform/store.js';

const ENGINE_REF = 'a'.repeat(40);
const SESSION_SECRET = 'dev-session-secret-change-me';

function specMd(title: string): string {
  return `---\ntitle: ${title}\ncontrols: Click\n---\nPreview body\n`;
}

function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 'utf8');
  header.write('0000644\0', 100, 'utf8');
  header.write('0000000\0', 108, 'utf8');
  header.write('0000000\0', 116, 'utf8');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'utf8');
  header.write('00000000000\0', 136, 'utf8');
  header.write('        ', 148, 'utf8');
  header.write('0', 156, 'utf8');
  header.write('ustar\0', 257, 'utf8');
  header.write('00', 263, 'utf8');
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'utf8');
  return header;
}

function kitTarball(files: Record<string, string>): Buffer {
  const chunks: Buffer[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const body = Buffer.from(content, 'utf8');
    chunks.push(tarHeader(`${KIT_ROOT_DIR}/${rel}`, body.length), body);
    const pad = (512 - (body.length % 512)) % 512;
    if (pad) chunks.push(Buffer.alloc(pad));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

function stubGcs() {
  const objects = new Map<string, Buffer>();
  const generations = new Map<string, number>();
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    if (init.method === 'POST') {
      const name = decodeURIComponent(new URL(href).searchParams.get('name') ?? '');
      objects.set(name, Buffer.from(init.body as Uint8Array));
      const next = (generations.get(name) ?? 0) + 1;
      generations.set(name, next);
      return new Response(JSON.stringify({ generation: String(next) }), { status: 200 });
    }
    if (!href.includes('/o/')) {
      return new Response(JSON.stringify({ prefixes: [] }), { status: 200 });
    }
    const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
    const body = objects.get(name);
    if (!body) return new Response('', { status: 404 });
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: { 'x-goog-generation': String(generations.get(name) ?? 1) },
    });
  }) as unknown as typeof fetch;
  return { impl, objects };
}

describe('publish.ts preview isolation', () => {
  it('falls back on blank publish.ts and isolates overlay builds to publish.ts', async () => {
    const base = new Map<string, string>([
      ['games/raid/index.html', '<canvas id="game"></canvas>'],
      ['games/raid/game.ts', 'GameKit.mount({ full: "full-game" });'],
      ['games/raid/style.css', '.game { color: teal; }'],
      ['games/raid/SPEC.md', specMd('Raid')],
      ['games/raid/GAME.json', JSON.stringify({ engine: { modules: ['input'] } })],
      ['shared/game-shell.css', '.shell { display: grid; }'],
      ['shared/modules/core.ts', 'window.GameKit = { mount() {} };'],
      ['shared/modules/input.ts', 'GameKit.createInput = function (): void {};'],
    ]);
    const clientFor = (extra: Array<[string, string]>) => {
      const all = new Map([...base, ...extra]);
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        const marker = '/contents/';
        const value = all.get(decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length)));
        return value === undefined ? new Response('not found', { status: 404 }) : new Response(value, { status: 200 });
      }) as unknown as typeof fetch;
      return createGitHubClient({ token: 'test-token', repo: 'gamedevpl/www.gamedev.pl-games', fetchImpl });
    };

    const blank = await clientFor([['games/raid/publish.ts', '   \n  ']]).getGameSources('main', 'raid', undefined, {
      entry: 'publish',
    });
    expect(blank?.gameJs).toContain('full-game');

    const fromOverlay = await clientFor([]).getGameSources(
      'main',
      'raid',
      {
        'index.html': '<canvas id="game"></canvas>',
        'game.ts': 'import "./game/secret.ts"; GameKit.mount({ full: "full-game" });',
        'game/secret.ts': 'export const secretMarker = "never-served";',
        'publish.ts': 'import "./game/preview.ts";',
        'game/preview.ts': 'GameKit.mount({ preview: "nature-only" });',
        'style.css': '.game { color: teal; }',
        'SPEC.md': specMd('Raid'),
        'GAME.json': JSON.stringify({ engine: { modules: ['input'] } }),
      },
      { noRefFallback: true, entry: 'publish' },
    );
    expect(fromOverlay?.gameJs).toContain('nature-only');
    expect(fromOverlay?.gameJs).not.toContain('never-served');
    expect(fromOverlay?.gameJs).not.toContain('full-game');
  });

  it('requests the publish entry from Studio live preview assembly', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');

    const { impl, objects } = stubGcs();
    const tarball = kitTarball({ 'shared/game-kit.d.ts': 'declare const GameKit: { boot(): void };' });
    objects.set(
      'kits/current.json',
      Buffer.from(JSON.stringify({ current: ENGINE_REF, previous: null, updatedAt: '2026-08-10T00:00:00.000Z' })),
    );
    objects.set(`kits/${ENGINE_REF}.tgz`, tarball);
    objects.set(
      `kits/${ENGINE_REF}.json`,
      Buffer.from(JSON.stringify({ sha256: createHash('sha256').update(tarball).digest('hex') })),
    );
    const games = createGcsGamesStore({ bucket: 'b', getAccessToken: async () => 'token', fetchImpl: impl });
    const objectStore = createGcsObjectStore({ bucket: 'b', getAccessToken: async () => 'token', fetchImpl: impl });

    for (const [path, content] of [
      ['game.ts', 'export const boot = 1;'],
      ['publish.ts', 'export const previewOnly = 1;'],
      [
        'GAME.json',
        JSON.stringify({
          engine: { modules: [] },
          howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
        }),
      ],
      ['style.css', '.game { color: gold; }'],
    ]) {
      await games.putStagedSourceFile({
        slug: 'sky-dodge',
        jobId: 10,
        roundGeneration: 1,
        path,
        content,
        stagedBy: 'owner',
      });
    }

    const getGameSources = vi.fn(async () => ({
      indexHtml: '<div id="game-root"></div>',
      gameJs: 'console.log("preview");',
      styleCss: '.game {}',
      title: 'Sky Dodge',
    }));
    const githubClient = { getGameSources } as unknown as GitHubClient;
    const app = await buildApp({
      store,
      sessionSecret: SESSION_SECRET,
      submissionRoutes: {
        submissionTokenSecret: 'test-submission-secret',
        agentChannel: { gamesStore: games, objectStore },
        githubClient,
        githubToken: 'test-github-token',
      },
      creatorCodeRoutes: { store, gamesStore: games, objectStore, githubClient },
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/me/studio/games/sky-dodge/sources/preview',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:creator', SESSION_SECRET)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(getGameSources).toHaveBeenCalledWith(
        ENGINE_REF,
        'sky-dodge',
        expect.objectContaining({ 'publish.ts': 'export const previewOnly = 1;' }),
        { entry: 'publish' },
      );
    } finally {
      await app.close();
    }
  });
});
