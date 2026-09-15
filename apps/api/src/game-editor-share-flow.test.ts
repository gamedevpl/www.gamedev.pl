import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './platform/auth.js';
import { mintToken } from './platform/submission-token.js';
import { memberKey } from './platform/game-access-permissions.js';
import { eraseAccount } from './platform/erase-account.js';
import { FirestoreStore, InMemoryStore, type Store } from './platform/store.js';
import { fakeFirestore } from './store/fake-firestore.js';
import type { AgentBackend } from './agent-surface/agent-backend.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './catalog/github-client.js';
import type { GamesStore } from './delivery/games-store.js';

const SECRET = 'share-flow-secret';
const SESSION_SECRET = 'dev-session-secret-change-me';
const AT = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';
const AFTER_EXPIRY = '2026-01-09T00:00:00.000Z';
const A = 'g:ada';
const B = 'g:bea';
const C = 'g:cal';
const D = 'g:dana';
const SLUG = 'comet-courier';

const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

function session(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, SESSION_SECRET)}` };
}

function stubGitHub(): GitHubClient {
  return {
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
  };
}

function stubBackend(): AgentBackend {
  return {
    name: 'stub',
    dispatch: async () => ({ ref: 'task-1', workspace: 'copilot/x' }),
    resume: async () => ({ ref: 'task-2', workspace: 'copilot/y' }),
    observe: async () => null,
    cancel: async () => ({ enforced: false }),
  };
}

async function createApp(store: Store) {
  const app = await buildApp({
    store,
    sessionSecret: SESSION_SECRET,
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: SECRET,
      agentBackend: stubBackend(),
      agentChannel: {} as { gamesStore?: GamesStore },
    },
  });
  apps.push(app);
  return app;
}

async function seedUsers(store: Store) {
  for (const [uid, profileName] of [
    [A, 'Ada'],
    [B, 'Bea'],
    [C, 'Cal'],
    [D, 'Dana'],
  ] as const) {
    await store.upsertUser({ uid });
    await store.updateCreatorProfile(uid, { profileName });
  }
}

async function ownedGame(store: Store) {
  await seedUsers(store);
  const jobId = await store.allocateJobId();
  await store.createSubmission(jobId, A, 'Comet Courier');
  await store.setSubmissionSlug(jobId, SLUG);
  await store.appendCreatorMessage(jobId, 'Make the asteroids slower.');
  await store.appendBuildEvent(jobId, {
    kind: 'done',
    step: 'polishing',
    text: 'Asteroid speed reduced.',
    createdAt: AT,
  });
  await store.recordJobTransition(jobId, { to: 'ready_for_review', at: AT, by: 'gate', reason: 'gate_green' });
  await store.ensureGameAccess(SLUG, A, AT, AT);
  return { jobId };
}

describeStoreContract();

function describeStoreContract(): void {
  describe('editor invite store contract', () => {
    for (const [implName, makeStore] of IMPLEMENTATIONS) {
      describe(implName, () => {
        it('grants access only after accept and keeps remaining editors on remove', async () => {
          const store = makeStore();
          await seedUsers(store);
          await store.ensureGameAccess(SLUG, A, AT, AT);
          const beaCode = (await store.ensureRecipientCode(B, AT))!;
          const calCode = (await store.ensureRecipientCode(C, AT))!;

          expect(await store.createEditorInvitation(SLUG, A, B, AT, beaCode)).toMatchObject({ status: 'pending' });
          expect(await store.createEditorInvitation(SLUG, A, B, LATER, beaCode)).toBe('busy');
          expect((await store.getGameAccess(SLUG))?.editorUids).toEqual([]);

          expect(await store.acceptEditorInvitation(SLUG, B, LATER)).toMatchObject({ status: 'accepted' });
          expect((await store.getGameAccess(SLUG))?.editorUids).toEqual([B]);

          await store.createEditorInvitation(SLUG, A, C, LATER, calCode);
          await store.acceptEditorInvitation(SLUG, C, LATER);
          expect(await store.removeEditor(SLUG, A, B, LATER)).toMatchObject({ editorUids: [C] });
          expect((await store.getGameAccess(SLUG))?.editorUids).toEqual([C]);
          expect(await store.leaveGame(SLUG, C, LATER)).toMatchObject({ editorUids: [] });
        });

        it('renews after reject or expiry and refuses a transferred sender', async () => {
          const store = makeStore();
          await seedUsers(store);
          await store.ensureGameAccess(SLUG, A, AT, AT);
          const beaCode = (await store.ensureRecipientCode(B, AT))!;
          await store.createEditorInvitation(SLUG, A, B, AT, beaCode);
          expect(await store.rejectEditorInvitation(SLUG, B, LATER)).toMatchObject({ status: 'rejected' });
          expect(await store.createEditorInvitation(SLUG, A, B, LATER, beaCode)).toMatchObject({ status: 'pending' });

          await store.cancelEditorInvitation(SLUG, A, B, LATER);
          await store.createEditorInvitation(SLUG, A, B, AT, beaCode);
          expect(await store.acceptEditorInvitation(SLUG, B, AFTER_EXPIRY)).toBeNull();
          expect(await store.createEditorInvitation(SLUG, A, B, AFTER_EXPIRY, beaCode)).toMatchObject({
            status: 'pending',
          });

          await store.cancelEditorInvitation(SLUG, A, B, AFTER_EXPIRY);
          await store.createEditorInvitation(SLUG, A, B, AFTER_EXPIRY, beaCode);
          const access = await store.getGameAccess(SLUG);
          expect(
            await store.createGameTransferInvitation(SLUG, A, D, access!.accessRevision, AFTER_EXPIRY),
          ).toMatchObject({ status: 'pending' });
          expect(await store.acceptGameTransferInvitation(SLUG, D, AFTER_EXPIRY)).toMatchObject({
            status: 'accepted',
          });
          // Transfer cancels leftover editor invites rather than leaving a stale sender.
          expect(await store.acceptEditorInvitation(SLUG, B, AFTER_EXPIRY)).toBeNull();
        });
      });
    }
  });
}

describe('GO-03 share flow over HTTP', () => {
  it('B has no access before accept and can read after; D never can', async () => {
    const store = new InMemoryStore();
    const { jobId } = await ownedGame(store);
    const app = await createApp(store);
    const token = mintToken(jobId, SECRET);
    const beaCode = (await store.ensureRecipientCode(B, AT))!;

    await app.inject({
      method: 'POST',
      url: `/api/me/studio/games/${SLUG}/editors/invites`,
      headers: session(A),
      payload: { recipientCode: beaCode },
    });

    const before = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: session(B) });
    expect(before.json().events).toBeUndefined();
    const membersBefore = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/editors`,
      headers: session(B),
    });
    expect(membersBefore.statusCode).toBe(403);

    await app.inject({
      method: 'POST',
      url: `/api/me/editor-invites/${SLUG}/accept`,
      headers: session(B),
    });

    const after = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: session(B) });
    expect(after.json().events.map((event: { text: string }) => event.text)).toContain('Asteroid speed reduced.');

    const shelf = await app.inject({ method: 'GET', url: '/api/me/studio', headers: session(B) });
    expect(shelf.json().games.some((game: { slug?: string; viewerRole?: string }) => game.slug === SLUG)).toBe(true);
    expect(shelf.json().games.find((game: { slug?: string }) => game.slug === SLUG).viewerRole).toBe('editor');

    const stranger = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: session(D) });
    expect(stranger.json().events).toBeUndefined();
  });

  it('B cannot seal or manage members; only A can', async () => {
    const store = new InMemoryStore();
    const { jobId } = await ownedGame(store);
    const app = await createApp(store);
    const token = mintToken(jobId, SECRET);
    const beaCode = (await store.ensureRecipientCode(B, AT))!;
    await store.createEditorInvitation(SLUG, A, B, AT, beaCode);
    await store.acceptEditorInvitation(SLUG, B, AT);

    const seal = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/seal`,
      headers: session(B),
    });
    expect(seal.statusCode).toBe(403);

    const invite = await app.inject({
      method: 'POST',
      url: `/api/me/studio/games/${SLUG}/editors/invites`,
      headers: session(B),
      payload: { recipientCode: (await store.ensureRecipientCode(C, AT))! },
    });
    expect(invite.statusCode).toBe(403);

    const transfer = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/transfer`,
      headers: session(B),
    });
    expect(transfer.json().transfer).toBeNull();
  });

  it('B and C cannot hold the writer lock at the same time', async () => {
    const store = new InMemoryStore();
    await ownedGame(store);
    const beaCode = (await store.ensureRecipientCode(B, AT))!;
    const calCode = (await store.ensureRecipientCode(C, AT))!;
    await store.createEditorInvitation(SLUG, A, B, AT, beaCode);
    await store.acceptEditorInvitation(SLUG, B, AT);
    await store.createEditorInvitation(SLUG, A, C, AT, calCode);
    await store.acceptEditorInvitation(SLUG, C, AT);

    expect(await store.beginCheckoutRecovery(SLUG, 'b-lease', Date.now())).toBe(true);
    expect(await store.beginCheckoutRecovery(SLUG, 'c-lease', Date.now())).toBe(false);
    await store.finishCheckoutRecovery(SLUG, 'b-lease');
    expect(await store.beginCheckoutRecovery(SLUG, 'c-lease', Date.now())).toBe(true);
  });

  it('removing B mid-work revokes B and leaves C able to continue', async () => {
    const store = new InMemoryStore();
    await ownedGame(store);
    const app = await createApp(store);
    const beaCode = (await store.ensureRecipientCode(B, AT))!;
    const calCode = (await store.ensureRecipientCode(C, AT))!;
    await store.createEditorInvitation(SLUG, A, B, AT, beaCode);
    await store.acceptEditorInvitation(SLUG, B, AT);
    await store.createEditorInvitation(SLUG, A, C, AT, calCode);
    await store.acceptEditorInvitation(SLUG, C, AT);

    const bJob = await store.allocateJobId();
    await store.createSubmission(bJob, B, 'Comet Courier');
    await store.setSubmissionSlug(bJob, SLUG);
    await store.recordJobTransition(bJob, { to: 'building', at: AT, by: 'creator', reason: 'editor_round' });
    const generationBefore = (await store.getSubmission(bJob))?.roundGeneration ?? 1;
    const bToken = mintToken(bJob, SECRET);

    const removed = await app.inject({
      method: 'POST',
      url: `/api/me/studio/games/${SLUG}/editors/${memberKey(SLUG, B)}/remove`,
      headers: session(A),
    });
    expect(removed.statusCode).toBe(200);

    const bRound = await store.getSubmission(bJob);
    expect(bRound?.state).toBe('canceled');
    expect(bRound?.roundGeneration ?? 0).toBeGreaterThan(generationBefore);

    const feedback = await app.inject({
      method: 'POST',
      url: `/api/submissions/${bToken}/feedback`,
      headers: session(B),
      payload: { feedback: 'Keep going after I was removed.' },
    });
    expect(feedback.statusCode).toBe(409);
    expect(feedback.json().error).toBe('stale_owner');

    const cMembers = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/editors`,
      headers: session(C),
    });
    expect(cMembers.statusCode).toBe(200);
    expect(cMembers.json().viewerRole).toBe('editor');
    expect(await store.beginCheckoutRecovery(SLUG, 'c-after-b', Date.now())).toBe(true);
  });

  it('C can leave, D never joins, and deleting B does not destroy the game', async () => {
    const store = new InMemoryStore();
    await ownedGame(store);
    const app = await createApp(store);
    const beaCode = (await store.ensureRecipientCode(B, AT))!;
    const calCode = (await store.ensureRecipientCode(C, AT))!;
    await store.createEditorInvitation(SLUG, A, B, AT, beaCode);
    await store.acceptEditorInvitation(SLUG, B, AT);
    await store.createEditorInvitation(SLUG, A, C, AT, calCode);
    await store.acceptEditorInvitation(SLUG, C, AT);

    const left = await app.inject({
      method: 'POST',
      url: `/api/me/studio/games/${SLUG}/editors/leave`,
      headers: session(C),
    });
    expect(left.statusCode).toBe(200);

    const dJoin = await app.inject({
      method: 'POST',
      url: `/api/me/editor-invites/${SLUG}/accept`,
      headers: session(D),
    });
    expect(dJoin.statusCode).toBe(404);

    await eraseAccount({ store, uid: B, at: LATER });
    const access = await store.getGameAccess(SLUG);
    expect(access?.ownerUid).toBe(A);
    expect(access?.editorUids).not.toContain(B);
    expect(await store.getSubmissionBySlug(SLUG)).toMatchObject({ slug: SLUG });
  });

  it('accept racing cancel leaves at most one winner', async () => {
    const store = new InMemoryStore();
    await ownedGame(store);
    const app = await createApp(store);
    const beaCode = (await store.ensureRecipientCode(B, AT))!;
    await app.inject({
      method: 'POST',
      url: `/api/me/studio/games/${SLUG}/editors/invites`,
      headers: session(A),
      payload: { recipientCode: beaCode },
    });

    const [accepted, cancelled] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/me/editor-invites/${SLUG}/accept`,
        headers: session(B),
      }),
      app.inject({
        method: 'POST',
        url: `/api/me/studio/games/${SLUG}/editors/invites/${memberKey(SLUG, B)}/cancel`,
        headers: session(A),
      }),
    ]);
    const outcomes = [accepted.statusCode, cancelled.statusCode].sort();
    expect(outcomes).toContain(200);
    const members = await store.getGameAccess(SLUG);
    const pending = await store.listPendingEditorInvitesForSlug(SLUG, new Date().toISOString());
    if (members?.editorUids.includes(B)) {
      expect(pending).toHaveLength(0);
    } else {
      expect(accepted.statusCode === 200 || cancelled.statusCode === 200).toBe(true);
    }
  });
});
