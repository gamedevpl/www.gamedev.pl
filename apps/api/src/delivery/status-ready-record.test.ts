import { expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { FirestoreStore } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { stubGitHub } from '../game-transfer-fixtures.js';

it('serializes a public status when Firestore contains the unsupported ready state', async () => {
  const { db } = fakeFirestore();
  await db.collection('submissions').doc('7').set({
    jobId: 7,
    ownerUid: 'g:owner',
    createdAt: '2026-01-01T00:00:00Z',
    state: 'ready',
    slug: 'example-game',
    builder: 'self',
  });
  const secret = 'ready-status-test';
  const app = await buildApp({
    store: new FirestoreStore(db),
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: { githubClient: stubGitHub(), githubToken: 'test-token', submissionTokenSecret: secret },
  });
  try {
    const response = await app.inject({ method: 'GET', url: `/api/submissions/${mintToken(7, secret)}` });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'in_review',
      phase: 'ready_for_review',
      slug: 'example-game',
      roundStartedAt: '2026-01-01T00:00:00Z',
    });
    expect((await db.collection('submissions').doc('7').get()).data()?.state).toBe('ready');
  } finally {
    await app.close();
  }
});
