import { describe, expect, it } from 'vitest';
import { decideEditorialClearance } from './editorial-clearance.js';
import type { GameAssessment } from '../platform/store.js';

function row(
  partial: Partial<GameAssessment> & Pick<GameAssessment, 'slug' | 'reviewerUid' | 'verdict'>,
): GameAssessment {
  return {
    id: `${partial.slug}:${partial.reviewerUid}`,
    title: partial.title ?? partial.slug,
    source: partial.source ?? 'creator',
    creatorHandle: null,
    note: partial.note ?? '',
    noteOrigin: 'text',
    checklist: partial.checklist ?? {
      graphics: 'ok',
      gameplay: 'ok',
      fun: 'ok',
      sound: 'ok',
      controls: 'ok',
    },
    clientContext: null,
    gameVersion: partial.gameVersion ?? 'v1',
    resolution: partial.resolution ?? null,
    createdAt: '2026-08-07T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-08-07T00:00:00.000Z',
    ...partial,
  };
}

describe('decideEditorialClearance', () => {
  it('refuses as pending when nobody has reviewed', () => {
    expect(decideEditorialClearance([], 'draft-a', 'v1')).toMatchObject({
      decision: 'pending',
      reviewers: 0,
      keep: 0,
      cut: 0,
      skip: 0,
    });
  });

  it('refuses as pending when every verdict is skip', () => {
    const rows = [
      row({ slug: 'draft-a', reviewerUid: 'r1', verdict: 'skip' }),
      row({ slug: 'draft-a', reviewerUid: 'r2', verdict: 'skip' }),
    ];
    expect(decideEditorialClearance(rows, 'draft-a', 'v1')).toMatchObject({
      decision: 'pending',
      reviewers: 2,
      keep: 0,
      cut: 0,
      skip: 2,
    });
  });

  it('clears on one keep', () => {
    const rows = [row({ slug: 'draft-a', reviewerUid: 'r1', verdict: 'keep' })];
    expect(decideEditorialClearance(rows, 'draft-a', 'v1')).toMatchObject({
      decision: 'clear',
      reviewers: 1,
      keep: 1,
      cut: 0,
    });
  });

  it('needs two reviewers to block a cut, so one cut stays pending', () => {
    const oneCut = [row({ slug: 'draft-a', reviewerUid: 'r1', verdict: 'cut' })];
    expect(decideEditorialClearance(oneCut, 'draft-a', 'v1').decision).toBe('pending');

    const twoCuts = [
      row({ slug: 'draft-a', reviewerUid: 'r1', verdict: 'cut' }),
      row({ slug: 'draft-a', reviewerUid: 'r2', verdict: 'cut' }),
    ];
    expect(decideEditorialClearance(twoCuts, 'draft-a', 'v1').decision).toBe('blocked');
  });

  it('blocks when two reviewers split keep/cut because cut >= keep', () => {
    const rows = [
      row({ slug: 'draft-a', reviewerUid: 'r1', verdict: 'cut' }),
      row({ slug: 'draft-a', reviewerUid: 'r2', verdict: 'keep' }),
    ];
    expect(decideEditorialClearance(rows, 'draft-a', 'v1').decision).toBe('blocked');
  });

  it('ignores catalog rows and other slugs', () => {
    const rows = [
      row({ slug: 'draft-a', reviewerUid: 'r1', verdict: 'cut', source: 'catalog' }),
      row({ slug: 'other', reviewerUid: 'r1', verdict: 'keep' }),
    ];
    expect(decideEditorialClearance(rows, 'draft-a', 'v1').decision).toBe('pending');
  });

  it('surfaces weakOrBad facet tallies on the refusal payload', () => {
    const rows = [
      row({
        slug: 'draft-a',
        reviewerUid: 'r1',
        verdict: 'cut',
        checklist: { graphics: 'ok', gameplay: 'bad', fun: 'weak', sound: 'ok', controls: 'ok' },
      }),
      row({ slug: 'draft-a', reviewerUid: 'r2', verdict: 'cut' }),
    ];
    expect(decideEditorialClearance(rows, 'draft-a', 'v1').weakOrBad).toEqual({
      graphics: 0,
      gameplay: 1,
      fun: 1,
      sound: 0,
      controls: 0,
    });
  });
});
