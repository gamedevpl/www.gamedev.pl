import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { SESSION_COOKIE_NAME } from '../platform/auth.js';
import { DELETED_ACCOUNT_UID, InMemoryStore } from '../platform/store.js';

describe('assessment attribution at the HTTP boundary', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
  });

  it.each(['canonical', 'erased', 'catalog', 'unknown', 'outage'])(
    'ignores forged attribution for %s games',
    async (kind) => {
      const store = new InMemoryStore();
      const at = new Date().toISOString();
      await store.upsertUser({ uid: 'g:current' });
      await store.claimHandle('g:current', 'current', at);
      if (kind === 'canonical' || kind === 'erased') {
        await store.ensureGameAccess('sky', kind === 'erased' ? DELETED_ACCOUNT_UID : 'g:current', at, at);
      }
      const app = await buildApp({
        store,
        reviewerUids: 'dev:reviewer',
        reviewRoutes: {
          listCatalog: async () => {
            if (kind === 'outage') throw new Error('catalog unavailable');
            return kind === 'unknown' ? [] : [{ slug: 'sky', title: 'Sky', creatorHandle: 'catalog-author' }];
          },
        },
      });
      apps.push(app);
      const session = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { uid: 'reviewer' } });
      expect(session.statusCode).toBe(200);
      const cookie = `${SESSION_COOKIE_NAME}=${session.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value}`;
      const checklist = { graphics: 'ok', gameplay: 'ok', fun: 'ok', sound: 'ok', controls: 'ok' } as const;
      await store.upsertGameAssessment({
        slug: 'sky',
        title: 'Sky',
        source: 'catalog',
        creatorHandle: 'old-spoof',
        reviewerUid: 'dev:reviewer',
        verdict: 'keep',
        note: 'Previous review',
        noteOrigin: 'text',
        checklist,
        clientContext: null,
        gameVersion: null,
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/review/assessments',
        headers: { cookie },
        payload: {
          slug: 'sky',
          source: 'catalog',
          creatorHandle: 'forged',
          verdict: 'keep',
          note: 'Still playable',
          checklist,
        },
      });
      expect(response.statusCode).toBe(200);
      expect((await store.getGameAssessment('sky', 'dev:reviewer'))?.creatorHandle).toBe(
        kind === 'canonical' ? 'current' : kind === 'catalog' ? 'catalog-author' : null,
      );
    },
  );
});
