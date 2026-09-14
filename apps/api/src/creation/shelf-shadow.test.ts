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
    const drifted = buildShelfDocument(
      [record(1, { slug: 'sky', title: 'Renamed' }), record(2, { slug: 'dunes' })],
      at,
    );

    expect(judgeShelfShadow(drifted, source, 2).verdict).toBe('collapse');
  });

  it('catches a drift in every tip field a shelf response serves', () => {
    // Each of these reaches the creator's screen.
    const drifts: Array<Partial<SubmissionRecord>> = [
      { title: 'Renamed' },
      { publishedAt: '2026-09-12T00:00:00.000Z' },
      { previewVersion: 'v9' },
      { deliveredVersion: 'v9' },
      { draftSharedAt: '2026-09-12T00:00:00.000Z' },
      { lastStatus: 'needs_changes' },
      { createdAt: '2026-09-09T00:00:00.000Z' },
    ];
    for (const drift of drifts) {
      const one = [record(1, { slug: 'sky', ...drift }), record(2, { slug: 'dunes' })];
      expect(judgeShelfShadow(buildShelfDocument(one, at), source, 2).verdict).toBe('collapse');
    }
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
        store: { getShelf: async () => null, countSubmissionsByOwner: async () => 1, rebuildShelf: async () => true },
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
        store: {
          getShelf: async () => buildShelfDocument(source, at),
          countSubmissionsByOwner: async () => 1,
          rebuildShelf: async () => true,
        },
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
          rebuildShelf: async () => true,
        },
        log: { warn: (context) => warnings.push(context) },
      },
      'g:owner',
      source,
    );

    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  // A purely-reading account would stay 'absent' forever without this.
  it('backfills on absent without making the read wait for it', async () => {
    const warnings: object[] = [];
    let rebuildOwner: string | undefined;
    let resolveRebuild!: (value: boolean) => void;
    const rebuildDone = new Promise<boolean>((resolve) => {
      resolveRebuild = resolve;
    });

    const result = await recordShelfShadow(
      {
        store: {
          getShelf: async () => null,
          countSubmissionsByOwner: async () => 1,
          rebuildShelf: async (ownerUid: string) => {
            rebuildOwner = ownerUid;
            // Would hang the outer await if this were awaited.
            return rebuildDone;
          },
        },
        log: { warn: (context) => warnings.push(context) },
      },
      'g:owner',
      source,
    );

    expect(result?.verdict).toBe('absent');
    expect(rebuildOwner).toBe('g:owner');
    resolveRebuild(true);
    await rebuildDone;
  });

  it('does not backfill a shelf that already exists, agreeing or not', async () => {
    let rebuildCalled = false;
    await recordShelfShadow(
      {
        store: {
          getShelf: async () => buildShelfDocument(source, at),
          countSubmissionsByOwner: async () => 1,
          rebuildShelf: async () => {
            rebuildCalled = true;
            return true;
          },
        },
        log: { warn: () => {} },
      },
      'g:owner',
      source,
    );
    expect(rebuildCalled).toBe(false);

    await recordShelfShadow(
      {
        store: {
          // count disagrees with the shelf, so the verdict is 'count', not 'absent'.
          getShelf: async () => buildShelfDocument(source, at),
          countSubmissionsByOwner: async () => 99,
          rebuildShelf: async () => {
            rebuildCalled = true;
            return true;
          },
        },
        log: { warn: () => {} },
      },
      'g:owner',
      source,
    );
    expect(rebuildCalled).toBe(false);
  });

  it('reports a failed backfill instead of leaving it silent', async () => {
    const messages: string[] = [];
    await recordShelfShadow(
      {
        store: {
          getShelf: async () => null,
          countSubmissionsByOwner: async () => 1,
          rebuildShelf: async () => {
            throw new Error('write refused');
          },
        },
        log: { warn: (_context, message) => messages.push(message ?? '') },
      },
      'g:owner',
      source,
    );

    // Flushes past the fire-and-forget rejection.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(messages).toContain('shelf lazy backfill failed');
  });
});
