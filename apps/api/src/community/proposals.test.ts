import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GamesStore, SourceFile, VersionManifest } from '../delivery/games-store.js';
import { isPublishableMode } from '../delivery/games-store.js';
import {
  acceptProposal,
  canProposeTo,
  declineProposal,
  expireStaleProposals,
  markProposalsMerged,
  openProposal,
  reconcileProposalGate,
  requestProposalChanges,
  supersedeStaleProposals,
  visibleToReviewer,
  withdrawProposal,
} from './proposals.js';
import { PROPOSAL_EXPIRY_MS } from './proposal-state.js';
import { InMemoryStore } from '../platform/store.js';

const NOW = Date.parse('2026-08-04T12:00:00Z');

const OWNER = 'g:kasia';
const PROPOSER = 'g:tomek';
const SLUG = 'neon-drift';

function sources(overrides?: Partial<Record<string, string>>): SourceFile[] {
  return [
    { path: 'SPEC.md', content: '---\ntitle: Neon Drift\nslug: neon-drift\n---\nA racer.' },
    { path: 'game.ts', content: overrides?.['game.ts'] ?? 'export const grip = 0.5;' },
  ];
}

/**
 * A games store that keeps manifests in a map. Real enough to exercise the mode flip,
 * which is the invariant most of these tests are about.
 */
function fakeGamesStore() {
  const manifests = new Map<string, VersionManifest>();
  const filesByVersion = new Map<string, SourceFile[]>();
  let counter = 0;
  const key = (slug: string, version: string) => `${slug}@${version}`;
  const store = {
    async putCandidateSources(input: {
      slug: string;
      jobId: number;
      files: SourceFile[];
      mode?: string;
      proposal?: { id: string; proposerUid: string };
    }) {
      const version = `v${++counter}`;
      const manifest = {
        slug: input.slug,
        version,
        createdAt: new Date(NOW).toISOString(),
        jobId: input.jobId,
        deliveryMode: input.mode ?? 'publish',
        ...(input.proposal ? { proposal: input.proposal } : {}),
        sourceFiles: input.files.map((file) => file.path),
      } as VersionManifest;
      manifests.set(key(input.slug, version), manifest);
      filesByVersion.set(key(input.slug, version), input.files);
      return { version, manifest };
    },
    async getManifest(slug: string, version: string) {
      return manifests.get(key(slug, version)) ?? null;
    },
    async adoptProposalVersion(input: { slug: string; version: string; proposalId: string; byUid: string | null }) {
      const manifest = manifests.get(key(input.slug, input.version));
      if (!manifest) throw new Error('no manifest');
      if (manifest.deliveryMode !== 'proposal') throw new Error('not a proposal version');
      if (!manifest.gate?.green) throw new Error('no green gate verdict');
      manifest.deliveryMode = 'publish';
      manifest.adopted = { proposalId: input.proposalId, byUid: input.byUid, at: new Date(NOW).toISOString() };
      return manifest;
    },
    /** Test-only: stand in for the gate having run. */
    setGate(slug: string, version: string, gate: { green: boolean; report?: string; behaviouralDiff?: boolean }) {
      const manifest = manifests.get(key(slug, version));
      if (manifest) manifest.gate = { ...gate, ranAt: new Date(NOW).toISOString() };
    },
    manifests,
  };
  return store as unknown as GamesStore & {
    setGate: (
      slug: string,
      version: string,
      gate: { green: boolean; report?: string; behaviouralDiff?: boolean },
    ) => void;
    manifests: Map<string, VersionManifest>;
  };
}

async function seedPublishedCreatorGame(store: InMemoryStore, opts?: { mode?: 'off' | 'review' }) {
  await store.upsertUser({ uid: OWNER, name: 'Kasia' });
  await store.upsertUser({ uid: PROPOSER, name: 'Tomek' });
  const job = await store.createSubmission(1_000_001, OWNER, 'Neon Drift');
  await store.setSubmissionSlug(job.jobId, SLUG);
  await store.setPublication({
    slug: SLUG,
    state: 'published',
    currentVersion: 'base-1',
    publishedAt: new Date(NOW).toISOString(),
  });
  await store.putContributionSettings({
    slug: SLUG,
    mode: opts?.mode ?? 'review',
    updatedAt: new Date(NOW).toISOString(),
  });
}

