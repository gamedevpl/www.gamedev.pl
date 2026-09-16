// Editorial clearance names the current game owner, not the round author.

import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { GamesStore } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';

const SESSION_SECRET = 'dev-session-secret-change-me';
const ADMIN_HEADERS = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:boss', SESSION_SECRET)}` };

function gamesStoreWith(gate: { green: boolean } | null) {
  return {
    getManifest: async () => ({
      slug: 'sky-dodge',
      version: 'v1',
      createdAt: '2026-07-30T10:00:00Z',
      jobId: 909,
      sourceFiles: ['SPEC.md'],
      deliveryMode: 'publish' as const,
      ...(gate ? { gate: { ...gate, ranAt: '2026-07-30T11:00:00Z' } } : {}),
    }),
    getSourceFile: async () => '---\ntitle: Sky Dodge\n---\n',
    getDerivedArtifact: async () => Buffer.from('<!doctype html>assembled', 'utf8'),
    putCandidateSources: async () => ({ version: 'v1', manifest: {} }),
    putGateResult: async () => {},
    putDerivedArtifact: async () => {},
  } as unknown as GamesStore;
}

describe('publishing a bot-seeded game transferred to a creator', () => {
  it('enforces editorial clearance for the creator who holds the game now', async () => {
    const store = new InMemoryStore();
    const at = new Date().toISOString();
    await store.upsertUser({ uid: 'g:boss' });
    await store.upsertUser({ uid: 'bot:seeder' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.claimHandle('g:grace', 'grace', at);

    await store.createSubmission(909, 'bot:seeder', 'Sky Dodge');
    await store.setSubmissionSlug(909, 'sky-dodge');
    await store.setSubmissionDeliveredVersion(909, 'v1');
    await store.ensureGameAccess('sky-dodge', 'bot:seeder', at, at);

    const later = new Date(Date.now() + 1000).toISOString();
    const code = (await store.ensureRecipientCode('g:grace', later))!;
    const revision = (await store.getGameAccess('sky-dodge'))!.accessRevision;
    await store.createGameTransferInvitation('sky-dodge', 'bot:seeder', 'g:grace', revision, later, code);
    const invite = (await store.getActiveGameTransfer('sky-dodge', later))!;
    await store.acceptGameTransferInvitation('sky-dodge', 'g:grace', later, invite.invitationId);

    const app = await buildApp({
      store,
      sessionSecret: SESSION_SECRET,
      adminUids: 'g:boss',
      submissionRoutes: { agentChannel: { gamesStore: gamesStoreWith({ green: true }) } },
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/jobs/909/publish',
        headers: ADMIN_HEADERS,
      });

      // The creator now owns the game: editorial review cannot be bypassed.
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: 'editorial_pending' });
      expect(await store.getPublication('sky-dodge')).toBeNull();
    } finally {
      await app.close();
    }
  });
});
