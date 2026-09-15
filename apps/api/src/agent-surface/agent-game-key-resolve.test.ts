import type { BuilderKind } from '@gamedevpl/contract';
import { describe, expect, it } from 'vitest';
import { NO_OPEN_ROUND_REASON, PLATFORM_ROUND_REASON, mintGameAgentKey } from './agent-game-key.js';
import {
  findActiveRoundForSlug,
  findDraftJobForSlug,
  resolveGameAgentKeyForOpenRound,
  resolveGameAgentKeyForStart,
  verifyDurableGameAgentKey,
} from './agent-game-key-resolve.js';
import type { SubmissionRecord } from '../platform/store.js';
import { InMemoryStore } from '../platform/store.js';
import { creatorOwnsSlug } from '../platform/slug-ownership.js';

const secret = 'resolve-game-key-secret';
const slug = 'comet-courier';
const ownerUid = 'g:owner';
const now = Date.parse('2026-07-31T12:00:00.000Z');

function submissionMap(store: InMemoryStore): Map<number, SubmissionRecord> {
  return (store as unknown as { submissions: Map<number, SubmissionRecord> }).submissions;
}

/**
 * Fails loudly on a missing job: every ordering assertion in this file depends on the
 * timestamps this sets, and silently doing nothing would leave the record on its
 * real-clock `createdAt` — so a typo'd issue number would produce a green run that
 * proved nothing about ordering.
 */
function setCreatedAt(store: InMemoryStore, jobId: number, createdAt: string): void {
  const map = submissionMap(store);
  const sub = map.get(jobId);
  if (!sub) {
    throw new Error(`setCreatedAt: no submission ${jobId} — seed it before setting createdAt`);
  }
  map.set(jobId, { ...sub, createdAt });
}

async function seedActiveSelfRound(store: InMemoryStore, jobId: number, builder: BuilderKind = 'self') {
  await store.createSubmission(jobId, ownerUid, 'Comet Courier');
  await store.setSubmissionSlug(jobId, slug);
  await store.setRoundBuilder(jobId, builder);
  await store.recordJobTransition(jobId, {
    to: 'dispatched',
    at: new Date(now).toISOString(),
    by: 'system',
  });
  await store.ensureRoundGeneration(jobId);
}

async function seedPublishedGame(store: InMemoryStore, jobId: number, createdAt = '2026-07-01T00:00:00.000Z') {
  await store.createSubmission(jobId, ownerUid, 'Comet Courier');
  await store.setSubmissionSlug(jobId, slug);
  await store.setRoundBuilder(jobId, 'self');
  setCreatedAt(store, jobId, createdAt);
  await store.setSubmissionPublishedAt(jobId, createdAt);
  await store.recordJobTransition(jobId, {
    to: 'published',
    at: createdAt,
    by: 'operator',
    reason: 'published',
  });
}

/** 250 newer jobs on other slugs — pushes an older game past the owner-list window. */
async function seedManyNewerJobs(store: InMemoryStore, count: number, startIssue: number) {
  const map = submissionMap(store);
  for (let i = 0; i < count; i++) {
    const issue = startIssue + i;
    await store.createSubmission(issue, ownerUid, `Other game ${issue}`);
    await store.setSubmissionSlug(issue, `other-game-${issue}`);
    const sub = map.get(issue)!;
    map.set(issue, {
      ...sub,
      createdAt: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
    });
  }
}

function gameKey(generation = 1) {
  return mintGameAgentKey(secret, { slug, creatorUid: ownerUid, keyGeneration: generation, now });
}