function deps(store: InMemoryStore, gamesStore: ReturnType<typeof fakeGamesStore>) {
  return { store, gamesStore, now: () => NOW };
}

const OPEN_INPUT = {
  targetSlug: SLUG,
  proposerUid: PROPOSER,
  title: 'Tighter drift',
  description: 'Corners feel floaty at high speed, so this raises grip and shortens boost.',
  base: { kind: 'store' as const, version: 'base-1' },
  files: sources({ 'game.ts': 'export const grip = 0.82;' }),
};

describe('eligibility', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await seedPublishedCreatorGame(store);
  });

  it('allows a proposal to a contributions-on game', async () => {
    const verdict = await canProposeTo(store, SLUG, PROPOSER);
    expect(verdict).toMatchObject({ ok: true, owner: { kind: 'creator', uid: OWNER } });
  });

  it('refuses when the creator has contributions off', async () => {
    await store.putContributionSettings({ slug: SLUG, mode: 'off', updatedAt: new Date(NOW).toISOString() });
    expect(await canProposeTo(store, SLUG, PROPOSER)).toMatchObject({ ok: false, reason: 'contributions_off' });
  });

  it('refuses a game nobody has configured — off is the default, not a placeholder', async () => {
    const fresh = new InMemoryStore();
    await fresh.upsertUser({ uid: OWNER, name: 'Kasia' });
    const job = await fresh.createSubmission(1_000_002, OWNER, 'Quiet Game');
    await fresh.setSubmissionSlug(job.jobId, 'quiet-game');
    expect(await canProposeTo(fresh, 'quiet-game', PROPOSER)).toMatchObject({
      ok: false,
      reason: 'contributions_off',
    });
  });

  it('refuses a blocked contributor', async () => {
    await store.blockContributor({ ownerUid: OWNER, blockedUid: PROPOSER, createdAt: new Date(NOW).toISOString() });
    expect(await canProposeTo(store, SLUG, PROPOSER)).toMatchObject({ ok: false, reason: 'blocked' });
  });

  it('sends the owner to improvement rounds instead of proposing to themselves', async () => {
    expect(await canProposeTo(store, SLUG, OWNER)).toMatchObject({ ok: false, reason: 'own_game' });
  });

  it('treats a game with no submission as platform-owned and open by default', async () => {
    // The repo-lane catalog: ~95% of it has no owner, and the ops queue is the reviewer.
    const fresh = new InMemoryStore();
    await fresh.upsertUser({ uid: PROPOSER, name: 'Tomek' });
    expect(await canProposeTo(fresh, 'apex-sprint', PROPOSER)).toMatchObject({
      ok: true,
      owner: { kind: 'platform' },
    });
  });

  it('lets the platform close a specific catalog game to contributions', async () => {
    const fresh = new InMemoryStore();
    await fresh.upsertUser({ uid: PROPOSER, name: 'Tomek' });
    await fresh.putContributionSettings({
      slug: 'apex-sprint',
      mode: 'off',
      updatedAt: new Date(NOW).toISOString(),
    });
    expect(await canProposeTo(fresh, 'apex-sprint', PROPOSER)).toMatchObject({
      ok: false,
      reason: 'contributions_off',
    });
  });

  it('refuses a game that has been taken down', async () => {
    await store.takedownPublication(SLUG, 'reported');
    expect(await canProposeTo(store, SLUG, PROPOSER)).toMatchObject({ ok: false, reason: 'not_published' });
  });
});

