import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './platform/auth.js';
import { mintToken } from './platform/submission-token.js';
import { mintAgentToken } from './platform/agent-token.js';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { MAX_REVOKED_ROUNDS_PER_TRANSFER } from './store/slices/game-transfer.js';
import type { AgentBackend } from './agent-surface/agent-backend.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './catalog/github-client.js';
import type { GamesStore } from './delivery/games-store.js';
import { currentOwnerUid } from './platform/game-access-resolve.js';
import { InMemoryStore } from './platform/store.js';

// The transfer walked end to end, from both sides, and back again.

const SECRET = 'transfer-flow-secret';
const SESSION_SECRET = 'dev-session-secret-change-me';
const SENDER = 'g:sender';
const RECIPIENT = 'g:recipient';

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

async function createApp(store: InMemoryStore) {
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

// A game owned by SENDER, with a round's history behind it.
async function gameWithHistory(store: InMemoryStore, opts?: { published?: boolean }) {
  const at = '2026-01-01T00:00:00.000Z';
  await store.upsertUser({ uid: SENDER });
  await store.upsertUser({ uid: RECIPIENT });
  const jobId = await store.allocateJobId();
  await store.createSubmission(jobId, SENDER, 'Comet Courier');
  await store.setSubmissionSlug(jobId, 'comet-courier');
  await store.setSubmissionDeliveredVersion(jobId, 'v1');
  await store.appendCreatorMessage(jobId, 'Make the asteroids slower.');
  await store.appendBuildEvent(jobId, {
    kind: 'done',
    step: 'polishing',
    text: 'Asteroid speed reduced.',
    createdAt: at,
  });
  await store.recordJobTransition(jobId, { to: 'ready_for_review', at, by: 'gate', reason: 'gate_green' });
  const shot = await store.appendBuildShot(jobId, {
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
    mediaType: 'image/png',
    label: 'Opening screen',
  });
  if (opts?.published) {
    await store.setSubmissionPublishedAt(jobId, at);
    await store.setPublication({ slug: 'comet-courier', state: 'published', currentVersion: 'v1', publishedAt: at });
  }
  await store.ensureGameAccess('comet-courier', SENDER, at, at);
  return { jobId, at, shotId: shot.id };
}

// The real handover, over the routes a creator uses.
async function handOver(app: FastifyInstance, store: InMemoryStore, from: string, to: string, at: string) {
  const code = await store.ensureRecipientCode(to, at);
  const initiated = await app.inject({
    method: 'POST',
    url: '/api/me/studio/games/comet-courier/transfer',
    headers: session(from),
    payload: { recipientCode: code },
  });
  expect(initiated.statusCode).toBe(200);
  const accepted = await app.inject({
    method: 'POST',
    url: '/api/me/transfers/comet-courier/accept',
    headers: session(to),
  });
  expect(accepted.statusCode).toBe(200);
}

describe('after a transfer, the sender keeps nothing', () => {
  it('cannot read the round’s private history, chat or media, and cannot write to it', async () => {
    const store = new InMemoryStore();
    const { jobId, at, shotId } = await gameWithHistory(store);
    const app = await createApp(store);
    const token = mintToken(jobId, SECRET);

    // The sender's own token works while the game is theirs.
    const shotBefore = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/shot/${shotId}`,
      headers: session(SENDER),
    });
    expect(shotBefore.statusCode).toBe(200);

    await handOver(app, store, SENDER, RECIPIENT, at);

    // Same token, same session, same job: somebody else's game now.
    const shot = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/shot/${shotId}`,
      headers: session(SENDER),
    });
    expect(shot.statusCode).toBe(404);

    const feedback = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: session(SENDER),
      payload: { feedback: 'Quietly keep working on the game I gave away.' },
    });
    expect(feedback.statusCode).toBe(409);
    expect(feedback.json().error).toBe('stale_owner');
    // Nothing reached the round's inbox.
    expect(await store.listCreatorMessages(jobId)).toHaveLength(1);

    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: session(SENDER) });
    expect(status.statusCode).toBe(200);
    // State is a receipt the token carries; what was said is not.
    expect(status.json().status).toBeDefined();
    expect(status.json().priorRounds).toBeUndefined();
    expect(status.json().events).toBeUndefined();
    expect(status.json().media).toBeUndefined();

    // The recipient, on the same job, gets all of it.
    const theirs = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: session(RECIPIENT),
    });
    expect(theirs.json().events.map((event: { text: string }) => event.text)).toContain('Asteroid speed reduced.');
  });

  it('cannot reuse an agent round key: the transfer advances every round’s generation', async () => {
    const store = new InMemoryStore();
    const { jobId, at } = await gameWithHistory(store);
    const app = await createApp(store);
    const generationBefore = (await store.bumpRoundGeneration(jobId)) ?? 0;

    await handOver(app, store, SENDER, RECIPIENT, at);

    const after = (await store.getSubmission(jobId))?.roundGeneration ?? 0;
    // Past the terminal-receipt window too, not merely one ahead.
    expect(after).toBeGreaterThan(generationBefore + 1);
  });

  it('cannot reuse a round key from beyond the revocation cap', async () => {
    // The cap rewrites the newest rounds only; a busy game outruns it.
    const store = new InMemoryStore();
    const { jobId, at } = await gameWithHistory(store);
    for (let i = 0; i < MAX_REVOKED_ROUNDS_PER_TRANSFER + 4; i += 1) {
      const later = await store.allocateJobId();
      await store.createSubmission(later, SENDER, `Round ${i}`);
      await store.setSubmissionSlug(later, 'comet-courier');
      await store.bumpRoundGeneration(later);
    }
    const generation = (await store.bumpRoundGeneration(jobId)) ?? 1;
    const app = await createApp(store);
    const headers = { authorization: `Bearer ${mintAgentToken(jobId, SECRET, { roundGeneration: generation })}` };

    const before = await app.inject({ method: 'GET', url: AGENT_CHANNEL_ROUTES.INBOX, headers });
    expect(before.statusCode).toBe(200);

    await handOver(app, store, SENDER, RECIPIENT, at);

    const after = await app.inject({ method: 'GET', url: AGENT_CHANNEL_ROUTES.INBOX, headers });
    expect(after.statusCode).toBe(401);
    // The cap really did leave this round alone: authority is what refused it.
    expect((await store.getSubmission(jobId))?.roundGeneration).toBe(generation);
  });

  it('cannot start work through a concurrent accept: the lock holds both ways', async () => {
    const store = new InMemoryStore();
    const { at } = await gameWithHistory(store, { published: true });
    const app = await createApp(store);
    const code = await store.ensureRecipientCode(RECIPIENT, at);
    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/comet-courier/transfer',
      headers: session(SENDER),
      payload: { recipientCode: code },
    });

    // The accept lands while the sender is opening a round.
    const originalBegin = store.beginCheckoutRecovery.bind(store);
    let acceptDuringWindow: unknown;
    const spy = vi.spyOn(store, 'beginCheckoutRecovery').mockImplementationOnce(async (...args) => {
      const held = await originalBegin(...args);
      acceptDuringWindow = await store.acceptGameTransferInvitation('comet-courier', RECIPIENT, at);
      return held;
    });
    try {
      await app.inject({
        method: 'POST',
        url: `/api/submissions/${mintToken((await store.getSubmissionBySlug('comet-courier'))!.jobId, SECRET)}/improve`,
        headers: session(SENDER),
        payload: { feedback: 'One more change before the handover completes.' },
      });
      expect(acceptDuringWindow).toBe('busy');
      // Refused, not silently committed: the sender still owns it.
      expect((await store.getGameAccess('comet-courier'))?.ownerUid).toBe(SENDER);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('after a transfer, the recipient has the whole game', () => {
  it('sees the history the sender built, which no longer carries their uid', async () => {
    const store = new InMemoryStore();
    const { jobId, at } = await gameWithHistory(store, { published: true });
    const app = await createApp(store);

    await handOver(app, store, SENDER, RECIPIENT, at);

    const improve = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, SECRET)}/improve`,
      headers: session(RECIPIENT),
      payload: { feedback: 'Add a pause button to the schedule screen.' },
    });
    expect(improve.statusCode).toBe(200);

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${improve.json().token}`,
      headers: session(RECIPIENT),
    });
    const prior = (status.json().priorRounds ?? []) as Array<{ id: string; entries: Array<{ text: string }> }>;
    expect(prior.map((round) => round.id)).toContain(String(jobId));
    expect(prior.flatMap((round) => round.entries.map((entry) => entry.text))).toEqual(
      expect.arrayContaining(['Make the asteroids slower.', 'Asteroid speed reduced.']),
    );
  });

  it('can open the first round on the game, which the sender’s round lineage no longer blocks', async () => {
    const store = new InMemoryStore();
    const { jobId, at } = await gameWithHistory(store, { published: true });
    const app = await createApp(store);

    await handOver(app, store, SENDER, RECIPIENT, at);

    const improve = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, SECRET)}/improve`,
      headers: session(RECIPIENT),
      payload: { feedback: 'Add a pause button to the schedule screen.' },
    });

    expect(improve.statusCode).toBe(200);
    const opened = await store.getSubmission(improve.json().jobId as number);
    // Owned by, and charged to, the recipient — not the row it inherited.
    expect(opened?.ownerUid).toBe(RECIPIENT);
    expect(opened?.slug).toBe('comet-courier');
  });

  it('sees suggestions raised against the game before it changed hands', async () => {
    const store = new InMemoryStore();
    const { at } = await gameWithHistory(store);
    const app = await createApp(store);
    await store.putSuggestion({
      id: 'sug-comet-courier-defect-2026-01-01',
      slug: 'comet-courier',
      ownerUid: SENDER,
      class: 'defect',
      priority: 40,
      evidence: [{ finding: '40 uncaught errors across 100 sessions.', metrics: { errors: 40 } }],
      status: 'proposed',
      computedFrom: at,
      createdAt: at,
      updatedAt: at,
    });

    await handOver(app, store, SENDER, RECIPIENT, at);

    const mine = await app.inject({ method: 'GET', url: '/api/me/suggestions', headers: session(RECIPIENT) });
    expect(mine.json().suggestions.map((s: { slug: string }) => s.slug)).toEqual(['comet-courier']);
    const theirs = await app.inject({ method: 'GET', url: '/api/me/suggestions', headers: session(SENDER) });
    expect(theirs.json().suggestions).toEqual([]);
  });
});

describe('after a transfer, preferences and counters follow the owner', () => {
  it('obeys the new owner’s mute, not the one the sender set', async () => {
    const store = new InMemoryStore();
    const { jobId, at } = await gameWithHistory(store);
    const app = await createApp(store);
    // Opposite settings, so whichever one is read is unambiguous.
    await store.setProposalsMuted(SENDER, null);
    await store.setProposalsMuted(RECIPIENT, at);

    await handOver(app, store, SENDER, RECIPIENT, at);

    // The posting transaction re-reads the mute against this uid.
    const record = (await store.getSubmission(jobId))!;
    const ownerNow = await currentOwnerUid(store, record.slug!, record.ownerUid);
    expect(ownerNow).toBe(RECIPIENT);
    const claim = { version: 'v1', claimedAt: at };
    await store.claimDreamRun(jobId, 'v1', at, record.roundGeneration ?? 1);
    const posted = await store.appendProposalMessage(jobId, claim, 'A concept for you.', {
      proposal: { sourceRef: 'shot-1', version: 'v1', options: [], builder: 'self' },
      ownerUid: ownerNow!,
      roundGeneration: record.roundGeneration ?? 1,
      blocked: () => false,
    });
    expect(posted).toMatchObject({ posted: null, refusedBy: 'muted' });
  });

  it('stops counting the sender’s round as their own work in flight', async () => {
    const store = new InMemoryStore();
    const { at } = await gameWithHistory(store);
    const app = await createApp(store);

    const before = await app.inject({
      method: 'GET',
      url: '/api/submissions/mine/active-count',
      headers: session(SENDER),
    });
    expect(before.json().active).toBe(1);

    await handOver(app, store, SENDER, RECIPIENT, at);

    const after = await app.inject({
      method: 'GET',
      url: '/api/submissions/mine/active-count',
      headers: session(SENDER),
    });
    expect(after.json().active).toBe(0);
  });
});

describe('the transfer itself', () => {
  it('is safe to accept twice', async () => {
    const store = new InMemoryStore();
    const { at } = await gameWithHistory(store);
    const app = await createApp(store);
    await handOver(app, store, SENDER, RECIPIENT, at);
    const revisionAfterFirst = (await store.getGameAccess('comet-courier'))?.accessRevision;

    const again = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/comet-courier/accept',
      headers: session(RECIPIENT),
    });

    expect(again.statusCode).toBe(200);
    expect((await store.getGameAccess('comet-courier'))?.accessRevision).toBe(revisionAfterFirst);
  });

  it('runs in reverse: the recipient can hand the game back', async () => {
    const store = new InMemoryStore();
    const { jobId, at } = await gameWithHistory(store, { published: true });
    const app = await createApp(store);
    await handOver(app, store, SENDER, RECIPIENT, at);

    await handOver(app, store, RECIPIENT, SENDER, at);

    expect((await store.getGameAccess('comet-courier'))?.ownerUid).toBe(SENDER);
    // And the game comes back whole: the history survived both hops.
    const improve = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, SECRET)}/improve`,
      headers: session(SENDER),
      payload: { feedback: 'Picking this back up where it left off.' },
    });
    expect(improve.statusCode).toBe(200);
    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${improve.json().token}`,
      headers: session(SENDER),
    });
    const prior = (status.json().priorRounds ?? []) as Array<{ id: string }>;
    expect(prior.map((round) => round.id)).toContain(String(jobId));
  });
});
