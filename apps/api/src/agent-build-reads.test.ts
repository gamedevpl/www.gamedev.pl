import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintAgentToken, STALE_AGENT_TOKEN_REASON } from './agent-token.js';
import { AGENT_BUILD_RULES_DIGEST } from './agent-build-brief.js';
import { listAgentBuildExamples } from './agent-build-examples.js';
import { buildApp } from './app.js';
import { MAX_PROJECT_BYTES } from './games-repo-contract.js';
import type { GcsObjectStore } from './gcs-sign.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './github-client.js';
import { InMemoryStore } from './store.js';
import { NoopTranslator } from './translate.js';

const secret = 'test-secret';
const ISSUE = 77;
const ENGINE = 'deadbeef0123456789abcdef0123456789abcdef';
const SHA = 'a'.repeat(64);

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
      translator: new NoopTranslator(),
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
    });
    expect(res.json().pendingMessages).toEqual([expect.objectContaining({ text: 'Make it harder' })]);
  });

  it('serves seed files when present and 404-shaped available:false when absent', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);

    const empty = await app.inject({ method: 'GET', url: '/api/agent/build/seed', headers: agentHeaders() });
    expect(empty.statusCode).toBe(404);
    expect(empty.json()).toEqual({ available: false, files: [], references: [], notes: null });

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
    expect(present.json()).toEqual({
      available: true,
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
      entry: 'SKILL.md',
    });
    expect(res.json().unpack).toBe(
      `curl -fsSL 'https://signed.example/kits/${ENGINE}.tgz?sig=1' | tar -xz && cd gamedevpl-creator-kit`,
    );
    expect(signReadUrl).toHaveBeenCalledWith(`kits/${ENGINE}.tgz`, expect.any(Number));
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
});
