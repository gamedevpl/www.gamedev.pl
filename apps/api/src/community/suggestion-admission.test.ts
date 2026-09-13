import { expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore, type SuggestionRecord } from '../platform/store.js';
const OWNER = 'owner';
function suggestion(partial: Partial<SuggestionRecord> = {}): SuggestionRecord {
  return {
    id: 'sug-crashy-defect-2026-07-30',
    slug: 'crashy',
    ownerUid: OWNER,
    class: 'defect',
    priority: 40,
    evidence: [{ finding: '40 uncaught errors across 100 sessions.', metrics: { errors: 40, sessions: 100 } }],
    status: 'proposed',
    computedFrom: '2026-07-30T03:20:00.000Z',
    createdAt: '2026-07-30T03:30:00.000Z',
    updatedAt: '2026-07-30T03:30:00.000Z',
    ...partial,
  };
}

it.each(['admission', 'claim'])('keeps quota and suggestion untouched when %s refuses', async (mode) => {
  const store = new InMemoryStore();
  await store.createSubmission(1, OWNER, 'Crashy');
  await store.setSubmissionSlug(1, 'crashy');
  await store.putSuggestion(suggestion());
  const spend = vi.spyOn(store, 'checkAndIncrementQuota');
  const app = await buildApp({
    store,
    suggestionInboxRoutes: {
      startImprovementRound: async () => {
        if (mode === 'claim') return null;
        throw Object.assign(new Error('Recovery in progress'), { statusCode: 409 });
      },
    },
  });
  app.addHook('onRequest', async (request) => {
    request.user = { uid: OWNER } as typeof request.user;
  });
  try {
    const res = await app.inject({ method: 'POST', url: '/api/me/suggestions/sug-crashy-defect-2026-07-30/approve' });
    expect(res.statusCode).toBe(409);
    expect(spend).not.toHaveBeenCalled();
    expect((await store.getSuggestion('sug-crashy-defect-2026-07-30'))?.status).toBe('proposed');
  } finally {
    await app.close();
  }
});
