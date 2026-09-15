import type { Firestore } from '@google-cloud/firestore';
import { expect, it, vi } from 'vitest';
import { canClaimManualRound, claimManualRoundSlug } from './manual-round-claim.js';
import type { SubmissionRecord } from '../records/submission.js';

const published: SubmissionRecord = {
  jobId: 10,
  ownerUid: 'owner',
  title: 'Sky',
  createdAt: '2026-01-01',
  state: 'published',
  slug: 'sky',
};
const canceled: SubmissionRecord = {
  ...published,
  jobId: 11,
  createdAt: '2026-01-02',
  state: 'canceled',
  abandonedAt: '2026-01-03',
};
const target: SubmissionRecord = {
  jobId: 12,
  ownerUid: 'owner',
  title: 'Sky',
  createdAt: '2026-01-04',
  state: 'queued',
};

it.each([10, 11])('Firestore permits expected round %s after cancellation releases its claim', async (source) => {
  const update = vi.fn();
  const set = vi.fn();
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }), where: () => ({ rows: true }) }),
    runTransaction: async (fn: (tx: unknown) => Promise<boolean>) =>
      fn({
        get: async (ref: { rows?: boolean; path?: string }) =>
          ref.rows
            ? { docs: [published, canceled].map((row) => ({ data: () => row })) }
            : { exists: true, data: () => (ref.path === 'submissions/12' ? target : {}) },
        update,
        set,
      }),
  };
  expect(await claimManualRoundSlug(db as unknown as Firestore, 12, 'sky', source)).toBe(true);
  expect(update).toHaveBeenCalledWith({ path: 'submissions/12' }, { slug: 'sky' });
  expect(set).toHaveBeenCalledWith({ path: 'games/sky' }, { slugClaimJobId: 12 }, { merge: true });
});

it('keeps ownership, moderation and active recovery fences after abandoned history', () => {
  expect(canClaimManualRound(target, [published, canceled], 10)).toBe(true);
  expect(canClaimManualRound(target, [canceled], 11)).toBe(true);
  // Fine with a new owner: the caller already verified canonical ownership.
  expect(canClaimManualRound({ ...target, ownerUid: 'new-owner' }, [published, canceled], 10)).toBe(true);
  expect(canClaimManualRound(target, [published, { ...canceled, moderationBlockedAt: '2026-01-03' }], 10)).toBe(false);
  expect(canClaimManualRound(target, [published, { ...canceled, state: 'queued', recoveryKey: 'active' }], 10)).toBe(
    false,
  );
  expect(canClaimManualRound(target, [published, canceled], 10, 'disabled')).toBe(false);
});
