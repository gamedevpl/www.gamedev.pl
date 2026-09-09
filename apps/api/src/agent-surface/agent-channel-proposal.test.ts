import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintAgentToken } from '../platform/agent-token.js';
import { buildApp } from '../platform/app.js';
import type { GamesStore } from '../delivery/games-store.js';
import { DREAM_FRAME_SHOT_LABEL, DREAM_SOURCE_SHOT_LABEL } from '../platform/dream-shots.js';
import { pngHeader } from '../platform/image-size.test.js';
import { InMemoryStore } from '../platform/store.js';

const secret = 'test-secret';
const ISSUE = 42;
const VERSION = 'v7';
const SOURCE = pngHeader(900, 900);

function agentHeaders(jobId = ISSUE, roundGeneration = 1) {
  return { authorization: `Bearer ${mintAgentToken(jobId, secret, { roundGeneration })}` };
}

function stubGamesStore(screenshot: string | null = 'opening.png'): GamesStore {
  return {
    getManifest: async () => (screenshot ? { previewGate: { green: true, screenshot } } : {}),
    getDerivedArtifact: async () => SOURCE,
  } as unknown as GamesStore;
}

async function createApp(store: InMemoryStore, gamesStore: GamesStore) {
  await store.upsertUser({ uid: 'g:owner' });
  return await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubClient: {
        getIssueState: async () => ({ state: 'open' as const }),
        findLinkedPR: async () => null,
        createIssueComment: async () => ({ id: 1 }),
        updateIssueBody: async () => {},
        closeIssue: async () => {},
        ensureOpenPullRequest: async () => ({ number: 1 }),
        deleteBranch: async () => {},
        getGameSources: async () => null,
        getGameMedia: async () => null,
        getCatalog: async () => [],
        getProgressNotes: async () => null,
      },
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
      dreamAvailabilityGate: { dreamingEnabled: async () => true, spendFrameSlot: async () => true },
    },
  });
}

async function seed(store: InMemoryStore) {
  await store.createSubmission(ISSUE, 'g:owner', 'Squad game');
  await store.setSubmissionSlug(ISSUE, 'squad-game');
  await store.setSubmissionPreviewVersion(ISSUE, VERSION);
}

async function uploadConceptFrame(app: FastifyInstance, png: Buffer = pngHeader(900, 900), round = 1): Promise<string> {
  const minted = await app.inject({
    method: 'POST',
    url: '/api/agent/build/shot/upload-url',
    headers: agentHeaders(ISSUE, round),
    payload: { purpose: 'concept' },
  });
  const token = new URL(minted.json().url).searchParams.get('token');
  const put = await app.inject({
    method: 'PUT',
    url: `/api/agent/build/shot/upload?token=${encodeURIComponent(token ?? '')}`,
    headers: { 'content-type': 'image/png' },
    payload: png,
  });
  return put.json().shot.id as string;
}

// Stores a frame the way a completed upload would.
async function storeConceptFrame(store: InMemoryStore): Promise<string> {
  const shot = await store.appendBuildShot(ISSUE, {
    data: pngHeader(900, 900).toString('base64'),
    label: DREAM_FRAME_SHOT_LABEL,
    roundGeneration: 1,
    deliveryVersion: VERSION,
  });
  return shot.id;
}

function options(frameIds: string[]) {
  return {
    options: frameIds.map((frameId, index) => ({
      label: `Direction ${index + 1}`,
      prompt: `Make the world feel ${index === 0 ? 'colder' : 'warmer'}.`,
      frameId,
    })),
  };
}

async function propose(app: FastifyInstance, frameIds: string[], round = 1) {
  return await app.inject({
    method: 'POST',
    url: '/api/agent/build/proposal',
    headers: agentHeaders(ISSUE, round),
    payload: options(frameIds),
  });
}

