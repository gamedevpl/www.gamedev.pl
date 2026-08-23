import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { GamesStore, SourceFile, VersionManifest } from '../delivery/games-store.js';
import { openProposal, reconcileProposalGate } from './proposals.js';
import { InMemoryStore, type ProposalRecord } from '../platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';
const NOW = Date.parse('2026-08-04T12:00:00Z');
const OWNER = 'g:kasia';
const PROPOSER = 'g:tomek';
const STRANGER = 'g:nosy';
const ADMIN = 'g:boss';
const SLUG = 'neon-drift';

function cookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

function fakeGamesStore() {
  const manifests = new Map<string, VersionManifest>();
  let counter = 0;
  const key = (slug: string, version: string) => `${slug}@${version}`;
  return {
    async putCandidateSources(input: {
      slug: string;
      issueNumber: number;
      files: SourceFile[];
      mode?: string;
      proposal?: { id: string; proposerUid: string };
    }) {
      const version = `v${++counter}`;
      const manifest = {
        slug: input.slug,
        version,
        createdAt: new Date(NOW).toISOString(),
        issueNumber: input.issueNumber,
        deliveryMode: input.mode ?? 'publish',
        ...(input.proposal ? { proposal: input.proposal } : {}),
        sourceFiles: input.files.map((f) => f.path),
      } as VersionManifest;
      manifests.set(key(input.slug, version), manifest);
      return { version, manifest };
    },
    async getManifest(slug: string, version: string) {
      return manifests.get(key(slug, version)) ?? null;
    },
    async adoptProposalVersion(input: { slug: string; version: string; proposalId: string; byUid: string | null }) {
      const manifest = manifests.get(key(input.slug, input.version));
      if (!manifest) throw new Error('no manifest');
      if (manifest.deliveryMode !== 'proposal') throw new Error('not a proposal');
      if (!manifest.gate?.green) throw new Error('no green gate');
      manifest.deliveryMode = 'publish';
      manifest.adopted = { proposalId: input.proposalId, byUid: input.byUid, at: new Date(NOW).toISOString() };
      return manifest;
    },
    setGate(slug: string, version: string, green: boolean) {
      const manifest = manifests.get(key(slug, version));
      if (manifest) manifest.gate = { green, ranAt: new Date(NOW).toISOString() };
    },
    manifests,
  };
}

type Fake = ReturnType<typeof fakeGamesStore>;

async function seed(store: InMemoryStore) {
  for (const uid of [OWNER, PROPOSER, STRANGER, ADMIN]) {
    await store.upsertUser({ uid, name: uid });
  }
  const job = await store.createSubmission(1_000_001, OWNER, 'Neon Drift');
  await store.setSubmissionSlug(job.issueNumber, SLUG);
  await store.setPublication({
    slug: SLUG,
    state: 'published',
    currentVersion: 'base-1',
    publishedAt: new Date(NOW).toISOString(),
  });
  await store.putContributionSettings({ slug: SLUG, mode: 'review', updatedAt: new Date(NOW).toISOString() });
}

/** Opens a proposal straight through the domain layer — the HTTP on-ramp is Remix's. */
async function seedProposal(
  store: InMemoryStore,
  gamesStore: Fake,
  opts?: { green?: boolean },
): Promise<ProposalRecord> {
  const deps = { store, gamesStore: gamesStore as unknown as GamesStore, now: () => NOW };
  const result = await openProposal(deps, {
    targetSlug: SLUG,
    proposerUid: PROPOSER,
    title: 'Tighter drift',
    description: 'Corners feel floaty at speed, so this raises grip and shortens boost.',
    base: { kind: 'store', version: 'base-1' },
    files: [{ path: 'game.ts', content: 'export const grip = 0.82;' }],
  });
  if (!result.ok) throw new Error(`setup failed: ${result.error}`);
  if (opts?.green !== false) {
    gamesStore.setGate(SLUG, result.proposal.version!, true);
    const reconciled = await reconcileProposalGate(deps, result.proposal.id);
    return reconciled!;
  }
  return result.proposal;
}

