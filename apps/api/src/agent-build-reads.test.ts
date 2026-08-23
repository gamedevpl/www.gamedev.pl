import type { FastifyInstance } from 'fastify';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintAgentToken, STALE_AGENT_TOKEN_REASON } from './agent-surface/agent-token.js';
import { AGENT_BUILD_RULES_DIGEST } from './agent-build-brief.js';
import { listAgentBuildExamples } from './agent-build-examples.js';
import { buildApp } from './app.js';
import { MAX_PROJECT_BYTES } from './catalog/games-repo-contract.js';
import type { GcsObjectStore } from './delivery/gcs-sign.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './catalog/github-client.js';
import { KIT_ROOT_DIR } from './agent-surface/kit-registry.js';
import { InMemoryStore } from './store.js';

const secret = 'test-secret';
const ISSUE = 77;
const ENGINE = 'deadbeef0123456789abcdef0123456789abcdef';
const SHA = 'a'.repeat(64);
const TAR_BLOCK = 512;

function kitEntryBlocks(name: string, body: string | Buffer): Buffer {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const header = Buffer.alloc(TAR_BLOCK);
  header.write(name, 0, 100, 'utf8');
  header.write(`${payload.length.toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
  header.write('0', 156, 1, 'utf8');
  header.write('ustar\0', 257, 6, 'utf8');
  const padding = Buffer.alloc((TAR_BLOCK - (payload.length % TAR_BLOCK)) % TAR_BLOCK);
  return Buffer.concat([header, payload, padding]);
}

function packedKitTarball(files: Record<string, string | Buffer>): Buffer {
  const entries = Object.entries(files).map(([name, body]) =>
    kitEntryBlocks(name.startsWith(`${KIT_ROOT_DIR}/`) ? name : `${KIT_ROOT_DIR}/${name}`, body),
  );
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(TAR_BLOCK * 2)]));
}

function stubGitHub(): GitHubClient {
  return {
    createIssue: async () => ({ number: ISSUE }),
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    closePullRequest: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
  };
}

function agentHeaders(issueNumber = ISSUE, roundGeneration = 1) {
  return { authorization: `Bearer ${mintAgentToken(issueNumber, secret, { roundGeneration })}` };
}

function mockObjectStore(objects: Map<string, Buffer>, signedUrl = 'https://signed.example/kit.tgz'): GcsObjectStore {
  return {
    readObject: async (name) => objects.get(name) ?? null,
    objectExists: async (name) => objects.has(name),
    signReadUrl: async (name) => `${signedUrl}?object=${encodeURIComponent(name)}`,
  };
}

async function createApp(store: InMemoryStore, objectStore?: GcsObjectStore) {
  return await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      agentChannel: objectStore ? { objectStore } : {},
    },
  });
}

async function seedJob(store: InMemoryStore) {
  await store.createSubmission(ISSUE, 'g:owner', 'Comet Courier');
  await store.setSubmissionSlug(ISSUE, 'comet-courier');
  await store.setSubmissionLocale(ISSUE, 'pl');
  await store.setSubmissionBrief(ISSUE, {
    spec: 'Deliver parcels between comets while dodging debris.',
    qa: ['Pace: arcade', 'Tone: cheerful'],
  });
}

describe('agent build reads (BY-04)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  const readRoutes = [
    '/api/agent/build/brief',
    '/api/agent/build/seed',
    '/api/agent/build/kit',
    '/api/agent/build/kit/api',
    '/api/agent/build/kit/files',
    '/api/agent/build/kit/search?q=GameKit',
    '/api/agent/build/kit/file?path=SKILL.md',
    '/api/agent/build/kit/file/fragment?path=SKILL.md&limit=2',
    '/api/agent/build/examples',
    '/api/agent/build/examples/block-cascade',
  ];

  it('requires a build token on all four read endpoints (and examples/:slug)', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);

    for (const url of readRoutes) {
      const none = await app.inject({ method: 'GET', url });
      expect(none.statusCode, url).toBe(401);
      expect(none.json().error).toMatch(/missing build token/i);

      const bad = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: 'Bearer not-a-token' },
      });
      expect(bad.statusCode, url).toBe(401);
    }
  });

  it('rejects stale tokens with a strict 401 on the new read routes', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const stale = agentHeaders(ISSUE, 99);

    for (const url of readRoutes) {
      const res = await app.inject({ method: 'GET', url, headers: stale });
      expect(res.statusCode, url).toBe(401);
      expect(res.json().error).toBe(STALE_AGENT_TOKEN_REASON);
    }
  });

  it('returns the brief shape from the submission (spec, qa, rules, constraints, seedAvailable)', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    await store.setSubmissionSeed(ISSUE, {
      slug: 'comet-courier',
      files: [{ path: 'game.ts', content: 'export {}' }],
      references: ['block-cascade'],
      notes: 'start here',
    });
    await store.appendCreatorMessage(ISSUE, 'Make it harder');
    app = await createApp(store);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/brief', headers: agentHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      title: 'Comet Courier',
      slug: 'comet-courier',
      spec: 'Deliver parcels between comets while dodging debris.',
      qa: ['Pace: arcade', 'Tone: cheerful'],
      rules: AGENT_BUILD_RULES_DIGEST,
      constraints: { maxProjectBytes: MAX_PROJECT_BYTES, orientation: 'any' },
      locales: ['pl', 'en'],
      seedAvailable: true,
      seedStatus: 'available',
      seedNotice: expect.stringMatching(/get_sources/i),
    });
    expect(res.json().pendingMessages).toEqual([expect.objectContaining({ text: 'Make it harder' })]);
  });

  it('serves seed files when present and 404-shaped available:false when absent', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);

    const empty = await app.inject({ method: 'GET', url: '/api/agent/build/seed', headers: agentHeaders() });
    expect(empty.statusCode).toBe(404);
    expect(empty.json()).toEqual({
      available: false,
      status: 'unavailable',
      notice: expect.stringMatching(/npm run create/i),
      files: [],
      references: [],
      notes: null,
    });

    await store.setSeedStatus(ISSUE, 'pending');
    const pending = await app.inject({ method: 'GET', url: '/api/agent/build/seed', headers: agentHeaders() });
    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toMatchObject({
      available: false,
      status: 'pending',
      notice: expect.stringMatching(/get_sources/i),
    });

    await store.setSubmissionSeed(ISSUE, {
      slug: 'comet-courier',
      files: [
        { path: 'SPEC.md', content: '# Spec' },
        { path: 'game.ts', content: 'export {}' },
      ],
      references: ['crate-keeper'],
      notes: 'continue the draft',
    });

    const present = await app.inject({ method: 'GET', url: '/api/agent/build/seed', headers: agentHeaders() });
    expect(present.statusCode).toBe(200);
    expect(present.json()).toMatchObject({
      available: true,
      status: 'available',
      notice: expect.stringMatching(/get_sources/i),
      files: [
        { path: 'SPEC.md', content: '# Spec' },
        { path: 'game.ts', content: 'export {}' },
      ],
      references: ['crate-keeper'],
      notes: 'continue the draft',
    });
  });

  it('signs the current kit from kits/current.json and does not invent engineRefs', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const objects = new Map<string, Buffer>([
      [
        'kits/current.json',
        Buffer.from(
          JSON.stringify({
            current: ENGINE,
            previous: null,
            updatedAt: '2026-07-31T00:00:00.000Z',
          }),
        ),
      ],
      ['kits/' + ENGINE + '.json', Buffer.from(JSON.stringify({ sha256: SHA, packedAt: '2026-07-31T00:00:00.000Z' }))],
      ['kits/' + ENGINE + '.tgz', Buffer.from('fake-tarball')],
    ]);
    const signReadUrl = vi.fn(async (name: string) => `https://signed.example/${name}?sig=1`);
    const objectStore: GcsObjectStore = {
      ...mockObjectStore(objects),
      signReadUrl,
    };
    app = await createApp(store, objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/kit', headers: agentHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      engineRef: ENGINE,
      kitUrl: `https://signed.example/kits/${ENGINE}.tgz?sig=1`,
      sha256: SHA,
      entry: 'gamedevpl-creator-kit/SKILL.md',
    });
    expect(res.json().unpack).toBe(`curl -fsSL 'https://signed.example/kits/${ENGINE}.tgz?sig=1' | tar -xz`);
    expect(res.json().browse).toEqual({
      list: 'list_kit_files',
      search: 'search_kit_files',
      read: 'read_kit_file',
      readMany: 'read_kit_files',
      fragment: 'read_kit_file_fragment',
    });
    expect(signReadUrl).toHaveBeenCalledWith(`kits/${ENGINE}.tgz`, expect.any(Number));
  });

  it('serves the compacted kit API digest, defaulting to the registry current engine', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const digest = [
      '# gamedev.pl Creator Kit digest',
      '',
      '## Engine modules',
      '',
      '- `party` — multiple players on one shared screen.',
      '- `zone` — a world the server arbitrates, shared with strangers in real time.',
      '',
      '## GameKit API surface',
      '',
      '~~~typescript',
      'interface GameKitApi { locale: string; }',
      '~~~',
      '',
      '## Exemplar game',
      '',
      '### games/dodge-the-falling-rocks/game.ts',
      '',
      '~~~text',
      'export {};',
      '~~~',
      '',
      '## File-shape rules',
      '- Keep files small.',
    ].join('\n');
    const objects = new Map<string, Buffer>([
      [
        'kits/current.json',
        Buffer.from(JSON.stringify({ current: ENGINE, previous: null, updatedAt: '2026-08-09T00:00:00.000Z' })),
      ],
      [`kits/${ENGINE}.digest.md`, Buffer.from(digest)],
    ]);
    app = await createApp(store, mockObjectStore(objects));

    // No engineRef: falls back to the registry current entry.
    const noRef = await app.inject({ method: 'GET', url: '/api/agent/build/kit/api', headers: agentHeaders() });
    expect(noRef.statusCode).toBe(200);
    expect(noRef.json().engineRef).toBe(ENGINE);
    expect(noRef.json().digest).toMatch(/GameKitApi/);
    expect(noRef.json().digest).toMatch(/`party`/);
    expect(noRef.json().digest).toMatch(/`zone`/);

    // Explicit engineRef: reads that engine's digest object directly.
    const withRef = await app.inject({
      method: 'GET',
      url: `/api/agent/build/kit/api?engineRef=${ENGINE}`,
      headers: agentHeaders(),
    });
    expect(withRef.statusCode).toBe(200);
    expect(withRef.json().engineRef).toBe(ENGINE);
  });

  it('404s a missing digest object distinctly from a missing registry', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store, mockObjectStore(new Map()));

    const noRegistry = await app.inject({ method: 'GET', url: '/api/agent/build/kit/api', headers: agentHeaders() });
    expect(noRegistry.statusCode).toBe(404);
    expect(noRegistry.json().error).toBe('kit_registry_missing');

    const objects = new Map<string, Buffer>([
      [
        'kits/current.json',
        Buffer.from(JSON.stringify({ current: ENGINE, previous: null, updatedAt: '2026-08-09T00:00:00.000Z' })),
      ],
    ]);
    app = await createApp(store, mockObjectStore(objects));
    const noDigest = await app.inject({ method: 'GET', url: '/api/agent/build/kit/api', headers: agentHeaders() });
    expect(noDigest.statusCode).toBe(404);
    expect(noDigest.json().error).toBe('kit_artifact_missing');
  });

  it('pins the round to one engine even when the registry pointer advances', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const moved = 'f'.repeat(40);
    const registry = { current: ENGINE, previous: null, updatedAt: '2026-08-09T00:00:00.000Z' };
    const objects = new Map<string, Buffer>([
      ['kits/current.json', Buffer.from(JSON.stringify(registry))],
      [`kits/${ENGINE}.json`, Buffer.from(JSON.stringify({ sha256: SHA, packedAt: '2026-08-09T00:00:00.000Z' }))],
      [`kits/${ENGINE}.tgz`, Buffer.from('fake-tarball')],
      [`kits/${moved}.json`, Buffer.from(JSON.stringify({ sha256: SHA, packedAt: '2026-08-09T00:01:00.000Z' }))],
      [`kits/${moved}.tgz`, Buffer.from('fake-tarball-2')],
    ]);
    app = await createApp(store, {
      ...mockObjectStore(objects),
      signReadUrl: async (name: string) => `https://signed.example/${name}?sig=1`,
    });

    const first = await app.inject({ method: 'GET', url: '/api/agent/build/kit', headers: agentHeaders() });
    expect(first.json().engineRef).toBe(ENGINE);

    objects.set('kits/current.json', Buffer.from(JSON.stringify({ ...registry, current: moved })));
    const second = await app.inject({ method: 'GET', url: '/api/agent/build/kit', headers: agentHeaders() });

    expect(second.json().engineRef).toBe(ENGINE);
    expect(second.json().kitEngineChanged).toBeUndefined();
    expect(second.json().kitUrl).toContain(ENGINE);
  });

  it('replaces a pin whose kit has aged out, and says the engine moved', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const gone = 'c'.repeat(40);
    await store.pinRoundKitEngineRef(ISSUE, gone);
    const objects = new Map<string, Buffer>([
      [
        'kits/current.json',
        Buffer.from(JSON.stringify({ current: ENGINE, previous: null, updatedAt: '2026-08-09T00:00:00.000Z' })),
      ],
      [`kits/${ENGINE}.json`, Buffer.from(JSON.stringify({ sha256: SHA, packedAt: '2026-08-09T00:00:00.000Z' }))],
      [`kits/${ENGINE}.tgz`, Buffer.from('fake-tarball')],
    ]);
    app = await createApp(store, {
      ...mockObjectStore(objects),
      objectExists: async (name: string) => objects.has(name),
      signReadUrl: async (name: string) => `https://signed.example/${name}?sig=1`,
    });

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/kit', headers: agentHeaders() });

    expect(res.json().engineRef).toBe(ENGINE);
    expect(res.json().kitEngineChanged).toBe(true);
    expect((await store.getSubmission(ISSUE))?.roundKitEngineRef).toBe(ENGINE);
  });

  it('lists, searches, and reads kit files from the packed tarball over the channel', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const tgz = packedKitTarball({
      'SKILL.md': '# Kit\n\nUse GameKit.createCanvasGame.\n',
      'shared/modules/core.ts': 'export const core = 1; // GameKit\n',
      'shared/audio/beep.wav': Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]),
    });
    const objects = new Map<string, Buffer>([
      [
        'kits/current.json',
        Buffer.from(
          JSON.stringify({
            current: ENGINE,
            previous: null,
            updatedAt: '2026-07-31T00:00:00.000Z',
          }),
        ),
      ],
      ['kits/' + ENGINE + '.json', Buffer.from(JSON.stringify({ sha256: SHA, packedAt: '2026-07-31T00:00:00.000Z' }))],
      ['kits/' + ENGINE + '.tgz', tgz],
    ]);
    app = await createApp(store, mockObjectStore(objects));

    const listed = await app.inject({
      method: 'GET',
      url: '/api/agent/build/kit/files?prefix=shared',
      headers: agentHeaders(),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().engineRef).toBe(ENGINE);
    expect(listed.json().files.every((f: { path: string }) => f.path.includes('/shared/'))).toBe(true);

    const searched = await app.inject({
      method: 'GET',
      url: '/api/agent/build/kit/search?q=createCanvasGame',
      headers: agentHeaders(),
    });
    expect(searched.statusCode).toBe(200);
    expect(searched.json().matches[0]).toMatchObject({
      path: `${KIT_ROOT_DIR}/SKILL.md`,
      line: expect.any(Number),
    });

    const read = await app.inject({
      method: 'GET',
      url: '/api/agent/build/kit/file?path=SKILL.md',
      headers: agentHeaders(),
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().content).toMatch(/Creator Kit|# Kit/);

    const fragment = await app.inject({
      method: 'GET',
      url: '/api/agent/build/kit/file/fragment?path=SKILL.md&unit=lines&offset=0&limit=1',
      headers: agentHeaders(),
    });
    expect(fragment.statusCode).toBe(200);
    expect(fragment.json().content).toBe('# Kit');
    expect(fragment.json().eof).toBe(false);

    const batch = await app.inject({
      method: 'POST',
      url: '/api/agent/build/kit/files/read',
      headers: { ...agentHeaders(), 'content-type': 'application/json' },
      payload: { paths: ['SKILL.md', 'shared/modules/core.ts', 'missing.md'] },
    });
    expect(batch.statusCode).toBe(200);
    expect(batch.json().files).toHaveLength(3);
    expect(batch.json().files[0]).toMatchObject({ ok: true, path: `${KIT_ROOT_DIR}/SKILL.md` });
    expect(batch.json().files[2]).toMatchObject({ ok: false, error: 'kit_file_missing' });
  });

  it('returns a machine-readable error when kits/current.json is missing', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store, mockObjectStore(new Map()));

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/kit', headers: agentHeaders() });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'kit_registry_missing' });
  });

  it('lists exemplars from the in-repo allowlist only', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/examples', headers: agentHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().examples).toEqual(listAgentBuildExamples());
    expect(res.json().examples.every((e: { slug: string }) => typeof e.slug === 'string')).toBe(true);
    expect(res.json().examples[0]).toMatchObject({
      slug: expect.any(String),
      title: expect.any(String),
      genre: expect.any(String),
      modules: expect.any(Array),
      whyReference: expect.any(String),
    });
  });

  it('404s unknown and non-allowlisted example slugs; signs allowlisted ones', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const objects = new Map<string, Buffer>([
      ['examples/block-cascade.tgz', Buffer.from('tgz')],
      ['examples/block-cascade.json', Buffer.from(JSON.stringify({ sha256: SHA }))],
      // A creator game sitting in the bucket must never become reachable by slug alone.
      ['examples/secret-creator-game.tgz', Buffer.from('nope')],
    ]);
    app = await createApp(store, mockObjectStore(objects, 'https://signed.example/ex.tgz'));

    const unknown = await app.inject({
      method: 'GET',
      url: '/api/agent/build/examples/not-a-real-game',
      headers: agentHeaders(),
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error).toBe('unknown_example');

    const leaked = await app.inject({
      method: 'GET',
      url: '/api/agent/build/examples/secret-creator-game',
      headers: agentHeaders(),
    });
    expect(leaked.statusCode).toBe(404);
    expect(leaked.json().error).toBe('unknown_example');

    const ok = await app.inject({
      method: 'GET',
      url: '/api/agent/build/examples/block-cascade',
      headers: agentHeaders(),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      slug: 'block-cascade',
      title: 'Block Cascade',
      sha256: SHA,
      tarballUrl: expect.stringContaining('examples%2Fblock-cascade.tgz'),
    });
  });

  describe('exemplar files for fetchless agents (BY-28a)', () => {
    const BLOCK = 512;

    function entryBlocks(name: string, body: string): Buffer {
      const payload = Buffer.from(body, 'utf8');
      const header = Buffer.alloc(BLOCK);
      header.write(name, 0, 100, 'utf8');
      header.write(`${payload.length.toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
      header.write('0', 156, 1, 'utf8');
      header.write('ustar\0', 257, 6, 'utf8');
      const padding = Buffer.alloc((BLOCK - (payload.length % BLOCK)) % BLOCK);
      return Buffer.concat([header, payload, padding]);
    }

    function exampleObjects() {
      const tarball = gzipSync(
        Buffer.concat([
          entryBlocks('games/block-cascade/SPEC.md', '---\ntitle: Block Cascade\n---\n'),
          entryBlocks('games/block-cascade/game.ts', 'export const tick = () => {};'),
          Buffer.alloc(BLOCK * 2),
        ]),
      );
      return new Map<string, Buffer>([
        ['examples/block-cascade.tgz', tarball],
        // Present in the bucket, absent from the allowlist — must stay unreachable.
        ['examples/secret-creator-game.tgz', tarball],
      ]);
    }

    it('lists and reads an allowlisted exemplar without any fetching', async () => {
      const store = new InMemoryStore();
      await seedJob(store);
      app = await createApp(store, mockObjectStore(exampleObjects()));

      const list = await app.inject({
        method: 'GET',
        url: '/api/agent/build/examples/block-cascade/files',
        headers: agentHeaders(),
      });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({ slug: 'block-cascade', total: 2, truncated: false });
      expect(list.json().files.map((f: { path: string }) => f.path)).toEqual([
        'games/block-cascade/game.ts',
        'games/block-cascade/SPEC.md',
      ]);

      // Relative path, as an agent would paste it from a listing.
      const read = await app.inject({
        method: 'GET',
        url: '/api/agent/build/examples/block-cascade/file?path=game.ts',
        headers: agentHeaders(),
      });
      expect(read.statusCode).toBe(200);
      expect(read.json()).toMatchObject({
        slug: 'block-cascade',
        path: 'games/block-cascade/game.ts',
        encoding: 'utf8',
        content: 'export const tick = () => {};',
      });
    });

    it('applies the same allowlist as the tarball route, and refuses traversal', async () => {
      const store = new InMemoryStore();
      await seedJob(store);
      app = await createApp(store, mockObjectStore(exampleObjects()));

      for (const url of [
        '/api/agent/build/examples/secret-creator-game/files',
        '/api/agent/build/examples/secret-creator-game/file?path=game.ts',
      ]) {
        const res = await app.inject({ method: 'GET', url, headers: agentHeaders() });
        expect(res.statusCode, url).toBe(404);
        expect(res.json().error).toBe('unknown_example');
      }

      const traversal = await app.inject({
        method: 'GET',
        url: '/api/agent/build/examples/block-cascade/file?path=../../kits/current.json',
        headers: agentHeaders(),
      });
      expect(traversal.statusCode).toBe(400);
      expect(traversal.json().error).toBe('example_path_invalid');
    });

    it('requires a build token like every other read', async () => {
      const store = new InMemoryStore();
      await seedJob(store);
      app = await createApp(store, mockObjectStore(exampleObjects()));

      for (const url of [
        '/api/agent/build/examples/block-cascade/files',
        '/api/agent/build/examples/block-cascade/file?path=game.ts',
      ]) {
        const none = await app.inject({ method: 'GET', url });
        expect(none.statusCode, url).toBe(401);

        const stale = await app.inject({ method: 'GET', url, headers: agentHeaders(ISSUE, 99) });
        expect(stale.statusCode, url).toBe(401);
        expect(stale.json().error).toBe(STALE_AGENT_TOKEN_REASON);
      }
    });
  });
});