describe('opening a proposal', () => {
  let store: InMemoryStore;
  let gamesStore: ReturnType<typeof fakeGamesStore>;
  beforeEach(async () => {
    store = new InMemoryStore();
    gamesStore = fakeGamesStore();
    await seedPublishedCreatorGame(store);
  });

  it('writes a proposal-mode version and a submitted record', async () => {
    const result = await openProposal(deps(store, gamesStore), OPEN_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.state).toBe('submitted');
    expect(result.proposal.targetOwnerUid).toBe(OWNER);

    const manifest = await gamesStore.getManifest(SLUG, result.proposal.version!);
    expect(manifest?.deliveryMode).toBe('proposal');
    expect(manifest?.proposal).toMatchObject({ proposerUid: PROPOSER });
    // The invariant, stated where a publish path would read it.
    expect(isPublishableMode(manifest?.deliveryMode)).toBe(false);
  });

  it('creates no job — a submission on the target slug would transfer the game', async () => {
    const result = await openProposal(deps(store, gamesStore), OPEN_INPUT);
    expect(result.ok).toBe(true);
    const jobs = await store.listSubmissionsBySlug(SLUG);
    // Only the owner's original job. If a proposal made one, the newest live submission
    // for this slug would be the proposer's — and `creatorOwnsSlug` reads that as a
    // transfer, handing the game to whoever proposed to it.
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.ownerUid).toBe(OWNER);
  });

  it('refuses text that fails moderation, and stores nothing', async () => {
    const contentChecker = {
      check: vi.fn(),
      checkFields: vi.fn().mockResolvedValue({ allowed: false, category: 'profanity' }),
    };
    const result = await openProposal({ ...deps(store, gamesStore), contentChecker }, OPEN_INPUT);
    expect(result).toMatchObject({ ok: false, status: 422, error: 'content_rejected', category: 'profanity' });
    expect(gamesStore.manifests.size).toBe(0);
    expect(await store.listProposals()).toHaveLength(0);
  });

  it('caps open proposals against one game', async () => {
    for (let i = 0; i < 3; i += 1) {
      const result = await openProposal(deps(store, gamesStore), OPEN_INPUT);
      expect(result.ok).toBe(true);
    }
    expect(await openProposal(deps(store, gamesStore), OPEN_INPUT)).toMatchObject({
      ok: false,
      error: 'too_many_open_here',
    });
  });

  it('requires a description long enough to say something', async () => {
    const result = await openProposal(deps(store, gamesStore), { ...OPEN_INPUT, description: 'fix' });
    expect(result).toMatchObject({ ok: false, status: 400, error: 'description_too_short' });
  });
});

describe('gate reconciliation', () => {
  let store: InMemoryStore;
  let gamesStore: ReturnType<typeof fakeGamesStore>;
  beforeEach(async () => {
    store = new InMemoryStore();
    gamesStore = fakeGamesStore();
    await seedPublishedCreatorGame(store);
  });

  async function open() {
    const result = await openProposal(deps(store, gamesStore), OPEN_INPUT);
    if (!result.ok) throw new Error('setup failed');
    return result.proposal;
  }

  it('sends a green proposal to the reviewer', async () => {
    const proposal = await open();
    gamesStore.setGate(SLUG, proposal.version!, { green: true });
    const reconciled = await reconcileProposalGate(deps(store, gamesStore), proposal.id);
    expect(reconciled?.state).toBe('in_review');
    expect(visibleToReviewer(reconciled!, OWNER, false)).toBe(true);
  });

  it('keeps a red proposal away from the reviewer entirely', async () => {
    const proposal = await open();
    gamesStore.setGate(SLUG, proposal.version!, { green: false, report: 'typecheck failed' });
    const reconciled = await reconcileProposalGate(deps(store, gamesStore), proposal.id);
    expect(reconciled?.state).toBe('needs_work');
    // The anti-abuse property: reaching a creator costs a change that actually runs.
    expect(visibleToReviewer(reconciled!, OWNER, false)).toBe(false);
  });

  it('flags a behavioural diff as a finding rather than refusing it', async () => {
    const proposal = await open();
    // Read off the verdict the proposal gate set, not sniffed out of the report text —
    // the report is a build log and its wording is not a contract.
    gamesStore.setGate(SLUG, proposal.version!, { green: true, behaviouralDiff: true });
    const reconciled = await reconcileProposalGate(deps(store, gamesStore), proposal.id);
    expect(reconciled?.behaviouralDiff).toBe(true);
    // Still reviewable: a proposal that changes behaviour is supposed to change the golden.
    expect(reconciled?.state).toBe('in_review');
  });

  it('does not invent a behavioural diff from a report that merely mentions the trace', async () => {
    const proposal = await open();
    gamesStore.setGate(SLUG, proposal.version!, { green: true, report: 'replayed TRACE.json: 0 differences' });
    const reconciled = await reconcileProposalGate(deps(store, gamesStore), proposal.id);
    expect(reconciled?.behaviouralDiff).toBeUndefined();
  });
});