describe('resolveGameAgentKeyForStart', () => {
  it('refuses when no open round exists', async () => {
    const store = new InMemoryStore();
    const at = new Date(now).toISOString();
    await store.ensureGameAgentKey(slug, ownerUid, at);
    await store.createSubmission(10, ownerUid, 'Comet Courier');
    await store.setSubmissionSlug(10, slug);
    await store.recordJobTransition(10, {
      to: 'ready_for_review',
      at: new Date(now).toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });

    const result = await resolveGameAgentKeyForStart(store, gameKey(), secret, now);
    expect(result).toEqual({ ok: false, reason: NO_OPEN_ROUND_REASON });
  });

  it('refuses when the open round is platform-built', async () => {
    const store = new InMemoryStore();
    const at = new Date(now).toISOString();
    await store.ensureGameAgentKey(slug, ownerUid, at);
    await seedActiveSelfRound(store, 11, 'platform');

    const result = await resolveGameAgentKeyForStart(store, gameKey(), secret, now);
    expect(result).toEqual({ ok: false, reason: PLATFORM_ROUND_REASON });
  });

  it('refuses when the key owner does not match the slug record', async () => {
    const store = new InMemoryStore();
    const at = new Date(now).toISOString();
    await store.ensureGameAgentKey(slug, ownerUid, at);
    await seedActiveSelfRound(store, 12, 'self');

    const strangerKey = mintGameAgentKey(secret, {
      slug,
      creatorUid: 'g:stranger',
      keyGeneration: 1,
      now,
    });
    const result = await resolveGameAgentKeyForStart(store, strangerKey, secret, now);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/rotated|invalid/i);
  });

  it('binds to the active self round on the happy path', async () => {
    const store = new InMemoryStore();
    const at = new Date(now).toISOString();
    await store.ensureGameAgentKey(slug, ownerUid, at);
    await seedActiveSelfRound(store, 13, 'self');

    const result = await resolveGameAgentKeyForStart(store, gameKey(), secret, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims).toMatchObject({ slug, creatorUid: ownerUid, keyGeneration: 1 });
      expect(result.record.jobId).toBe(13);
      expect(result.record.builder).toBe('self');
    }
  });
});

describe('slug ownership beyond owner-list window (BY-25)', () => {
  const publishedIssue = 1;
  const activeRoundIssue = 2;
  const newerJobsStart = 100;

  async function seedProlificCreatorBaseline(store: InMemoryStore) {
    await seedPublishedGame(store, publishedIssue, '2026-06-01T00:00:00.000Z');
    await seedManyNewerJobs(store, 250, newerJobsStart);
    const at = new Date(now).toISOString();
    await store.ensureGameAgentKey(slug, ownerUid, at);
  }

  it('creatorOwnsSlug stays true when the game aged out of listSubmissionsByOwner(200)', async () => {
    const store = new InMemoryStore();
    await seedProlificCreatorBaseline(store);

    expect(await creatorOwnsSlug(store, slug, ownerUid)).toBe(true);

    const windowed = await store.listSubmissionsByOwner(ownerUid, { limit: 200 });
    expect(windowed.some((job) => job.slug === slug)).toBe(false);
  });

  it('verifyDurableGameAgentKey accepts a key for an old owned slug', async () => {
    const store = new InMemoryStore();
    await seedProlificCreatorBaseline(store);

    const result = await verifyDurableGameAgentKey(store, gameKey(), secret, now);
    expect(result.ok).toBe(true);
  });

  it('start binds when a self round is open on an old slug', async () => {
    const store = new InMemoryStore();
    await seedProlificCreatorBaseline(store);
    await seedActiveSelfRound(store, activeRoundIssue, 'self');
    setCreatedAt(store, activeRoundIssue, '2026-08-15T12:00:00.000Z');

    const result = await resolveGameAgentKeyForStart(store, gameKey(), secret, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.jobId).toBe(activeRoundIssue);
    }
  });

  it('open_round resolves a published game that aged out of the owner list', async () => {
    const store = new InMemoryStore();
    await seedProlificCreatorBaseline(store);

    const result = await resolveGameAgentKeyForOpenRound(store, gameKey(), secret, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.publishedRecord.jobId).toBe(publishedIssue);
      expect(result.activeRound).toBeNull();
    }
  });

  it('stays valid when a stranger opens an unrelated later submission on the same slug', async () => {
    // A stray same-slug submission must not move canonical authority.
    const store = new InMemoryStore();
    await seedProlificCreatorBaseline(store);
    const transferIssue = 3;
    await store.createSubmission(transferIssue, 'g:stranger', 'Transferred');
    await store.setSubmissionSlug(transferIssue, slug);
    setCreatedAt(store, transferIssue, '2026-09-01T12:00:00.000Z');

    const result = await verifyDurableGameAgentKey(store, gameKey(), secret, now);
    expect(result.ok).toBe(true);
  });

  it('stays valid after the originating job is abandoned', async () => {
    // Abandoning the settling job must not strip the durable owner's key.
    const store = new InMemoryStore();
    await seedProlificCreatorBaseline(store);
    await store.setSubmissionAbandoned(publishedIssue, '2026-09-01T12:00:00.000Z');

    const result = await verifyDurableGameAgentKey(store, gameKey(), secret, now);
    expect(result.ok).toBe(true);
  });

  /**
   * Abandoning a *round* is routine — creator cancel, operator reject, or the
   * `no_connect` sweep. None of those unpublish the game, so none may take the key
   * down with them.
   */
  describe('an abandoned newer round does not unown the published game', () => {
    const abandonedRoundIssue = 3;

    async function seedWithAbandonedNewerRound(store: InMemoryStore) {
      await seedProlificCreatorBaseline(store);
      await store.createSubmission(abandonedRoundIssue, ownerUid, 'Comet Courier');
      await store.setSubmissionSlug(abandonedRoundIssue, slug);
      await store.setRoundBuilder(abandonedRoundIssue, 'self');
      setCreatedAt(store, abandonedRoundIssue, '2026-08-20T00:00:00.000Z');
      await store.setSubmissionAbandoned(abandonedRoundIssue, '2026-08-21T00:00:00.000Z');
    }

    it('keeps ownership', async () => {
      const store = new InMemoryStore();
      await seedWithAbandonedNewerRound(store);
      expect(await creatorOwnsSlug(store, slug, ownerUid)).toBe(true);
    });

    it('keeps the durable key working', async () => {
      const store = new InMemoryStore();
      await seedWithAbandonedNewerRound(store);
      const result = await verifyDurableGameAgentKey(store, gameKey(), secret, now);
      expect(result.ok).toBe(true);
    });

    it('leaves open_round able to open the next one', async () => {
      const store = new InMemoryStore();
      await seedWithAbandonedNewerRound(store);
      const result = await resolveGameAgentKeyForOpenRound(store, gameKey(), secret, now);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.publishedRecord.jobId).toBe(publishedIssue);
        // The abandoned round must not read as an in-flight one.
        expect(result.activeRound).toBeNull();
      }
    });

    it('stays valid when a stranger opens an unrelated later submission on the same slug', async () => {
      const store = new InMemoryStore();
      await seedWithAbandonedNewerRound(store);
      await store.createSubmission(4, 'g:someone-else', 'Comet Courier');
      await store.setSubmissionSlug(4, slug);
      setCreatedAt(store, 4, '2026-08-25T00:00:00.000Z');

      const result = await verifyDurableGameAgentKey(store, gameKey(), secret, now);
      expect(result.ok).toBe(true);
    });
  });
});