describe('proposal routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(store: InMemoryStore, gamesStore: Fake) {
    const app = await buildApp({
      store,
      sessionSecret,
      adminUids: ADMIN,
      submissionRoutes: { agentChannel: { gamesStore: gamesStore as unknown as GamesStore } },
    });
    apps.push(app);
    return app;
  }

  it('tells a player whether a game takes proposals', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    await seed(store);
    const app = await appWith(store, gamesStore);

    const open = await app.inject({
      method: 'GET',
      url: `/api/games/${SLUG}/contributions`,
      headers: { cookie: cookie(PROPOSER) },
    });
    expect(open.json()).toMatchObject({ canPropose: true });

    await store.putContributionSettings({ slug: SLUG, mode: 'off', updatedAt: new Date(NOW).toISOString() });
    const shut = await app.inject({
      method: 'GET',
      url: `/api/games/${SLUG}/contributions`,
      headers: { cookie: cookie(PROPOSER) },
    });
    expect(shut.json()).toMatchObject({ canPropose: false, reason: 'contributions_off' });
  });

  it('never tells someone they have been blocked', async () => {
    // A block is a private boundary. Reporting it turns it into a notification.
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    await seed(store);
    await store.blockContributor({ ownerUid: OWNER, blockedUid: PROPOSER, createdAt: new Date(NOW).toISOString() });
    const app = await appWith(store, gamesStore);

    const response = await app.inject({
      method: 'GET',
      url: `/api/games/${SLUG}/contributions`,
      headers: { cookie: cookie(PROPOSER) },
    });
    expect(response.json()).toMatchObject({ canPropose: false, reason: 'contributions_off' });
  });

  it('shows a proposal to its author, its reviewer, and nobody else', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    await seed(store);
    const proposal = await seedProposal(store, gamesStore);
    const app = await appWith(store, gamesStore);

    for (const uid of [PROPOSER, OWNER]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/proposals/${proposal.id}`,
        headers: { cookie: cookie(uid) },
      });
      expect(response.statusCode).toBe(200);
    }

    // 404, not 403: a proposal's existence is not public, and confirming it would let
    // someone enumerate what is pending against a game they do not own.
    const stranger = await app.inject({
      method: 'GET',
      url: `/api/proposals/${proposal.id}`,
      headers: { cookie: cookie(STRANGER) },
    });
    expect(stranger.statusCode).toBe(404);
  });

  it('keeps a red proposal out of the reviewer queue', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    await seed(store);
    const proposal = await seedProposal(store, gamesStore, { green: false });
    const app = await appWith(store, gamesStore);

    const queue = await app.inject({ method: 'GET', url: '/api/me/reviews', headers: { cookie: cookie(OWNER) } });
    expect(queue.json().proposals).toHaveLength(0);
    // The author still sees their own.
    const mine = await app.inject({ method: 'GET', url: '/api/proposals', headers: { cookie: cookie(PROPOSER) } });
    expect(mine.json().proposals).toHaveLength(1);
    expect(mine.json().proposals[0]).toMatchObject({ id: proposal.id, state: 'checking' });
  });

  it('lets the owner accept, and publishes nothing by doing so', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    await seed(store);
    const proposal = await seedProposal(store, gamesStore);
    const app = await appWith(store, gamesStore);

    const accept = await app.inject({
      method: 'POST',
      url: `/api/proposals/${proposal.id}/accept`,
      headers: { cookie: cookie(OWNER) },
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json().proposal).toMatchObject({ state: 'accepted' });

    // The game is still serving what it served before.
    expect((await store.getPublication(SLUG))?.currentVersion).toBe('base-1');
    // And the owner now has a job holding the adopted version, ready to publish.
    const jobs = await store.listSubmissionsBySlug(SLUG);
    const adopted = jobs.find((job) => job.deliveredVersion === proposal.version);
    expect(adopted?.ownerUid).toBe(OWNER);
    expect(adopted?.state).toBe('ready_for_review');
  });

  it('refuses an accept from anybody but the owner', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    await seed(store);
    const proposal = await seedProposal(store, gamesStore);
    const app = await appWith(store, gamesStore);

    for (const uid of [STRANGER, PROPOSER, ADMIN]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/proposals/${proposal.id}/accept`,
        headers: { cookie: cookie(uid) },
      });
      // Including the admin: an operator does not review somebody's game for them.
      expect(response.statusCode).toBe(404);
    }
    expect((await store.getProposal(proposal.id))?.state).toBe('in_review');
  });

  it('routes platform-owned proposals to the operator queue only', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    for (const uid of [PROPOSER, ADMIN, STRANGER]) await store.upsertUser({ uid, name: uid });
    // No submission for this slug: a repo-lane catalog game, owned by the platform.
    const deps = { store, gamesStore: gamesStore as unknown as GamesStore, now: () => NOW };
    const result = await openProposal(deps, {
      targetSlug: 'apex-sprint',
      proposerUid: PROPOSER,
      title: 'Ghost lap replay',
      description: 'Race your previous best lap as a translucent ghost car, off by default.',
      base: { kind: 'repo', snapshotId: 'snap-1', sha: 'abc123' },
      files: [{ path: 'game.ts', content: 'export const ghost = true;' }],
    });
    if (!result.ok) throw new Error('setup failed');
    gamesStore.setGate('apex-sprint', result.proposal.version!, true);
    await reconcileProposalGate(deps, result.proposal.id);
    const app = await appWith(store, gamesStore);

    const ops = await app.inject({ method: 'GET', url: '/api/admin/proposals', headers: { cookie: cookie(ADMIN) } });
    expect(ops.json().proposals).toHaveLength(1);
    expect(ops.json().proposals[0]).toMatchObject({ platformOwned: true });

    // Non-admins do not learn the queue exists.
    const nosy = await app.inject({
      method: 'GET',
      url: '/api/admin/proposals',
      headers: { cookie: cookie(STRANGER) },
    });
    expect(nosy.statusCode).toBe(404);
  });

  it('lets an operator decide a platform-owned proposal', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    for (const uid of [PROPOSER, ADMIN]) await store.upsertUser({ uid, name: uid });
    const deps = { store, gamesStore: gamesStore as unknown as GamesStore, now: () => NOW };
    const result = await openProposal(deps, {
      targetSlug: 'apex-sprint',
      proposerUid: PROPOSER,
      title: 'Ghost lap replay',
      description: 'Race your previous best lap as a translucent ghost car, off by default.',
      base: { kind: 'repo', snapshotId: 'snap-1', sha: 'abc123' },
      files: [{ path: 'game.ts', content: 'export const ghost = true;' }],
    });
    if (!result.ok) throw new Error('setup failed');
    gamesStore.setGate('apex-sprint', result.proposal.version!, true);
    await reconcileProposalGate(deps, result.proposal.id);
    const app = await appWith(store, gamesStore);

    const decline = await app.inject({
      method: 'POST',
      url: `/api/proposals/${result.proposal.id}/decline`,
      headers: { cookie: cookie(ADMIN) },
      payload: { reason: 'unsafe' },
    });
    expect(decline.statusCode).toBe(200);
    // A platform moderation decline owes a statement of reasons; the record proves we know.
    expect((await store.getProposal(result.proposal.id))?.decision?.statementSentAt).toBeTruthy();
  });

  it('lets the owner ask for changes and hands the proposal back', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    await seed(store);
    const proposal = await seedProposal(store, gamesStore);
    const app = await appWith(store, gamesStore);

    const response = await app.inject({
      method: 'POST',
      url: `/api/proposals/${proposal.id}/changes`,
      headers: { cookie: cookie(OWNER) },
      payload: { text: 'The ghost overlaps the HUD in portrait.' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().proposal).toMatchObject({ state: 'changes_requested' });
  });

  it('only lets the owner change the contributions setting', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    await seed(store);
    const app = await appWith(store, gamesStore);

    const mine = await app.inject({
      method: 'PUT',
      url: `/api/me/games/${SLUG}/contributions`,
      headers: { cookie: cookie(OWNER) },
      payload: { mode: 'off' },
    });
    expect(mine.statusCode).toBe(200);
    expect(await store.getContributionSettings(SLUG)).toMatchObject({ mode: 'off' });

    const theirs = await app.inject({
      method: 'PUT',
      url: `/api/me/games/${SLUG}/contributions`,
      headers: { cookie: cookie(STRANGER) },
      payload: { mode: 'review' },
    });
    expect(theirs.statusCode).toBe(404);
    expect(await store.getContributionSettings(SLUG)).toMatchObject({ mode: 'off' });
  });

  it('blocks and unblocks a contributor', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    await seed(store);
    const app = await appWith(store, gamesStore);

    await app.inject({
      method: 'POST',
      url: '/api/me/contributor-blocks',
      headers: { cookie: cookie(OWNER) },
      payload: { uid: PROPOSER },
    });
    expect(await store.isContributorBlocked(OWNER, PROPOSER)).toBe(true);

    await app.inject({
      method: 'DELETE',
      url: `/api/me/contributor-blocks/${PROPOSER}`,
      headers: { cookie: cookie(OWNER) },
    });
    expect(await store.isContributorBlocked(OWNER, PROPOSER)).toBe(false);
  });

  it('requires a session', async () => {
    const store = new InMemoryStore();
    const gamesStore = fakeGamesStore();
    await seed(store);
    const app = await appWith(store, gamesStore);
    const response = await app.inject({ method: 'GET', url: '/api/proposals' });
    expect(response.statusCode).toBe(401);
  });
});
