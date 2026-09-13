import { describe, expect, it } from 'vitest';
import { DELETED_ACCOUNT_UID } from './store.js';
import type { SubmissionRecord } from '../store/records/submission.js';
import { InMemoryGameAccessStore } from '../store/slices/game-access.js';
import { runGameAccessBackfill } from './game-access-backfill.js';
import { resolveGameAccess, type GameAccessResolveStore } from './game-access-resolve.js';

// Games as they exist pre-migration: jobs, no record.
class LegacyStore extends InMemoryGameAccessStore implements GameAccessResolveStore {
  private jobs: SubmissionRecord[] = [];
  private accounts = new Set<string>();

  constructor() {
    super((uid) => this.accounts.has(uid));
  }

  eraseAccount(uid: string): void {
    this.accounts.delete(uid);
  }

  addJob(jobId: number, ownerUid: string, slug: string, opts?: { abandoned?: boolean }): this {
    this.accounts.add(ownerUid);
    this.jobs.unshift({
      jobId,
      ownerUid,
      slug,
      title: `Game ${jobId}`,
      createdAt: new Date(2026, 0, jobId).toISOString(),
      abandonedAt: opts?.abandoned ? new Date(2026, 0, jobId).toISOString() : undefined,
    } as SubmissionRecord);
    return this;
  }

  async listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]> {
    return this.jobs.filter((job) => job.slug === slug);
  }
}

describe('game access backfill', () => {
  it('records an owner for a game that predates the record', async () => {
    const store = new LegacyStore().addJob(1, 'g:ada', 'orbital-dogfight');

    const result = await runGameAccessBackfill({ store, slugs: ['orbital-dogfight'], dryRun: false });

    expect(result).toMatchObject({ scanned: 1, created: 1, createdPlatform: 0, alreadyRecorded: 0 });
    expect(await store.getGameAccess('orbital-dogfight')).toMatchObject({ ownerUid: 'g:ada', accessRevision: 1 });
  });

  it('writes nothing on a dry run but reports the same counts', async () => {
    const store = new LegacyStore().addJob(1, 'g:ada', 'orbital-dogfight');

    const dry = await runGameAccessBackfill({ store, slugs: ['orbital-dogfight'], dryRun: true });

    expect(dry).toMatchObject({ dryRun: true, scanned: 1, created: 1 });
    expect(await store.getGameAccess('orbital-dogfight')).toBeNull();
  });

  it('is safe to rerun and counts the second pass as already recorded', async () => {
    const store = new LegacyStore().addJob(1, 'g:ada', 'orbital-dogfight');
    await runGameAccessBackfill({ store, slugs: ['orbital-dogfight'], dryRun: false });

    const again = await runGameAccessBackfill({ store, slugs: ['orbital-dogfight'], dryRun: false });

    expect(again).toMatchObject({ created: 0, alreadyRecorded: 1, diverged: [] });
  });

  it('never guesses a human owner for an ownerless repo-lane game', async () => {
    const store = new LegacyStore();

    const result = await runGameAccessBackfill({ store, slugs: ['repo-lane-classic'], dryRun: false });

    expect(result).toMatchObject({ scanned: 1, created: 0, quarantined: ['repo-lane-classic'] });
    expect(await store.getGameAccess('repo-lane-classic')).toBeNull();
    expect((await resolveGameAccess(store, 'repo-lane-classic')).owner).toEqual({
      kind: 'platform',
      reason: 'no_owner',
    });
  });

  it('quarantines a game whose every round was abandoned', async () => {
    const store = new LegacyStore().addJob(1, 'g:ada', 'walked-away', { abandoned: true });

    const result = await runGameAccessBackfill({ store, slugs: ['walked-away'], dryRun: false });

    expect(result).toMatchObject({ created: 0, quarantined: ['walked-away'] });
  });

  it('records platform-held games under the uid they already have', async () => {
    const store = new LegacyStore().addJob(1, 'bot:e2e', 'bot-built').addJob(2, DELETED_ACCOUNT_UID, 'orphaned');

    const result = await runGameAccessBackfill({ store, slugs: ['bot-built', 'orphaned'], dryRun: false });

    expect(result).toMatchObject({ created: 0, createdPlatform: 2 });
    expect((await resolveGameAccess(store, 'bot-built')).owner).toEqual({ kind: 'platform', reason: 'bot_owned' });
    expect((await resolveGameAccess(store, 'orphaned')).owner).toEqual({ kind: 'platform', reason: 'owner_deleted' });
  });

  it('reports a record that disagrees with the legacy rule instead of overwriting it', async () => {
    const store = new LegacyStore().addJob(1, 'g:ada', 'orbital-dogfight');
    await runGameAccessBackfill({ store, slugs: ['orbital-dogfight'], dryRun: false });

    // Newer round by someone else: the legacy rule moves.
    store.addJob(2, 'g:grace', 'orbital-dogfight');
    const result = await runGameAccessBackfill({ store, slugs: ['orbital-dogfight'], dryRun: false });

    expect(result).toMatchObject({ alreadyRecorded: 0, diverged: ['orbital-dogfight'] });
    expect(await store.getGameAccess('orbital-dogfight')).toMatchObject({ ownerUid: 'g:ada' });
  });

  it('reports slugs, never uids', async () => {
    const store = new LegacyStore().addJob(1, 'g:ada', 'orbital-dogfight').addJob(2, 'g:grace', 'orbital-dogfight');

    const result = await runGameAccessBackfill({
      store,
      slugs: ['orbital-dogfight', 'repo-lane-classic'],
      dryRun: true,
    });

    expect(JSON.stringify(result)).not.toContain('g:ada');
    expect(JSON.stringify(result)).not.toContain('g:grace');
  });

  it('counts each slug once however often it is listed', async () => {
    const store = new LegacyStore().addJob(1, 'g:ada', 'orbital-dogfight');

    const result = await runGameAccessBackfill({
      store,
      slugs: ['orbital-dogfight', 'orbital-dogfight'],
      dryRun: true,
    });

    expect(result.scanned).toBe(1);
  });
});

