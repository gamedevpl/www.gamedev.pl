import { describe, expect, it } from 'vitest';
import { judgeShelfShadow, recordShelfShadow } from './shelf-shadow.js';
import { buildShelfDocument, SHELF_VERSION } from '../store/records/shelf.js';
import type { SubmissionRecord } from '../store/records/submission.js';

const record = (jobId: number, extra: Partial<SubmissionRecord> = {}): SubmissionRecord =>
  ({
    jobId,
    ownerUid: 'g:owner',
    createdAt: `2026-09-0${jobId}T00:00:00.000Z`,
    title: `Round ${jobId}`,
    ...extra,
  }) as SubmissionRecord;

const at = '2026-09-13T00:00:00.000Z';

describe('judgeShelfShadow', () => {
  const source = [record(1, { slug: 'sky' }), record(2, { slug: 'dunes' })];
  const shelf = buildShelfDocument(source, at);

  it('matches a shelf built from the same rounds', () => {
    expect(judgeShelfShadow(shelf, source, 2)).toMatchObject({ verdict: 'match' });
  });

  it('names why a shelf was unusable rather than reporting one failure for all of them', () => {
    expect(judgeShelfShadow(null, source, 2).verdict).toBe('absent');
    expect(judgeShelfShadow({ ...shelf, version: SHELF_VERSION + 1 }, source, 2).verdict).toBe('version');
    expect(judgeShelfShadow({ ...shelf, truncated: true }, source, 2).verdict).toBe('truncated');
    expect(judgeShelfShadow(shelf, source, 3).verdict).toBe('count');
  });

  it('catches a same-count difference the count guard cannot see', () => {
    const drifted = buildShelfDocument([record(1, { slug: 'sky', title: 'Renamed' }), record(2, { slug: 'dunes' })], at);

    expect(judgeShelfShadow(drifted, source, 2).verdict).toBe('collapse');
  });

  it('ignores a difference the collapse would have hidden anyway', () => {
    // deliveryNudges is not mirrored and not read.
    const noisy = [record(1, { slug: 'sky', deliveryNudges: 4 }), record(2, { slug: 'dunes' })];

    expect(judgeShelfShadow(shelf, noisy, 2).verdict).toBe('match');
  });

  it('compares the tip the reader would pick, not the raw round list', () => {
    // Two rounds of one game; order alone is not drift.
    const rounds = [record(1, { slug: 'sky' }), record(2, { slug: 'sky' })];
    const built = buildShelfDocument([...rounds].reverse(), at);

    expect(judgeShelfShadow(built, rounds, 2).verdict).toBe('match');
  });
});

describe('recordShelfShadow', () => {
  const source = [record(1, { slug: 'sky' })];

  it('logs a mismatch and reports it', async () => {
    const warnings: object[] = [];
    const result = await recordShelfShadow(
      {
        store: { getShelf: async () => null, countSubmissionsByOwner: async () => 1 },
        log: { warn: (context) => warnings.push(context) },
      },
      'g:owner',
      source,
    );

    expect(result?.verdict).toBe('absent');
    expect(warnings).toHaveLength(1);
  });

  it('says nothing when the shelf agrees', async () => {
    const warnings: object[] = [];
    const result = await recordShelfShadow(
      {
        store: { getShelf: async () => buildShelfDocument(source, at), countSubmissionsByOwner: async () => 1 },
        log: { warn: (context) => warnings.push(context) },
      },
      'g:owner',
      source,
    );

    expect(result?.verdict).toBe('match');
    expect(warnings).toEqual([]);
  });

  it('never throws into the reader it is shadowing', async () => {
    const warnings: object[] = [];
    const result = await recordShelfShadow(
      {
        store: {
          getShelf: async () => {
            throw new Error('firestore is having a day');
          },
          countSubmissionsByOwner: async () => 1,
        },
        log: { warn: (context) => warnings.push(context) },
      },
      'g:owner',
      source,
    );

    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
  });
});
