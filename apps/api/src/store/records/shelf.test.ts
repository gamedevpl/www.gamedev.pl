import { describe, expect, it } from 'vitest';
import type { SubmissionRecord } from './submission.js';
import {
  buildShelfDocument,
  fromShelfRound,
  isShelfUsable,
  MAX_SHELF_ROUNDS,
  SHELF_VERSION,
  toShelfRound,
} from './shelf.js';

const record = (jobId: number, extra: Partial<SubmissionRecord> = {}): SubmissionRecord =>
  ({
    jobId,
    ownerUid: 'g:owner',
    createdAt: `2026-09-${String(jobId).padStart(2, '0')}T00:00:00.000Z`,
    title: `Round ${jobId}`,
    ...extra,
  }) as SubmissionRecord;

describe('toShelfRound', () => {
  it('drops absent fields rather than writing undefined, which Firestore rejects', () => {
    const round = toShelfRound(record(1));
    expect(Object.hasOwn(round, 'slug')).toBe(false);
    expect(Object.hasOwn(round, 'publishedAt')).toBe(false);
    expect(round).toMatchObject({ jobId: 1, ownerUid: 'g:owner', title: 'Round 1' });
  });

  it('round-trips every field the collapse and the shelf response read', () => {
    const source = record(2, {
      slug: 'sky',
      state: 'published',
      abandonedAt: '2026-09-09T00:00:00.000Z',
      publishedAt: '2026-09-08T00:00:00.000Z',
      lastStatus: 'published',
      lastNotifiedStatus: 'in_review',
      previewVersion: 'v2',
      deliveredVersion: 'v1',
    });
    const back = fromShelfRound(toShelfRound(source));
    for (const key of [
      'jobId',
      'ownerUid',
      'createdAt',
      'title',
      'slug',
      'state',
      'abandonedAt',
      'publishedAt',
      'lastStatus',
      'lastNotifiedStatus',
      'previewVersion',
      'deliveredVersion',
    ] as const) {
      expect(back[key]).toEqual(source[key]);
    }
  });
});

describe('buildShelfDocument', () => {
  it('stores rounds newest first with the job id breaking a tie', () => {
    const same = '2026-09-10T00:00:00.000Z';
    const shelf = buildShelfDocument(
      [record(1, { createdAt: same }), record(3, { createdAt: same }), record(2, { createdAt: same })],
      same,
    );
    expect(shelf.rounds.map((round) => round.jobId)).toEqual([3, 2, 1]);
    expect(shelf.version).toBe(SHELF_VERSION);
  });

  it('counts the source rather than what it kept, so the cap cannot look like agreement', () => {
    const many = Array.from({ length: MAX_SHELF_ROUNDS + 5 }, (_, index) => record(index + 1));
    const shelf = buildShelfDocument(many, '2026-09-13T00:00:00.000Z');

    expect(shelf.rounds).toHaveLength(MAX_SHELF_ROUNDS);
    expect(shelf.sourceCount).toBe(MAX_SHELF_ROUNDS + 5);
    expect(shelf.truncated).toBe(true);
  });

  it('leaves truncated absent when everything fits', () => {
    const shelf = buildShelfDocument([record(1)], '2026-09-13T00:00:00.000Z');
    expect(Object.hasOwn(shelf, 'truncated')).toBe(false);
  });
});

describe('isShelfUsable', () => {
  const shelf = buildShelfDocument([record(1), record(2)], '2026-09-13T00:00:00.000Z');

  it('accepts a shelf that agrees with the source count', () => {
    expect(isShelfUsable(shelf, 2)).toBe(true);
  });

  it('refuses an absent, disagreeing, wrong-version or truncated shelf', () => {
    expect(isShelfUsable(null, 2)).toBe(false);
    expect(isShelfUsable(shelf, 3)).toBe(false);
    expect(isShelfUsable({ ...shelf, version: SHELF_VERSION + 1 }, 2)).toBe(false);
    expect(isShelfUsable({ ...shelf, truncated: true }, 2)).toBe(false);
  });
});