describe('game access backfill under concurrency', () => {
  it('reports the owner a concurrent write actually established', async () => {
    const store = new LegacyStore().addJob(1, 'g:ada', 'orbital-dogfight');

    // Someone else's record lands between the read and the write.
    const original = store.backfillGameAccess.bind(store);
    store.backfillGameAccess = async (slug, ownerUid, checkAccount, at) => {
      store.backfillGameAccess = original;
      await store.ensureGameAccess(slug, 'g:grace', at);
      return original(slug, ownerUid, checkAccount, at);
    };

    const result = await runGameAccessBackfill({ store, slugs: ['orbital-dogfight'], dryRun: false });

    expect(await store.getGameAccess('orbital-dogfight')).toMatchObject({ ownerUid: 'g:grace' });
    expect(result).toMatchObject({ created: 0, diverged: ['orbital-dogfight'] });
  });

  it('does not record an owner erased after the pass began', async () => {
    const store = new LegacyStore().addJob(1, 'g:ada', 'orbital-dogfight');

    const original = store.listSubmissionsBySlug.bind(store);
    store.listSubmissionsBySlug = async (slug) => {
      store.listSubmissionsBySlug = original;
      store.addJob(2, DELETED_ACCOUNT_UID, slug);
      return original(slug);
    };

    const result = await runGameAccessBackfill({ store, slugs: ['orbital-dogfight'], dryRun: false });

    expect(result).toMatchObject({ created: 0, createdPlatform: 1 });
    expect((await resolveGameAccess(store, 'orbital-dogfight')).owner).toEqual({
      kind: 'platform',
      reason: 'owner_deleted',
    });
  });
});

describe('game access backfill versus erasure', () => {
  it('does not record an account erased after the last source read', async () => {
    const store = new LegacyStore().addJob(1, 'g:ada', 'orbital-dogfight');

    // Erasure lands after the final read, before the create.
    const original = store.backfillGameAccess.bind(store);
    store.backfillGameAccess = async (slug, ownerUid, checkAccount, at) => {
      store.backfillGameAccess = original;
      store.eraseAccount(ownerUid);
      store.addJob(2, DELETED_ACCOUNT_UID, slug);
      return original(slug, ownerUid, checkAccount, at);
    };

    const result = await runGameAccessBackfill({ store, slugs: ['orbital-dogfight'], dryRun: false });

    expect(await store.getGameAccess('orbital-dogfight')).toBeNull();
    expect(result).toMatchObject({ created: 0, createdPlatform: 0, quarantined: ['orbital-dogfight'] });
    expect((await resolveGameAccess(store, 'orbital-dogfight')).owner).toEqual({
      kind: 'platform',
      reason: 'owner_deleted',
    });
  });
});
