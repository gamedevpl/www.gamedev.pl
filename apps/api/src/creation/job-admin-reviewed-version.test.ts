import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { GamesStore } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';

describe('publish reviewed version', () => {
  const adminHeaders = {
    cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:boss', 'dev-session-secret-change-me')}`,
  };
  function gamesStoreWith(gate: { green: boolean }) {
    return {
      getManifest: async () => ({ gate: { ...gate, ranAt: '2026-07-30T11:00:00Z' } }),
      getSourceFile: async () => '',
      getDerivedArtifact: async () => Buffer.from('<!doctype html>assembled'),
      putCandidateSources: async () => ({ version: 'v1', manifest: {} }),
      putGateResult: async () => {},
      putDerivedArtifact: async () => {},
    } as unknown as GamesStore;
  }
  async function appWithJob(gamesStore: GamesStore, legacy = false) {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.claimHandle('g:boss', 'boss', '2026-07-01T00:00:00.000Z');
    await store.createSubmission(1_000_001, 'g:boss', 'Comet Courier');
    await store.setSubmissionSlug(1_000_001, 'comet-courier');
    await store.setSubmissionDeliveredVersion(1_000_001, 'v1');
    if (legacy) {
      await store.setSubmissionLastStatus(1_000_001, 'in_review');
    } else {
      await store.recordJobTransition(1_000_001, {
        to: 'ready_for_review',
        at: '2026-07-30T10:00:00Z',
        by: 'agent',
        reason: 'delivered',
      });
    }
    await store.upsertGameAssessment({
      slug: 'comet-courier',
      gameVersion: 'v1',
      title: 'Comet Courier',
      source: 'creator',
      creatorHandle: null,
      reviewerUid: 'g:reviewer1',
      verdict: 'keep',
      note: '',
      noteOrigin: 'text',
      checklist: { graphics: 'ok', gameplay: 'ok', fun: 'ok', sound: 'ok', controls: 'ok' },
      clientContext: null,
    });
    const app = await buildApp({
      store,
      sessionSecret: 'dev-session-secret-change-me',
      adminUids: 'g:boss',
      submissionRoutes: { agentChannel: { gamesStore } },
    });
    return { app, store };
  }

  it('requires the reviewed version and refuses a replacement delivery', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    const missing = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toEqual({ error: 'expected_version_required' });

    await store.setSubmissionDeliveredVersion(1_000_001, 'v2');
    const stale = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
      payload: { expectedVersion: 'v1' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: 'review_version_changed' });
    expect(await store.getPublication('comet-courier')).toBeNull();
    await app.close();
  });

  it('publishes a legacy review-ready job with only lastStatus', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), true);
    expect((await store.getSubmission(1_000_001))?.state).toBeUndefined();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
      payload: { expectedVersion: 'v1' },
    });
    expect(response.statusCode).toBe(200);
    expect(await store.getPublication('comet-courier')).toMatchObject({ currentVersion: 'v1' });
    await app.close();
  });

  it('refuses when the version changes at the publishing transition', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    const transition = store.recordJobTransition.bind(store);
    store.recordJobTransition = async (jobId, entry, guard) => {
      if (entry.to === 'publishing') await store.setSubmissionDeliveredVersion(jobId, 'v2');
      return transition(jobId, entry, guard);
    };
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
      payload: { expectedVersion: 'v1' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'review_version_changed' });
    expect(await store.getPublication('comet-courier')).toBeNull();
    await app.close();
  });

  it('refuses when the job leaves review after the preview was loaded', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    await store.recordJobTransition(1_000_001, { to: 'building', at: '2026-07-30T10:01:00Z', by: 'creator' });
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
      payload: { expectedVersion: 'v1' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'not_ready_for_review' });
    expect(await store.getPublication('comet-courier')).toBeNull();
    await app.close();
  });

  it('refuses an older delivery after a newer preview was reviewed', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    await store.setSubmissionPreviewVersion(1_000_001, 'v2');

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
      payload: { expectedVersion: 'v1' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'preview_superseded_delivery' });
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('requires a fresh review when a preview round was later sealed into a delivery', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    await store.setSubmissionPreviewVersion(1_000_001, 'v2');
    // A publish delivery advances both pointers together.
    await store.setSubmissionDeliveredVersion(1_000_001, 'v3');

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
      payload: { expectedVersion: 'v1' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'review_version_changed' });
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
      payload: { expectedVersion: 'v1' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'preview_superseded_delivery' });
    expect(await store.getPublication('comet-courier')).toBeNull();
    expect((await store.getSubmission(1_000_001))?.state).not.toBe('publishing');
    await built.app.close();
  });
});
