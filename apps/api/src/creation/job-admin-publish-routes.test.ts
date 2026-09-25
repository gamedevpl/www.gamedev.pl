import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { GamesStore } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';

describe('POST /api/admin/jobs/:jobId/publish', () => {
  const sessionSecret = 'dev-session-secret-change-me';
  const adminHeaders = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:boss', sessionSecret)}` };

  // One delivered version, gated as told.
  function gamesStoreWith(
    gate: { green: boolean } | null,
    bundle = '<!doctype html>assembled',
    deliveryMode?: 'preview' | 'publish' | 'proposal',
  ) {
    return {
      getManifest: async () => ({
        slug: 'comet-courier',
        version: 'v1',
        createdAt: '2026-07-30T10:00:00Z',
        jobId: 1_000_001,
        sourceFiles: ['SPEC.md'],
        ...(deliveryMode ? { deliveryMode } : {}),
        ...(gate ? { gate: { ...gate, ranAt: '2026-07-30T11:00:00Z' } } : {}),
      }),
      getSourceFile: async () => '---\ntitle: Comet Courier\n---\n',
      getDerivedArtifact: async () => Buffer.from(bundle, 'utf8'),
      putCandidateSources: async () => ({ version: 'v1', manifest: {} }),
      putGateResult: async () => {},
      putDerivedArtifact: async () => {},
    } as unknown as GamesStore;
  }

  async function seedAssessment(store: InMemoryStore, reviewerUid: string, verdict: 'keep' | 'cut' | 'skip') {
    await store.upsertGameAssessment({
      slug: 'comet-courier',
      title: 'Comet Courier',
      source: 'creator',
      creatorHandle: null,
      reviewerUid,
      verdict,
      note: '',
      noteOrigin: 'text',
      checklist: { graphics: 'ok', gameplay: 'ok', fun: 'ok', sound: 'ok', controls: 'ok' },
      clientContext: null,
    });
  }

  async function appWithJob(
    gamesStore: GamesStore,
    opts?: { claimProfile?: boolean; ownerUid?: string; clearance?: 'keep' | 'pending' | 'cut' | 'skip' },
  ) {
    const store = new InMemoryStore();
    const ownerUid = opts?.ownerUid ?? 'g:boss';
    await store.upsertUser({ uid: 'g:boss' });
    if (ownerUid !== 'g:boss') await store.upsertUser({ uid: ownerUid });
    // Publish requires a creator profile unless the owner is a bot account.
    if (opts?.claimProfile !== false && !ownerUid.startsWith('bot:')) {
      await store.claimHandle(ownerUid, ownerUid === 'g:boss' ? 'boss' : 'creator', '2026-07-01T00:00:00.000Z');
    }
    await store.createSubmission(1_000_001, ownerUid, 'Comet Courier');
    await store.setSubmissionSlug(1_000_001, 'comet-courier');
    await store.setSubmissionDeliveredVersion(1_000_001, 'v1');
    if (opts?.clearance === 'cut') {
      await seedAssessment(store, 'g:reviewer1', 'cut');
      await seedAssessment(store, 'g:reviewer2', 'cut');
    } else if (opts?.clearance === 'skip') {
      await seedAssessment(store, 'g:reviewer1', 'skip');
    } else if (opts?.clearance !== 'pending') {
      await seedAssessment(store, 'g:reviewer1', 'keep');
    }
    const app = await buildApp({
      store,
      sessionSecret,
      adminUids: 'g:boss',
      submissionRoutes: { agentChannel: { gamesStore } },
    });
    return { app, store };
  }

  it('refuses to publish a proposal version, however green its gate', async () => {
    // Proposal mode is not publishable even when green.
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }, undefined, 'proposal'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'not_publishable' });
    expect(await store.getPublication('comet-courier')).toBeNull();
  });

  it('refuses to publish a preview version for the same reason', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }, undefined, 'preview'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(await store.getPublication('comet-courier')).toBeNull();
  });

  it('publishes a gate-green build and records how it got there', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(await store.getPublication('comet-courier')).toMatchObject({
      slug: 'comet-courier',
      state: 'published',
      currentVersion: 'v1',
    });
    // Publish goes through publishing, not straight to published.
    const record = await store.getSubmission(1_000_001);
    expect(record?.state).toBe('published');
    expect(record?.transitions?.map((entry) => entry.to)).toEqual(['publishing', 'published']);
    expect(record?.publishedAt).toBeTruthy();
    // Creator rail reads lastStatus, not state.
    expect(record?.lastStatus).toBe('published');

    await app.close();
  });

  it('refuses an older delivery after a newer preview was reviewed', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    await store.setSubmissionPreviewVersion(1_000_001, 'v2');

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'preview_superseded_delivery' });
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('publishes when a preview round was later sealed into a delivery', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    await store.setSubmissionPreviewVersion(1_000_001, 'v2');
    // A publish delivery advances both pointers together.
    await store.setSubmissionDeliveredVersion(1_000_001, 'v3');

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(await store.getPublication('comet-courier')).toMatchObject({ currentVersion: 'v3' });
    await app.close();
  });

  it('refuses when a newer preview lands while the publish is in flight', async () => {
    const base = gamesStoreWith({ green: true });
    const seam: { store?: InMemoryStore } = {};
    const racing = {
      ...base,
      getManifest: async (...args: Parameters<GamesStore['getManifest']>) => {
        // Interleaves a preview delivery between the first read and the write.
        await seam.store?.setSubmissionPreviewVersion(1_000_001, 'v2');
        return base.getManifest(...args);
      },
    } as GamesStore;
    const built = await appWithJob(racing);
    const store = (seam.store = built.store);
    const response = await built.app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'preview_superseded_delivery' });
    expect(await store.getPublication('comet-courier')).toBeNull();
    expect((await store.getSubmission(1_000_001))?.state).not.toBe('publishing');
    await built.app.close();
  });

  it('supersedes older active submissions for the same slug when publishing', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    // Create an older submission for the same slug
    await store.createSubmission(1_000_000, 'g:boss', 'Comet Courier v0');
    await store.setSubmissionSlug(1_000_000, 'comet-courier');
    await store.setSubmissionDeliveredVersion(1_000_000, 'v0');

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const older = await store.getSubmission(1_000_000);
    expect(older?.lastStatus).toBe('abandoned');
    expect(older?.abandonedAt).toBeTruthy();
    const transitions = older?.transitions ?? [];
    expect(transitions[transitions.length - 1]).toMatchObject({
      to: 'abandoned',
      reason: 'superseded_by_publish',
    });

    await app.close();
  });

  it('refuses to publish when the creator has no profile', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), { claimProfile: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('profile_required');
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('gates the profile requirement on the transfer recipient, not the sender', async () => {
    // Sender has a handle, recipient does not: the byline would point nowhere.
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    await store.upsertUser({ uid: 'g:recipient' });
    const at = '2026-08-01T00:00:00.000Z';
    const access = await store.ensureGameAccess('comet-courier', 'g:boss', at, at);
    await store.createGameTransferInvitation('comet-courier', 'g:boss', 'g:recipient', access!.accessRevision, at);
    expect(
      await store.acceptGameTransferInvitation(
        'comet-courier',
        'g:recipient',
        at,
        (await store.getActiveGameTransfer('comet-courier', at))!.invitationId,
      ),
    ).toMatchObject({
      status: 'accepted',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('profile_required');
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('lets a transfer recipient with a handle publish a job whose sender had none', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), { claimProfile: false });
    await store.upsertUser({ uid: 'g:recipient' });
    await store.claimHandle('g:recipient', 'newowner', '2026-08-01T00:00:00.000Z');
    const at = '2026-08-01T00:00:00.000Z';
    const access = await store.ensureGameAccess('comet-courier', 'g:boss', at, at);
    await store.createGameTransferInvitation('comet-courier', 'g:boss', 'g:recipient', access!.accessRevision, at);
    expect(
      await store.acceptGameTransferInvitation(
        'comet-courier',
        'g:recipient',
        at,
        (await store.getActiveGameTransfer('comet-courier', at))!.invitationId,
      ),
    ).toMatchObject({
      status: 'accepted',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(await store.getPublication('comet-courier')).toMatchObject({ state: 'published' });

    await app.close();
  });

  it('refuses to publish a version our own gate failed', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: false }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('gate_red');
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('refuses a version nothing has gated yet', async () => {
    const { app, store } = await appWithJob(gamesStoreWith(null));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('not_gated');
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('is invisible to a non-admin, like the rest of the operator surface', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    await store.upsertUser({ uid: 'g:someone' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:someone', sessionSecret)}` },
    });

    // 404, not 403: operator surface stays invisible.
    expect(response.statusCode).toBe(404);
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('refuses as editorial_pending when nobody has cleared the slug', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), { clearance: 'pending' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'editorial_pending',
      reviewers: 0,
      keep: 0,
      cut: 0,
      skip: 0,
    });
    expect(await store.getPublication('comet-courier')).toBeNull();
    expect((await store.getSubmission(1_000_001))?.transitions).toBeUndefined();

    await app.close();
  });

  it('refuses skip-only reviews as editorial_pending', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), { clearance: 'skip' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'editorial_pending', skip: 1, keep: 0 });
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('refuses a cut consensus as editorial_cut before any store write', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), { clearance: 'cut' });
    await store.createSubmission(1_000_000, 'g:boss', 'Comet Courier v0');
    await store.setSubmissionSlug(1_000_000, 'comet-courier');
    await store.setSubmissionDeliveredVersion(1_000_000, 'v0');

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'editorial_cut', reviewers: 2, cut: 2, keep: 0 });
    expect(await store.getPublication('comet-courier')).toBeNull();
    expect((await store.getSubmission(1_000_001))?.transitions).toBeUndefined();
    expect((await store.getSubmission(1_000_000))?.lastStatus).not.toBe('abandoned');

    await app.close();
  });

  it('publishes a bot-owned job with no assessments at all', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), {
      ownerUid: 'bot:e2e',
      claimProfile: false,
      clearance: 'pending',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(await store.getPublication('comet-courier')).toMatchObject({ state: 'published' });

    await app.close();
  });

  it('refuses an override that has no written reason', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), { clearance: 'pending' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: { ...adminHeaders, 'content-type': 'application/json' },
      payload: { override: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'reason_required' });
    expect(await store.getPublication('comet-courier')).toBeNull();
    expect((await store.getSubmission(1_000_001))?.transitions).toBeUndefined();

    await app.close();
  });

  it('refuses an override whose reason exceeds the stored cap', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), { clearance: 'pending' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: { ...adminHeaders, 'content-type': 'application/json' },
      payload: { override: true, overrideReason: 'x'.repeat(501) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'reason_too_long' });
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('publishes on override and records which clearance was bypassed', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), { clearance: 'cut' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: { ...adminHeaders, 'content-type': 'application/json' },
      payload: { override: true, overrideReason: 'still the right call' },
    });

    expect(response.statusCode).toBe(200);
    expect(await store.getPublication('comet-courier')).toMatchObject({ state: 'published' });
    const record = await store.getSubmission(1_000_001);
    expect(record?.transitions?.[0]).toMatchObject({
      to: 'publishing',
      by: 'operator',
      reason: 'override:editorial_cut:still the right call',
    });

    await app.close();
  });

  it('does not record an override when the slug was already clear', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: { ...adminHeaders, 'content-type': 'application/json' },
      payload: { override: true, overrideReason: 'already clear' },
    });

    expect(response.statusCode).toBe(200);
    const record = await store.getSubmission(1_000_001);
    expect(record?.transitions?.map((entry) => entry.reason)).toEqual(['approved', 'published']);

    await app.close();
  });
});
