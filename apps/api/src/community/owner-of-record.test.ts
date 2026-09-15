import { describe, expect, it } from 'vitest';
import type { GameAccessRecord } from '../store/records/game-access.js';
import type { SubmissionRecord } from '../store/records/submission.js';
import type { Store } from '../platform/store.js';
import { BOT_UID_PREFIX, DELETED_ACCOUNT_UID } from '../platform/store.js';
import { canReviewSlug, resolveOwnerOfRecord } from './owner-of-record.js';

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

function transferredGameStore(opts: { jobs: SubmissionRecord[]; access?: GameAccessRecord }): Store {
  return {
    async listSubmissionsBySlug(slug: string) {
      return opts.jobs.filter((j) => j.slug === slug);
    },
    async getGameAccess(slug: string) {
      return opts.access && opts.access.slug === slug ? opts.access : null;
    },
  } as unknown as Store;
}

describe('resolveOwnerOfRecord', () => {
  it('reads the canonical record over the derived submission owner', async () => {
    const store = transferredGameStore({ jobs: [job(1, 'g:ada', 'sky')], access: access('sky', 'g:grace') });

    expect(await resolveOwnerOfRecord(store, 'sky')).toEqual({ kind: 'creator', uid: 'g:grace' });
  });

  it('a bot-owned canonical record still routes to platform', async () => {
    const store = transferredGameStore({
      jobs: [],
      access: access('repo-lane', `${BOT_UID_PREFIX}worker`),
    });

    expect(await resolveOwnerOfRecord(store, 'repo-lane')).toEqual({ kind: 'platform', reason: 'bot_owned' });
  });

  it('an erased canonical owner still routes to platform', async () => {
    const store = transferredGameStore({ jobs: [], access: access('sky', DELETED_ACCOUNT_UID) });

    expect(await resolveOwnerOfRecord(store, 'sky')).toEqual({ kind: 'platform', reason: 'owner_deleted' });
  });

  it('no canonical record: derives the owner from submissions', async () => {
    const store = transferredGameStore({ jobs: [job(1, 'g:ada', 'sky')] });

    expect(await resolveOwnerOfRecord(store, 'sky')).toEqual({ kind: 'creator', uid: 'g:ada' });
  });
});

describe('canReviewSlug', () => {
  it('the new canonical owner may review, the old owner may not', async () => {
    const store = transferredGameStore({ jobs: [job(1, 'g:ada', 'sky')], access: access('sky', 'g:grace') });

    expect(await canReviewSlug(store, 'sky', 'g:grace')).toBe(true);
    expect(await canReviewSlug(store, 'sky', 'g:ada')).toBe(false);
  });
});
