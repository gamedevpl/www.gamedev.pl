import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintAgentToken } from '../platform/agent-token.js';
import { buildApp } from '../platform/app.js';
import type { GamesStore } from '../delivery/games-store.js';
import { DREAM_FRAME_SHOT_LABEL, DREAM_SOURCE_SHOT_LABEL } from '../platform/dream-shots.js';
import { pngHeader } from '../platform/image-size.test.js';
import { InMemoryStore } from '../platform/store.js';

export const secret = 'test-secret';
export const ISSUE = 42;
export const VERSION = 'v7';
export const SOURCE = pngHeader(900, 900);

export function agentHeaders(jobId = ISSUE, roundGeneration = 1) {
  return { authorization: `Bearer ${mintAgentToken(jobId, secret, { roundGeneration })}` };
}

export function stubGamesStore(screenshot: string | null = 'opening.png', source: Buffer | null = SOURCE): GamesStore {
  return {
    getManifest: async () => (screenshot ? { previewGate: { green: true, screenshot } } : {}),
    getDerivedArtifact: async () => source,
  } as unknown as GamesStore;
}

export async function createApp(store: InMemoryStore, gamesStore: GamesStore) {
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

export async function seed(store: InMemoryStore) {
  await store.createSubmission(ISSUE, 'g:owner', 'Squad game');
  await store.setSubmissionSlug(ISSUE, 'squad-game');
  await store.setSubmissionPreviewVersion(ISSUE, VERSION);
}

export async function mintConceptUrl(app: FastifyInstance, round = 1): Promise<string> {
  const minted = await app.inject({
    method: 'POST',
    url: '/api/agent/build/shot/upload-url',
    headers: agentHeaders(ISSUE, round),
    payload: { purpose: 'concept' },
  });
  return minted.json().url as string;
}

export async function putConceptFrame(app: FastifyInstance, url: string, png: Buffer) {
  const token = new URL(url).searchParams.get('token');
  return await app.inject({
    method: 'PUT',
    url: `/api/agent/build/shot/upload?token=${encodeURIComponent(token ?? '')}`,
    headers: { 'content-type': 'image/png' },
    payload: png,
  });
}

export async function uploadConceptFrameRaw(app: FastifyInstance, png: Buffer, round = 1) {
  return await putConceptFrame(app, await mintConceptUrl(app, round), png);
}

export async function uploadConceptFrame(
  app: FastifyInstance,
  png: Buffer = pngHeader(900, 900),
  round = 1,
): Promise<string> {
  return (await uploadConceptFrameRaw(app, png, round)).json().shot.id as string;
}

// Ordinary agent screenshots, to push the build up against its quota.
export async function fillShots(store: InMemoryStore, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await store.appendBuildShot(ISSUE, { data: pngHeader(4, 4).toString('base64'), label: `Shot ${index + 1}` });
  }
}

// Stores a frame the way a completed upload would.
export async function storeConceptFrame(store: InMemoryStore, png: Buffer = pngHeader(900, 900)): Promise<string> {
  const shot = await store.appendBuildShot(ISSUE, {
    data: png.toString('base64'),
    label: DREAM_FRAME_SHOT_LABEL,
    roundGeneration: 1,
    deliveryVersion: VERSION,
  });
  return shot.id;
}

export function options(frameIds: string[]) {
  return {
    options: frameIds.map((frameId, index) => ({
      label: `Direction ${index + 1}`,
      prompt: `Make the world feel ${index === 0 ? 'colder' : 'warmer'}.`,
      frameId,
    })),
  };
}

export async function propose(app: FastifyInstance, frameIds: string[], round = 1) {
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
    // The agent drew it, so the card's telemetry says so.
    expect(proposal?.builder).toBe('self');
    // Stamped posted, so no later run can retake this version.
    expect((await store.getSubmission(ISSUE))?.dreamRun?.postedAt).toBeTruthy();
  });

  it('posts no card when the creator mutes while the source shot is written', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());
    const frames = [await storeConceptFrame(store), await storeConceptFrame(store)];
    const real = store.appendBuildShot.bind(store);
    store.appendBuildShot = async (jobId, shot) => {
      // Past the route's own check; only the posting transaction can refuse.
      await store.setProposalsMuted('g:owner', '2026-09-07T12:00:00.000Z');
      return await real(jobId, shot);
    };

    const response = await propose(app, frames);
    expect(response.json().rejected).toBe('muted');
    expect(await store.listCreatorMessages(ISSUE)).toHaveLength(0);
  });

  it('posts no card when the round is reopened while the source shot is written', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());
    const frames = [await storeConceptFrame(store), await storeConceptFrame(store)];
    const real = store.appendBuildShot.bind(store);
    store.appendBuildShot = async (jobId, shot) => {
      // A reopen leaves the version alone; only the round says so.
      await store.bumpRoundGeneration(ISSUE);
      return await real(jobId, shot);
    };

    const response = await propose(app, frames);
    expect(response.json().rejected).toBe('frame_stale');
    expect(await store.listCreatorMessages(ISSUE)).toHaveLength(0);
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

  it('refuses a concept frame whose delivery moved before the write', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());
    const url = await mintConceptUrl(app);
    await store.setSubmissionPreviewVersion(ISSUE, 'v8');

    const put = await putConceptFrame(app, url, pngHeader(900, 900));

    console.log('STATUS', put.statusCode, put.body.slice(0, 200));
    expect(await store.countBuildShots(ISSUE)).toBe(0);
  });

  it('refuses a direction whose text is nothing but markup', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const frames = [await storeConceptFrame(store), await storeConceptFrame(store)];
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/proposal',
      headers: agentHeaders(),
      payload: {
        options: [
          { label: '###', prompt: 'Make the world colder.', frameId: frames[0] },
          { label: 'Warmer', prompt: 'Make the world warmer.', frameId: frames[1] },
        ],
      },
    });

    expect(response.json().rejected).toBe('empty_text');
    // The claim is untouched, so a corrected call can still post.
    expect((await store.getSubmission(ISSUE))?.dreamRun).toBeUndefined();
  });

  it('still refuses a reshaped frame at the proposal, for one stored before the check', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const frames = [await storeConceptFrame(store), await storeConceptFrame(store, pngHeader(1600, 900))];
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
});