describe('decisions', () => {
  let store: InMemoryStore;
  let gamesStore: ReturnType<typeof fakeGamesStore>;
  beforeEach(async () => {
    store = new InMemoryStore();
    gamesStore = fakeGamesStore();
    await seedPublishedCreatorGame(store);
  });

  async function openAndGreen() {
    const result = await openProposal(deps(store, gamesStore), OPEN_INPUT);
    if (!result.ok) throw new Error('setup failed');
    gamesStore.setGate(SLUG, result.proposal.version!, { green: true });
    const reconciled = await reconcileProposalGate(deps(store, gamesStore), result.proposal.id);
    return reconciled!;
  }

  it('accepting adopts the version but publishes nothing', async () => {
    const proposal = await openAndGreen();
    const adoptIntoJob = vi.fn().mockResolvedValue({ jobId: 1_000_009 });
    const result = await acceptProposal(
      { ...deps(store, gamesStore), adoptIntoJob },
      {
        id: proposal.id,
        byUid: OWNER,
        reviewer: 'creator',
      },
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.proposal.state).toBe('accepted');
    expect(result.proposal.adoptedJobId).toBe(1_000_009);

    // The version is now publishable — but by the owner's ordinary publish, not by this.
    const manifest = await gamesStore.getManifest(SLUG, proposal.version!);
    expect(manifest?.deliveryMode).toBe('publish');
    expect(manifest?.adopted).toMatchObject({ proposalId: proposal.id, byUid: OWNER });
    // Nothing about what is live changed.
    expect((await store.getPublication(SLUG))?.currentVersion).toBe('base-1');
  });

  it('refuses to accept a proposal the gate has not passed', async () => {
    const result = await openProposal(deps(store, gamesStore), OPEN_INPUT);
    if (!result.ok) throw new Error('setup failed');
    const adoptIntoJob = vi.fn();
    const accepted = await acceptProposal(
      { ...deps(store, gamesStore), adoptIntoJob },
      {
        id: result.proposal.id,
        byUid: OWNER,
        reviewer: 'creator',
      },
    );
    expect(accepted).toMatchObject({ ok: false, error: 'not_reviewable' });
    expect(adoptIntoJob).not.toHaveBeenCalled();
  });

  it('refuses to accept a proposal whose base moved under it', async () => {
    const proposal = await openAndGreen();
    await store.setPublication({
      slug: SLUG,
      state: 'published',
      currentVersion: 'base-2',
      publishedAt: new Date(NOW).toISOString(),
    });
    const adoptIntoJob = vi.fn();
    const result = await acceptProposal(
      { ...deps(store, gamesStore), adoptIntoJob },
      {
        id: proposal.id,
        byUid: OWNER,
        reviewer: 'creator',
      },
    );
    expect(result).toMatchObject({ ok: false, error: 'superseded' });
    expect(adoptIntoJob).not.toHaveBeenCalled();
    expect((await store.getProposal(proposal.id))?.state).toBe('superseded');
  });

  it('records a statement of reasons for a platform moderation decline only', async () => {
    const proposal = await openAndGreen();
    const result = await declineProposal(deps(store, gamesStore), {
      id: proposal.id,
      byUid: null,
      reviewer: 'platform',
      reason: 'unsafe',
    });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.proposal.decision?.statementSentAt).toBeTruthy();
  });

  it('does not turn a creator declining on taste into a legal notice', async () => {
    const proposal = await openAndGreen();
    const result = await declineProposal(deps(store, gamesStore), {
      id: proposal.id,
      byUid: OWNER,
      reviewer: 'creator',
      reason: 'not_the_direction',
    });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.proposal.decision?.statementSentAt).toBeUndefined();
  });

  it('hands a proposal back to its author on request-changes', async () => {
    const proposal = await openAndGreen();
    const result = await requestProposalChanges(deps(store, gamesStore), {
      id: proposal.id,
      byUid: OWNER,
      reviewer: 'creator',
      text: 'The ghost overlaps the HUD in portrait — can it sit under the lap counter?',
    });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.proposal.state).toBe('changes_requested');
    expect(result.proposal.thread).toHaveLength(1);
    expect(result.proposal.thread[0]).toMatchObject({ from: 'reviewer' });
  });

  it('lets the proposer withdraw, and hides it from the reviewer again', async () => {
    const proposal = await openAndGreen();
    const result = await withdrawProposal(deps(store, gamesStore), { id: proposal.id, uid: PROPOSER });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(visibleToReviewer(result.proposal, OWNER, false)).toBe(false);
  });

  it('404s a withdraw from somebody who is not the proposer', async () => {
    const proposal = await openAndGreen();
    expect(await withdrawProposal(deps(store, gamesStore), { id: proposal.id, uid: 'g:someone' })).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe('sweeps', () => {
  let store: InMemoryStore;
  let gamesStore: ReturnType<typeof fakeGamesStore>;
  beforeEach(async () => {
    store = new InMemoryStore();
    gamesStore = fakeGamesStore();
    await seedPublishedCreatorGame(store);
  });

  it('supersedes live proposals when the target publishes something else', async () => {
    const first = await openProposal(deps(store, gamesStore), OPEN_INPUT);
    if (!first.ok) throw new Error('setup failed');
    const count = await supersedeStaleProposals(deps(store, gamesStore), {
      slug: SLUG,
      currentVersion: 'base-2',
    });
    expect(count).toBe(1);
    expect((await store.getProposal(first.proposal.id))?.state).toBe('superseded');
  });

  it('spares the proposal that caused the publish', async () => {
    const winner = await openProposal(deps(store, gamesStore), OPEN_INPUT);
    if (!winner.ok) throw new Error('setup failed');
    const count = await supersedeStaleProposals(deps(store, gamesStore), {
      slug: SLUG,
      currentVersion: 'base-2',
      exceptProposalId: winner.proposal.id,
    });
    expect(count).toBe(0);
  });

  it('marks an accepted proposal merged once its version goes live', async () => {
    const result = await openProposal(deps(store, gamesStore), OPEN_INPUT);
    if (!result.ok) throw new Error('setup failed');
    gamesStore.setGate(SLUG, result.proposal.version!, { green: true });
    await reconcileProposalGate(deps(store, gamesStore), result.proposal.id);
    await acceptProposal(
      { ...deps(store, gamesStore), adoptIntoJob: async () => ({ jobId: 1_000_009 }) },
      { id: result.proposal.id, byUid: OWNER, reviewer: 'creator' },
    );

    const merged = await markProposalsMerged(deps(store, gamesStore), {
      slug: SLUG,
      version: result.proposal.version!,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.state).toBe('merged');
  });

  it('expires a proposal the owner never looked at, without calling it a decline', async () => {
    const result = await openProposal(deps(store, gamesStore), OPEN_INPUT);
    if (!result.ok) throw new Error('setup failed');
    gamesStore.setGate(SLUG, result.proposal.version!, { green: true });
    await reconcileProposalGate(deps(store, gamesStore), result.proposal.id);

    const later = NOW + PROPOSAL_EXPIRY_MS + 1;
    const expired = await expireStaleProposals({ store, gamesStore, now: () => later });
    expect(expired).toHaveLength(1);
    expect(expired[0]?.state).toBe('expired');
    // Not a decline: nobody rejected anything, so there is no decision to report.
    expect(expired[0]?.decision).toBeUndefined();
  });

  it('leaves a fresh proposal alone', async () => {
    const result = await openProposal(deps(store, gamesStore), OPEN_INPUT);
    if (!result.ok) throw new Error('setup failed');
    gamesStore.setGate(SLUG, result.proposal.version!, { green: true });
    await reconcileProposalGate(deps(store, gamesStore), result.proposal.id);
    expect(await expireStaleProposals(deps(store, gamesStore))).toHaveLength(0);
  });
});

describe('reviewer routing', () => {
  it('routes platform-owned proposals to operators only', () => {
    const record = { state: 'in_review', targetOwnerUid: null } as never;
    expect(visibleToReviewer(record, 'g:anyone', false)).toBe(false);
    expect(visibleToReviewer(record, 'g:anyone', true)).toBe(true);
  });

  it('routes creator-owned proposals to that creator only', () => {
    const record = { state: 'in_review', targetOwnerUid: OWNER } as never;
    expect(visibleToReviewer(record, OWNER, false)).toBe(true);
    expect(visibleToReviewer(record, 'g:someone', false)).toBe(false);
    // An operator does not get to review somebody's game for them.
    expect(visibleToReviewer(record, 'g:someone', true)).toBe(false);
  });
});
