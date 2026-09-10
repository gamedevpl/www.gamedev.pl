import type { FastifyInstance } from 'fastify';
import { MAX_SHOT_BYTES } from '@gamedevpl/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DREAM_FRAME_SHOT_LABEL } from '../platform/dream-shots.js';
import { pngHeader } from '../platform/image-size.test.js';
import { InMemoryStore } from '../platform/store.js';
import {
  ISSUE,
  SOURCE,
  VERSION,
  agentHeaders,
  createApp,
  fillShots,
  mintConceptUrl,
  propose,
  putConceptFrame,
  seed,
  stubGamesStore,
  uploadConceptFrame,
  uploadConceptFrameRaw,
} from './agent-channel-proposal.test.js';

describe('agent concept frame slots', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    vi.unstubAllEnvs();
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

  it('refuses the upload URL while a run still holds this delivery', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());
    await store.claimDreamRun(ISSUE, VERSION, new Date().toISOString());

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });

    expect(minted.json().rejected).toBe('already_proposed');
  });

  it('mints again once an abandoned claim has lapsed', async () => {
    // A crashed run leaves a claim the TTL releases.
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

    expect(minted.json().rejected).toBeUndefined();
    expect(minted.json().url).toBeTruthy();
  });

  it('refuses the upload URL once this delivery already carries a proposal', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());
    await propose(app, [await uploadConceptFrame(app), await uploadConceptFrame(app)]);

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });

    // A posted claim is final, however long ago it was taken.
    expect(minted.json().rejected).toBe('already_proposed');
  });

  it('refuses the first concept URL when only one frame would fit', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    await fillShots(store, 23);
    app = await createApp(store, stubGamesStore());

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });

    // Room for one frame buys a frame no card can ever use.
    expect(minted.json().rejected).toBe('too_many_shots');
  });

  it('mints the second concept URL once the first frame took its room', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    await fillShots(store, 22);
    app = await createApp(store, stubGamesStore());

    const frames = [await uploadConceptFrame(app), await uploadConceptFrame(app)];

    // Both frames stored, and the card they were drawn for posts.
    expect(new Set(frames).size).toBe(2);
    expect((await propose(app, frames)).json().accepted).toBe(true);
  });

  it('refuses the upload URL when the capture is one the proposal cannot use', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    // Green in the manifest, but too many bytes for the proposal.
    app = await createApp(store, stubGamesStore('opening.png', Buffer.concat([SOURCE, Buffer.alloc(MAX_SHOT_BYTES)])));

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });

    expect(minted.json().rejected).toBe('no_capture');
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

  it('honours a minted concept URL even when an ordinary shot filled the build', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    await fillShots(store, 22);
    app = await createApp(store, stubGamesStore());

    // The agent mints both URLs, then draws each frame.
    const urls = [await mintConceptUrl(app), await mintConceptUrl(app)];
    const first = (await putConceptFrame(app, urls[0]!, pngHeader(900, 900))).json().shot.id as string;
    // That window is long enough for one more ordinary screenshot to land.
    await fillShots(store, 1);
    const second = (await putConceptFrame(app, urls[1]!, pngHeader(900, 900))).json().shot.id as string;

    expect(new Set([first, second]).size).toBe(2);
    expect((await propose(app, [first, second])).json().accepted).toBe(true);
  });

  it('refuses a third concept URL once the delivery holds its pair', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());
    await uploadConceptFrame(app);
    await uploadConceptFrame(app);

    const minted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot/upload-url',
      headers: agentHeaders(),
      payload: { purpose: 'concept' },
    });

    // Otherwise every URL invites a paid frame the upload would refuse.
    expect(minted.json().rejected).toBe('too_many_shots');
  });

  it('gives a replayed concept URL back its own frame, not a second slot', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const urls = [await mintConceptUrl(app), await mintConceptUrl(app)];
    const first = await putConceptFrame(app, urls[0]!, pngHeader(900, 900));
    // A lost response is ordinary; retrying must not burn the other slot.
    const retry = await putConceptFrame(app, urls[0]!, pngHeader(800, 800));
    const second = await putConceptFrame(app, urls[1]!, pngHeader(900, 900));

    expect(retry.json().shot.id).toBe(first.json().shot.id);
    expect(await store.countBuildShots(ISSUE)).toBe(2);
    // The id a card names must keep pointing at that frame.
    expect((await store.getBuildShot(ISSUE, first.json().shot.id))?.data).toBe(pngHeader(900, 900).toString('base64'));
    expect((await propose(app, [first.json().shot.id, second.json().shot.id])).json().accepted).toBe(true);
  });

  it('refuses a third concept URL minted before either frame landed', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    // Nothing is stored yet, so all three mints see room.
    const urls = [await mintConceptUrl(app), await mintConceptUrl(app), await mintConceptUrl(app)];
    for (const url of urls.slice(0, 2)) await putConceptFrame(app, url, pngHeader(900, 900));
    const third = await putConceptFrame(app, urls[2]!, pngHeader(900, 900));

    expect(third.json().rejected).toBe('too_many_shots');
    expect(await store.countBuildShots(ISSUE)).toBe(2);
  });

  it('tells the agent to ask again when the round reopens mid-upload', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    let reopen: (() => Promise<void>) | null = null;
    // Read after the token is checked and before the frame is written.
    const games = {
      getManifest: async () => ({ previewGate: { green: true, screenshot: 'opening.png' } }),
      getDerivedArtifact: async () => {
        await reopen?.();
        return SOURCE;
      },
    } as unknown as GamesStore;
    app = await createApp(store, games);
    const url = await mintConceptUrl(app);
    reopen = async () => {
      await store.bumpRoundGeneration(ISSUE);
    };

    const put = await putConceptFrame(app, url, pngHeader(900, 900));

    // A reopen leaves the delivery pointers alone.
    expect(put.json().rejected).toBe('stale_delivery');
    expect(await store.countBuildShots(ISSUE)).toBe(0);
  });

  it('refuses a reshaped concept frame at the upload, before it spends a slot', async () => {
    vi.stubEnv('AGENT_PROPOSALS_ENABLED', 'true');
    const store = new InMemoryStore();
    await seed(store);
    app = await createApp(store, stubGamesStore());

    const put = await uploadConceptFrameRaw(app, pngHeader(1600, 900));

    expect(put.json().rejected).toBe('frame_shape');
    // A stored frame would hold a slot the replacement then cannot find.
    expect(await store.countBuildShots(ISSUE)).toBe(0);
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
