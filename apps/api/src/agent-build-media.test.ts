import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintAgentToken, STALE_AGENT_TOKEN_REASON } from './agent-token.js';
import { buildApp } from './app.js';
import type { GamesStore } from './games-store.js';
import type { GcsObjectStore } from './gcs-sign.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './github-client.js';
import { InMemoryStore } from './store.js';
import { NoopTranslator } from './translate.js';

/**
 * BY-28 — the gate's own media, read back over the channel.
 *
 * The posture under test is the agent that cannot run the game: it delivers, the gate
 * runs, and everything it knows about the result is prose. These cases pin the two
 * properties that make the read safe to expose — filenames come only from the
 * validated metadata allowlist, and URLs are signed under this job's own slug+version.
 */

const secret = 'test-secret';
const ISSUE = 91;
const SLUG = 'comet-courier';
const VERSION = 'v20260803T101500000-abc123';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

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

const METADATA = JSON.stringify({
  captures: {
    opening: { file: 'opening.png' },
    engagement: { file: 'engagement.png' },
  },
  video: { file: 'gameplay.mp4' },
});

/** Derived artifacts as the gate would have left them for one delivered version. */
function stubGamesStore(
  overrides: {
    artifacts?: Map<string, Buffer>;
    manifest?: unknown;
  } = {},
) {
  const artifacts =
    overrides.artifacts ??
    new Map<string, Buffer>([
      ['media/metadata.json', Buffer.from(METADATA)],
      ['media/opening.png', PNG],
      ['media/engagement.png', PNG],
      ['media/gameplay.mp4', Buffer.from('mp4-bytes')],
    ]);
  const manifest =
    overrides.manifest === undefined
      ? { slug: SLUG, version: VERSION, gate: { green: true, ranAt: '2026-08-03T10:20:00.000Z' } }
      : overrides.manifest;
  return {
    getManifest: async (slug: string, version: string) => (slug === SLUG && version === VERSION ? manifest : null),
    getDerivedArtifact: async (slug: string, version: string, name: string) =>
      slug === SLUG && version === VERSION ? (artifacts.get(name) ?? null) : null,
    getSourceFile: async () => null,
    putCandidateSources: async () => ({ version: VERSION, manifest: {} as never }),
    putGateResult: async () => {},
    putDerivedArtifact: async () => {},
    getKitRegistry: async () => null,
  } as unknown as GamesStore;
}

function stubObjectStore(signReadUrl = vi.fn(async (name: string) => `https://signed.example/${name}?sig=1`)) {
  return {
    objectStore: {
      readObject: async () => null,
      objectExists: async () => true,
      signReadUrl,
    } as GcsObjectStore,
    signReadUrl,
  };
}

async function createApp(store: InMemoryStore, gamesStore?: GamesStore, objectStore?: GcsObjectStore) {
  return await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      translator: new NoopTranslator(),
      agentChannel: { ...(gamesStore ? { gamesStore } : {}), ...(objectStore ? { objectStore } : {}) },
    },
  });
}

async function seedDeliveredJob(store: InMemoryStore) {
  await store.createSubmission(ISSUE, 'g:owner', 'Comet Courier');
  await store.setSubmissionSlug(ISSUE, SLUG);
  await store.setSubmissionDeliveredVersion(ISSUE, VERSION);
}

