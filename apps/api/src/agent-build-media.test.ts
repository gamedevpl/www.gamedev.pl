import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintAgentToken, STALE_AGENT_TOKEN_REASON } from './agent-surface/agent-token.js';
import { buildApp } from './app.js';
import type { GamesStore } from './delivery/games-store.js';
import type { GcsObjectStore } from './delivery/gcs-sign.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './catalog/github-client.js';
import { InMemoryStore } from './store.js';

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
      ? {
          slug: SLUG,
          version: VERSION,
          // The job that produced this delivery — the ownership check, since a slug
          // is shared by every improvement round on the same game.
          issueNumber: ISSUE,
          gate: { green: true, ranAt: '2026-08-03T10:20:00.000Z' },
        }
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

function stubObjectStore(
  signReadUrl = vi.fn(async (name: string) => `https://signed.example/${name}?sig=1`),
  /** Which objects actually landed; the gate tolerates a per-file upload failure. */
  objectExists: (name: string) => Promise<boolean> = async () => true,
) {
  return {
    objectStore: {
      readObject: async () => null,
      objectExists,
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
    // sees the game. Default is one frame, not all of them.
    expect(body.frames).toEqual([{ file: 'opening.png', name: 'opening', png: PNG.toString('base64') }]);
    // The video is URL-only, and the payload says so — the agent that needs to know is
    // the one that cannot test a URL to find out.
    expect(body.videoNote).toMatch(/only as a URL/i);
  });

  it('attaches every frame on frames=all, one on the default, none on frames=none', async () => {
    // A ChatGPT-side connector can call our tools and nothing else — no shell, no fetch
    // (owner test, 2026-08-03). For that client a signed URL is a blank experience, so
    // the bytes have to ride the reply. Bounded, because each frame costs context.
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    app = await createApp(store, stubGamesStore(), stubObjectStore().objectStore);

    const all = await app.inject({
      method: 'GET',
      url: '/api/agent/build/media?frames=all',
      headers: agentHeaders(),
    });
    expect(all.json().frames.map((f: { name: string }) => f.name)).toEqual(['opening', 'engagement']);

    const none = await app.inject({
      method: 'GET',
      url: '/api/agent/build/media?frames=none',
      headers: agentHeaders(),
    });
    expect(none.json().frames).toEqual([]);
    // URLs are unaffected by the frame budget — a shell-capable agent still gets both.
    expect(none.json().screenshots).toHaveLength(2);

    const dflt = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });
    expect(dflt.json().frames).toHaveLength(1);
    expect(dflt.json().frames[0].name).toBe('opening');
  });

  it('keeps the byte budget a ceiling, counting the frame it is about to add', async () => {
    // Checking the running total *before* appending makes the budget a floor: three
    // frames each under the per-shot cap still land ~2.1 MB together against a 1.4 MB
    // limit. Codex #516 P2.
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const big = Buffer.alloc(600 * 1024, 7);
    const metadata = JSON.stringify({
      captures: { opening: { file: 'opening.png' }, a: { file: 'a.png' }, b: { file: 'b.png' } },
    });
    const artifacts = new Map<string, Buffer>([
      ['media/metadata.json', Buffer.from(metadata)],
      ['media/opening.png', big],
      ['media/a.png', big],
      ['media/b.png', big],
    ]);
    app = await createApp(store, stubGamesStore({ artifacts }), stubObjectStore().objectStore);

    const res = await app.inject({
      method: 'GET',
      url: '/api/agent/build/media?frames=all',
      headers: agentHeaders(),
    });

    // Two fit inside 1.4 MB; the third would cross it and is reported, not carried.
    const body = res.json();
    expect(body.frames).toHaveLength(2);
    expect(body.framesOmitted).toBe(1);
    const decoded = body.frames.reduce(
      (sum: number, f: { png: string }) => sum + Buffer.from(f.png, 'base64').length,
      0,
    );
    expect(decoded).toBeLessThanOrEqual(1_400 * 1024);
  });

  it('reports frames the budget dropped rather than silently truncating', async () => {
    // A caller told it has every frame when it has three is worse off than one that
    // knows it is looking at a subset.
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const many = {
      captures: Object.fromEntries(
        ['opening', 'a', 'b', 'c', 'd'].map((name) => [name, { file: `${name === 'opening' ? 'opening' : name}.png` }]),
      ),
    };
    const artifacts = new Map<string, Buffer>([['media/metadata.json', Buffer.from(JSON.stringify(many))]]);
    for (const name of ['opening', 'a', 'b', 'c', 'd']) artifacts.set(`media/${name}.png`, PNG);
    app = await createApp(store, stubGamesStore({ artifacts }), stubObjectStore().objectStore);

    const res = await app.inject({
      method: 'GET',
      url: '/api/agent/build/media?frames=all',
      headers: agentHeaders(),
    });

    expect(res.json().frames).toHaveLength(3);
    expect(res.json().framesOmitted).toBe(2);
    // All five are still reachable by URL for a client that can follow one.
    expect(res.json().screenshots).toHaveLength(5);
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
      issueNumber: ISSUE,
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
    expect(res.json()).toMatchObject({ available: false, reason: 'no such delivery for this build' });
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

  it('serves preview-lane stills, and says which lane took them', async () => {
    // BY-28a: before preview stills, a delivery on the cheap lane had no media at all,
    // so an agent that cannot run the game iterated on prose. The lane must be stated —
    // a preview pass is not publish readiness, and `green` alone would read as sealed.
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const manifest = {
      slug: SLUG,
      version: VERSION,
      issueNumber: ISSUE,
      previewGate: { green: true, ranAt: '2026-08-03T20:00:00.000Z', screenshot: 'media/opening.png' },
    };
    app = await createApp(store, stubGamesStore({ manifest }), stubObjectStore().objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      available: true,
      deliveryId: VERSION,
      gate: { green: true, lane: 'preview' },
    });
    expect(res.json().frames).toHaveLength(1);
  });

  it('falls back to the preview screenshot when a run stored frames but no metadata', async () => {
    // The path the lane change actually adds. With metadata present the allowlist does
    // the work and previewGate.screenshot is never consulted, so a test that keeps the
    // default artifacts proves lane reporting and nothing else (Copilot, #583).
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const artifacts = new Map<string, Buffer>([['media/opening.png', PNG]]);
    const manifest = {
      slug: SLUG,
      version: VERSION,
      issueNumber: ISSUE,
      previewGate: { green: true, ranAt: '2026-08-05T06:00:00.000Z', screenshot: 'media/opening.png' },
    };
    app = await createApp(store, stubGamesStore({ artifacts, manifest }), stubObjectStore().objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: true, gate: { lane: 'preview' } });
    expect(res.json().screenshots).toEqual([
      { name: 'opening', file: 'opening.png', url: expect.stringContaining('opening.png') },
    ]);
    expect(res.json().frames).toHaveLength(1);
  });

  it('serves a preview frame when the publish verdict names none', async () => {
    // Publish wins the verdict, but not the evidence: a publish run that failed before
    // capture names no screenshot, and preferring its silence would report "no media"
    // while the preview frame sits in the bucket (Copilot, #583).
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const artifacts = new Map<string, Buffer>([['media/opening.png', PNG]]);
    const manifest = {
      slug: SLUG,
      version: VERSION,
      issueNumber: ISSUE,
      previewGate: { green: true, ranAt: '2026-08-05T06:00:00.000Z', screenshot: 'media/opening.png' },
      gate: { green: false, ranAt: '2026-08-05T06:30:00.000Z' },
    };
    app = await createApp(store, stubGamesStore({ artifacts, manifest }), stubObjectStore().objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.json()).toMatchObject({ available: true, gate: { green: false, lane: 'publish' } });
    expect(res.json().frames).toHaveLength(1);
  });

  it('prefers the publish verdict when a delivery has both', async () => {
    // Publish is the later, fuller run and its media is what a creator would be shown.
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const manifest = {
      slug: SLUG,
      version: VERSION,
      issueNumber: ISSUE,
      previewGate: { green: true, ranAt: '2026-08-03T20:00:00.000Z' },
      gate: { green: false, ranAt: '2026-08-03T21:00:00.000Z' },
    };
    app = await createApp(store, stubGamesStore({ manifest }), stubObjectStore().objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.json().gate).toMatchObject({ green: false, lane: 'publish' });
  });

  it('refuses a version delivered by a different job on the same slug', async () => {
    // Every improvement round is a new job that inherits the published slug, so an
    // earlier round's version resolves fine under this one's slug — and after a slug
    // transfer that earlier job can belong to a different creator. The manifest's own
    // issueNumber is the ownership check; the slug never was one. Codex #506 P2.
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const EARLIER_JOB_VERSION = 'v20260101T090000000-aaaaaa';
    const gamesStore = {
      getManifest: async (slug: string, version: string) =>
        slug === SLUG && version === EARLIER_JOB_VERSION
          ? // Same slug, different job — a predecessor round's delivery.
            { slug: SLUG, version: EARLIER_JOB_VERSION, issueNumber: ISSUE - 7, gate: { green: true, ranAt: 'x' } }
          : null,
      getDerivedArtifact: async () => Buffer.from(METADATA),
      getSourceFile: async () => null,
      putCandidateSources: async () => ({ version: VERSION, manifest: {} as never }),
      putGateResult: async () => {},
      putDerivedArtifact: async () => {},
      getKitRegistry: async () => null,
    } as unknown as GamesStore;
    const { objectStore, signReadUrl } = stubObjectStore();
    app = await createApp(store, gamesStore, objectStore);

    const res = await app.inject({
      method: 'GET',
      url: `/api/agent/build/media?version=${EARLIER_JOB_VERSION}`,
      headers: agentHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: false, reason: 'no such delivery for this build' });
    // Nothing was signed — the refusal happens before any URL exists.
    expect(signReadUrl).not.toHaveBeenCalled();
    // Absent and not-yours read identically, so a round cannot enumerate what its
    // predecessors delivered.
    const absent = await app.inject({
      method: 'GET',
      url: '/api/agent/build/media?version=v20260101T000000000-ffffff',
      headers: agentHeaders(),
    });
    expect(absent.json().reason).toBe(res.json().reason);
  });

  it('does not advertise media whose upload never landed', async () => {
    // The gate writes each media file independently and swallows a per-file failure to
    // protect the verdict, so metadata.json can name an mp4 that is not in the bucket.
    // Signing it would hand the agent a dead URL to show the creator. Codex #506 P2.
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const { objectStore, signReadUrl } = stubObjectStore(
      vi.fn(async (name: string) => `https://signed.example/${name}?sig=1`),
      async (name: string) => !name.endsWith('gameplay.mp4') && !name.endsWith('engagement.png'),
    );
    app = await createApp(store, stubGamesStore(), objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(200);
    expect(res.json().video).toBeNull();
    expect(res.json().screenshots).toEqual([
      { name: 'opening', file: 'opening.png', url: expect.stringContaining('opening.png') },
    ]);
    expect(signReadUrl).not.toHaveBeenCalledWith(expect.stringContaining('gameplay.mp4'), expect.anything());
    expect(signReadUrl).not.toHaveBeenCalledWith(expect.stringContaining('engagement.png'), expect.anything());
  });

  it('reports unavailable when metadata names files but none of them landed', async () => {
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    const { objectStore, signReadUrl } = stubObjectStore(
      vi.fn(async (name: string) => `https://signed.example/${name}?sig=1`),
      async () => false,
    );
    app = await createApp(store, stubGamesStore(), objectStore);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: false, reason: 'the gate stored no media for this delivery' });
    expect(signReadUrl).not.toHaveBeenCalled();
  });

  it('answers 503 rather than half a result when the media store is unconfigured', async () => {
    const store = new InMemoryStore();
    await seedDeliveredJob(store);
    app = await createApp(store);

    const res = await app.inject({ method: 'GET', url: '/api/agent/build/media', headers: agentHeaders() });

    expect(res.statusCode).toBe(503);
  });
});