describe('findActiveRoundForSlug / findDraftJobForSlug widen after transfer', () => {
  const newOwnerUid = 'g:new-owner';

  // Overwrites the auto-created GameAccess record directly.
  function transferTo(store: InMemoryStore, transferSlug: string, uid: string): void {
    const gameAccessStore = (store as unknown as { gameAccessStore: { access: Map<string, { ownerUid: string }> } })
      .gameAccessStore;
    const record = gameAccessStore.access.get(transferSlug);
    if (!record) throw new Error(`transferTo: no GameAccess record for ${transferSlug} yet`);
    gameAccessStore.access.set(transferSlug, { ...record, ownerUid: uid });
  }

  it('an active round under the former owner is found for the new owner', async () => {
    const store = new InMemoryStore();
    await seedActiveSelfRound(store, 1, 'self');
    transferTo(store, slug, newOwnerUid);

    const found = await findActiveRoundForSlug(store, slug, newOwnerUid);
    expect(found?.jobId).toBe(1);
  });

  it('a draft job under the former owner is found for the new owner', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, ownerUid, 'Comet Courier');
    await store.setSubmissionSlug(1, slug);
    transferTo(store, slug, newOwnerUid);

    const found = await findDraftJobForSlug(store, slug, newOwnerUid);
    expect(found?.jobId).toBe(1);
  });

  it('an active round under the former owner is found even when the new owner has their own older round', async () => {
    const store = new InMemoryStore();
    // The new owner's own unrelated round on this slug, so the naive "has own
    // rounds" fast path would wrongly stop widening before it finds job 2.
    await store.createSubmission(1, newOwnerUid, 'Comet Courier');
    await store.setSubmissionSlug(1, slug);
    await store.setSubmissionAbandoned(1, new Date(now).toISOString());
    await seedActiveSelfRound(store, 2, 'self');
    transferTo(store, slug, newOwnerUid);

    const found = await findActiveRoundForSlug(store, slug, newOwnerUid);
    expect(found?.jobId).toBe(2);
  });

  it('a stranger with no canonical claim still finds nothing', async () => {
    const store = new InMemoryStore();
    await seedActiveSelfRound(store, 1, 'self');

    expect(await findActiveRoundForSlug(store, slug, 'g:stranger')).toBeNull();
  });
});