describe('agent-written concept proposals', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    vi.unstubAllEnvs();
  });

  it('posts a studio proposal grounded in the gate capture', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const frames = [await uploadConceptFrame(app), await uploadConceptFrame(app)];
    const response = await propose(app, frames);

    expect(response.statusCode).toBe(200);
    expect(response.json().accepted).toBe(true);
    const messages = await store.listCreatorMessages(ISSUE);
    const proposal = messages.at(-1)?.proposal;
    expect(proposal?.version).toBe(VERSION);
    expect(proposal?.options.map((option) => option.frameRef)).toEqual(frames);
    // The compared frame is the platform's, not the agent's.
    const shots = await store.listBuildShots(ISSUE);
    expect(shots.find((shot) => shot.id === proposal?.sourceRef)?.label).toBe(DREAM_SOURCE_SHOT_LABEL);
  });

  it('offers one proposal per delivered version', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    await propose(app, [await uploadConceptFrame(app), await uploadConceptFrame(app)]);
    // The mint refuses a claimed version, so seed these.
    const second = await propose(app, [await storeConceptFrame(store), await storeConceptFrame(store)]);

    expect(second.json().rejected).toBe('already_proposed');
  });

  it('stays quiet for a creator who asked not to see proposals', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());
    const frames = [await storeConceptFrame(store), await storeConceptFrame(store)];
    await store.setProposalsMuted('g:owner', '2026-09-01T00:00:00.000Z');

    const response = await propose(app, frames);
    expect(response.json().rejected).toBe('muted');
    expect(await store.listCreatorMessages(ISSUE)).toHaveLength(0);
  });

  it('stays quiet while the feature is switched off', async () => {
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    // Frames can predate the switch being thrown.
    const response = await propose(app, [await storeConceptFrame(store), await storeConceptFrame(store)]);
    expect(response.json().rejected).toBe('paused');
  });

  it('refuses a plain screenshot passed off as a concept frame', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const concept = await uploadConceptFrame(app);
    const shot = await store.appendBuildShot(ISSUE, { data: SOURCE.toString('base64'), label: 'gameplay' });
    const response = await propose(app, [concept, shot.id]);

    expect(response.json().rejected).toBe('frame_missing');
  });

  it('refuses the upload URL while proposals are off, before any frame is drawn', async () => {
    // By suggest_next_round the agent has already paid for two image-model frames.
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });

    expect(minted.json().rejected).toBe('proposals_off');
  });

  it('refuses the upload URL for a creator who muted proposals', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());
    await store.setProposalsMuted('g:owner', '2026-09-01T00:00:00.000Z');

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });

    expect(minted.json().rejected).toBe('proposals_muted');
  });

  it('refuses a concept frame drawn for an earlier round', async () => {
    // Shots are scoped by job, so a kept id still reads.
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const stale = [await uploadConceptFrame(app), await uploadConceptFrame(app)];
    await store.bumpRoundGeneration(ISSUE);
    const response = await propose(app, stale, 2);

    expect(response.json().rejected).toBe('frame_stale');
  });

  it('advertises the concept frame cap, not the screenshot one', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });

    // The proposal route refuses anything larger, so promising more would mislead.
    expect(minted.json().maxBytes).toBe(600 * 1024);
  });

  it('refuses the upload URL once this delivery already carries a proposal', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());
    await store.claimDreamRun(ISSUE, VERSION, '2026-09-09T00:00:00.000Z');

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });

    expect(minted.json().rejected).toBe('already_proposed');
  });

  it('refuses the upload URL before a green capture exists', async () => {
    // Otherwise two paid frames buy an answer of no.
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore(null));

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });

    expect(minted.json().rejected).toBe('no_capture');
  });

  it('refuses an upload whose delivery moved while the frame was drawn', async () => {
    // Minting, generating and uploading spans minutes; a delivery can land inside it.
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });
    const token = new URL(minted.json().url).searchParams.get('token');
    await store.setSubmissionPreviewVersion(ISSUE, 'v8');
    const put = await app.inject({
      method: 'PUT',
      url: `/api/agent/build/shot/upload?token=${encodeURIComponent(token ?? '')}`,
      headers: { 'content-type': 'image/png' },
      payload: pngHeader(900, 900),
    });

    expect(put.json().rejected).toBe('stale_delivery');
  });

  it('refuses a frame drawn for an earlier delivery in the same round', async () => {
    // A round delivers several previews without advancing its generation.
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const frames = [await uploadConceptFrame(app), await uploadConceptFrame(app)];
    await store.setSubmissionPreviewVersion(ISSUE, 'v8');
    const response = await propose(app, frames);

    expect(response.json().rejected).toBe('frame_stale');
  });

  it('refuses a concept frame that changed the frame shape', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const frames = [await uploadConceptFrame(app), await uploadConceptFrame(app, pngHeader(1600, 900))];
    const response = await propose(app, frames);

    expect(response.json().rejected).toBe('frame_shape');
  });

  it('refuses to propose before a green gate capture exists', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore(null));

    // The mint refuses first now, so seed the frames.
    const response = await propose(app, [await storeConceptFrame(store), await storeConceptFrame(store)]);
    expect(response.json().rejected).toBe('no_screenshot');
  });

  it('keeps the reserved concept caption out of an ordinary screenshot upload', async () => {
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { label: DREAM_FRAME_SHOT_LABEL },
    });

    expect(response.statusCode).toBe(400);
  });
});
