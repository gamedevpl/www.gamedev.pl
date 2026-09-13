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

const ON = { GAME_ACCESS_AUTHORITATIVE: 'true' };
const OFF = {};

describe('creatorOwnsSlug', () => {
  it('flag off: reads the derived rule even when a canonical record disagrees', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });

    expect(await creatorOwnsSlug(store, 'sky', 'g:ada', OFF)).toBe(true);
    expect(await creatorOwnsSlug(store, 'sky', 'g:grace', OFF)).toBe(false);
  });

  it('flag on: reads the canonical record over the derived rule', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });

    expect(await creatorOwnsSlug(store, 'sky', 'g:grace', ON)).toBe(true);
    expect(await creatorOwnsSlug(store, 'sky', 'g:ada', ON)).toBe(false);
  });

  it('flag on, no canonical record: falls back to the derived rule unchanged', async () => {
    const store = transferredGameStore({ jobs: [job(1, 'g:ada', 'sky')] });

    expect(await creatorOwnsSlug(store, 'sky', 'g:ada', ON)).toBe(true);
  });
});

describe('ownsSubmissionOrSlug', () => {
  it('the literal owner always matches, flag on or off', async () => {
    const store = transferredGameStore({ jobs: [job(1, 'g:ada', 'sky')] });
    const record = { ownerUid: 'g:ada', slug: 'sky' };

    expect(await ownsSubmissionOrSlug(store, record, 'g:ada', OFF)).toBe(true);
    expect(await ownsSubmissionOrSlug(store, record, 'g:ada', ON)).toBe(true);
  });

  it('a pre-slug draft cannot be reached by anyone but its recorded owner', async () => {
    const store = transferredGameStore({ jobs: [] });
    const record = { ownerUid: 'g:ada', slug: undefined };

    expect(await ownsSubmissionOrSlug(store, record, 'g:someone-else', ON)).toBe(false);
  });

  it('flag off: the new owner is refused even though the record now names them', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });
    const record = { ownerUid: 'g:ada', slug: 'sky' };

    expect(await ownsSubmissionOrSlug(store, record, 'g:grace', OFF)).toBe(false);
  });

  it('flag on: the new owner is recognized against an old job record', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });
    const record = { ownerUid: 'g:ada', slug: 'sky' };

    expect(await ownsSubmissionOrSlug(store, record, 'g:grace', ON)).toBe(true);
  });

  it('flag on: the former owner is refused even though record.ownerUid still names them', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });
    const record = { ownerUid: 'g:ada', slug: 'sky' };

    expect(await ownsSubmissionOrSlug(store, record, 'g:ada', ON)).toBe(false);
  });
});

describe('listAuthorizedRoundsForSlug', () => {
  it('flag on: an untransferred owner still sees their own rounds', async () => {
    const store = transferredGameStore({ jobs: [job(1, 'g:ada', 'sky')] });

    const rounds = await listAuthorizedRoundsForSlug(store, 'g:ada', 'sky', ON);

    expect(rounds.map((r) => r.jobId)).toEqual([1]);
  });

  it('flag on: a former owner keeps rounds under their uid but loses access after transfer', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });

    expect(await listAuthorizedRoundsForSlug(store, 'g:ada', 'sky', ON)).toEqual([]);
  });

  it('flag off: an owner with zero rounds of their own sees nothing', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });

    expect(await listAuthorizedRoundsForSlug(store, 'g:grace', 'sky', OFF)).toEqual([]);
  });

  it('flag on: the new canonical owner sees every round on the slug', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });

    const rounds = await listAuthorizedRoundsForSlug(store, 'g:grace', 'sky', ON);

    expect(rounds.map((r) => r.jobId)).toEqual([1]);
  });

  it('flag on: a non-owner with no rounds still sees nothing', async () => {
    const store = transferredGameStore({
      jobs: [job(1, 'g:ada', 'sky')],
      access: access('sky', 'g:grace'),
    });

    expect(await listAuthorizedRoundsForSlug(store, 'g:someone-else', 'sky', ON)).toEqual([]);
  });
});
