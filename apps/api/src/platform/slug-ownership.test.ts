import { describe, expect, it } from 'vitest';
import type { GameAccessRecord } from '../store/records/game-access.js';
import type { SubmissionRecord } from '../store/records/submission.js';
import type { Store } from './store.js';
import { creatorOwnsSlug, listAuthorizedRoundsForSlug, ownsSubmissionOrSlug } from './slug-ownership.js';

// The job stays with the old owner; GameAccess names the new one.
function transferredGameStore(opts: { jobs: SubmissionRecord[]; access?: GameAccessRecord }): Store {
  return {
    async listSubmissionsBySlug(slug: string) {
      return opts.jobs.filter((job) => job.slug === slug);
    },
    async listSubmissionsByOwnerAndSlug(ownerUid: string, slug: string) {
      return opts.jobs.filter((job) => job.slug === slug && job.ownerUid === ownerUid);
    },
    async getGameAccess(slug: string) {
      return opts.access && opts.access.slug === slug ? opts.access : null;
    },
  } as unknown as Store;
}

function job(jobId: number, ownerUid: string, slug: string, opts?: { abandoned?: boolean }): SubmissionRecord {
  return {
    jobId,
    ownerUid,
    slug,
    title: `Game ${jobId}`,
    createdAt: new Date(2026, 0, jobId).toISOString(),
    abandonedAt: opts?.abandoned ? new Date(2026, 0, jobId).toISOString() : undefined,
  } as SubmissionRecord;
}

function access(slug: string, ownerUid: string): GameAccessRecord {
  return {
    slug,
    ownerUid,
    editorUids: [],
    memberUids: [],
    accessRevision: 2,
    settledJobId: undefined,
  } as unknown as GameAccessRecord;
}

describe('creatorOwnsSlug', () => {
  it('reads the canonical record over the derived rule', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });

    expect(await creatorOwnsSlug(store, 'sky', 'g:grace')).toBe(true);
    expect(await creatorOwnsSlug(store, 'sky', 'g:ada')).toBe(false);
  });

  it('no canonical record: falls back to the derived rule', async () => {
    const store = transferredGameStore({ jobs: [job(1, 'g:ada', 'sky')] });

    expect(await creatorOwnsSlug(store, 'sky', 'g:ada')).toBe(true);
  });
});

describe('ownsSubmissionOrSlug', () => {
  it('the literal owner matches when nothing has transferred', async () => {
    const store = transferredGameStore({ jobs: [job(1, 'g:ada', 'sky')] });
    const record = { ownerUid: 'g:ada', slug: 'sky' };

    expect(await ownsSubmissionOrSlug(store, record, 'g:ada')).toBe(true);
  });

  it('a pre-slug draft cannot be reached by anyone but its recorded owner', async () => {
    const store = transferredGameStore({ jobs: [] });
    const record = { ownerUid: 'g:ada', slug: undefined };

    expect(await ownsSubmissionOrSlug(store, record, 'g:someone-else')).toBe(false);
  });

  it('the new owner is recognized against an old job record', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });
    const record = { ownerUid: 'g:ada', slug: 'sky' };

    expect(await ownsSubmissionOrSlug(store, record, 'g:grace')).toBe(true);
  });

  it('the former owner is refused even though record.ownerUid still names them', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });
    const record = { ownerUid: 'g:ada', slug: 'sky' };

    expect(await ownsSubmissionOrSlug(store, record, 'g:ada')).toBe(false);
  });
});

describe('listAuthorizedRoundsForSlug', () => {
  it('an untransferred owner still sees their own rounds', async () => {
    const store = transferredGameStore({ jobs: [job(1, 'g:ada', 'sky')] });

    const rounds = await listAuthorizedRoundsForSlug(store, 'g:ada', 'sky');

    expect(rounds.map((r) => r.jobId)).toEqual([1]);
  });

  it('a former owner keeps rounds under their uid but loses access after transfer', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });

    expect(await listAuthorizedRoundsForSlug(store, 'g:ada', 'sky')).toEqual([]);
  });

  it('the new canonical owner sees every round on the slug', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });

    const rounds = await listAuthorizedRoundsForSlug(store, 'g:grace', 'sky');

    expect(rounds.map((r) => r.jobId)).toEqual([1]);
  });

  it('a non-owner with no rounds still sees nothing', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });

    expect(await listAuthorizedRoundsForSlug(store, 'g:someone-else', 'sky')).toEqual([]);
  });

  it('a transfer back does not hide the intervening owner rounds', async () => {
    // Ada -> Grace -> back to Ada: Grace's round must not stay hidden.
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky'), job(2, 'g:grace', 'sky')],
      access: access('sky', 'g:ada'),
    });

    const rounds = await listAuthorizedRoundsForSlug(store, 'g:ada', 'sky');

    expect(rounds.map((r) => r.jobId).sort()).toEqual([1, 2]);
  });
});