describe('GET /api/agent/build/media (BY-28)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('requires a build token, like every other channel read', async () => {
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    app = await createApp(store, stubGamesStore(), stubObjectStore().objectStore);

    const none = await app.inject({ method: 'GET', url: '/api/agent/build/media' });
    expect(none.statusCode).toBe(401);
    expect(none.json().error).toMatch(/missing build token/i);

    const bad = await app.inject({
      method: 'GET',
      url: '/api/agent/build/media',
      headers: { authorization: 'Bearer not-a-token' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('signs every allowlisted capture and the video under the slug+version this job owns', async () => {
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const { objectStore, signReadUrl } = stubObjectStore();
    app = await createApp(store, stubGamesStore(), objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      available: true,
      deliveryId: VERSION,
      gate: { green: true, ranAt: '2026-08-03T10:20:00.000Z' },
      video: {
        file: 'gameplay.mp4',
        url: `https://signed.example/games/${SLUG}/versions/${VERSION}/media/gameplay.mp4?sig=1`,
      },
    });
    expect(body.screenshots).toEqual([
      {
        name: 'opening',
        file: 'opening.png',
        url: `https://signed.example/games/${SLUG}/versions/${VERSION}/media/opening.png?sig=1`,
      },
      {
        name: 'engagement',
        file: 'engagement.png',
        url: `https://signed.example/games/${SLUG}/versions/${VERSION}/media/engagement.png?sig=1`,
      },
    ]);
    expect(body.expiresInSeconds).toBeGreaterThan(0);
    // Every signed object sits under this job's own game and delivery — nothing else
    // is reachable no matter what the round asks for.
    for (const [name] of signReadUrl.mock.calls) {
      expect(name).toMatch(new RegExp(`^games/${SLUG}/versions/${VERSION}/media/`));
    }
    // The inline frame is the opening shot, so a client that cannot fetch a URL still
    // sees the game.
    expect(body.openingShot).toEqual({ file: 'opening.png', png: PNG.toString('base64') });
  });

  it('serves only filenames the validated metadata declares', async () => {
    // A capture directory can hold more than the metadata vouches for; the allowlist
    // is the metadata, exactly as on the published-media route.
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const artifacts = new Map<string, Buffer>([
      ['media/metadata.json', Buffer.from(JSON.stringify({ captures: { opening: { file: 'opening.png' } } }))],
      ['media/opening.png', PNG],
      ['media/leftover-debug.png', PNG],
    ]);
    const { objectStore, signReadUrl } = stubObjectStore();
    app = await createApp(store, stubGamesStore({ artifacts }), objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(200);
    expect(res.json().screenshots).toEqual([expect.objectContaining({ file: 'opening.png' })]);
    expect(res.json().video).toBeNull();
    expect(signReadUrl.mock.calls.map(([name]) => name)).not.toContain(
      `games/${SLUG}/versions/${VERSION}/media/leftover-debug.png`,
    );
  });

  it('falls back to the manifest screenshot when a red run stored frames but no metadata', async () => {
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const artifacts = new Map<string, Buffer>([['media/opening.png', PNG]]);
    const manifest = {
      slug: SLUG,
      version: VERSION,
      gate: { green: false, ranAt: '2026-08-03T10:20:00.000Z', screenshot: 'media/opening.png' },
    };
    app = await createApp(store, stubGamesStore({ artifacts, manifest }), stubObjectStore().objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: true, gate: { green: false } });
    expect(res.json().screenshots).toEqual([expect.objectContaining({ name: 'opening', file: 'opening.png' })]);
  });

  it('says nothing is available before a delivery, rather than erroring', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(ISSUE, 'g:owner', 'Comet Courier');
    await store.setSubmissionSlug(ISSUE, SLUG);
    app = await createApp(store, stubGamesStore(), stubObjectStore().objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: false, deliveryId: null });
    expect(res.json().reason).toMatch(/nothing has been delivered/i);
  });

  it('says nothing is available when the gate stored no media', async () => {
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    app = await createApp(store, stubGamesStore({ artifacts: new Map() }), stubObjectStore().objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: false, deliveryId: VERSION });
  });

  it('refuses a version that does not resolve under the slug this job owns', async () => {
    // The manifest read is the ownership proof: a version id borrowed from another
    // game simply does not exist here, so nothing is signed for it.
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const { objectStore, signReadUrl } = stubObjectStore();
    app = await createApp(store, stubGamesStore(), objectStore);

    const res = await app.inject({
      method: 'GET',
      url: '/api/agent/build/media?version=v20260101T000000000-ffffff',
      headers: agentHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: false, reason: 'no such delivery' });
    expect(signReadUrl).not.toHaveBeenCalled();
  });

  it('rejects a version argument that is not shaped like a version id', async () => {
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const { objectStore, signReadUrl } = stubObjectStore();
    app = await createApp(store, stubGamesStore(), objectStore);

    const res = await app.inject({
      method: 'GET',
      url: `/api/agent/build/media?version=${encodeURIComponent('../../other-game/versions/v1')}`,
      headers: agentHeaders(),
    });

    expect(res.statusCode).toBe(400);
    expect(signReadUrl).not.toHaveBeenCalled();
  });

  it('answers a retired key for the delivery its round owns, and refuses any other', async () => {
    // Terminal receipt, same rule as the verdict read: green closes the round, and
    // post-green is exactly when the agent wants the frames to show the creator.
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    await store.bumpRoundGeneration(ISSUE);
    app = await createApp(store, stubGamesStore(), stubObjectStore().objectStore);

    const receipt = await app.inject({
      method: 'GET',
      url: '/api/agent/build/media',
      headers: agentHeaders(ISSUE, 1),
    });
    expect(receipt.statusCode).toBe(200);
    expect(receipt.json()).toMatchObject({ available: true, access: 'terminal_receipt' });

    const otherDelivery = await app.inject({
      method: 'GET',
      url: '/api/agent/build/media?version=v20260101T000000000-ffffff',
      headers: agentHeaders(ISSUE, 1),
    });
    expect(otherDelivery.statusCode).toBe(401);
    expect(otherDelivery.json().error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('rejects a key more than one generation behind', async () => {
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    await store.bumpRoundGeneration(ISSUE);
    await store.bumpRoundGeneration(ISSUE);
    app = await createApp(store, stubGamesStore(), stubObjectStore().objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders(ISSUE, 1) });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('answers 503 rather than half a result when the media store is unconfigured', async () => {
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    app = await createApp(store);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(503);
  });
});
