import { describe, expect, it } from 'vitest';
import {
  aggregateCreatorAssessments,
  hasEditorialCutConsensus,
  playSignalWinsOverEditorial,
  routeEditorialAggregate,
  type EditorialAggregate,
} from './editorial-suggestions.js';
import type { GameAssessment } from '../platform/store.js';

function row(
  partial: Partial<GameAssessment> & Pick<GameAssessment, 'slug' | 'reviewerUid' | 'verdict'>,
): GameAssessment {
  return {
    id: `${partial.slug}:${partial.reviewerUid}`,
    title: partial.title ?? partial.slug,
    source: partial.source ?? 'creator',
    creatorHandle: null,
    note: partial.note ?? 'SECRET NOTE that must never appear in findings',
    noteOrigin: 'text',
    checklist: partial.checklist ?? {
      graphics: 'ok',
      gameplay: 'ok',
      fun: 'ok',
      sound: 'ok',
      controls: 'ok',
    },
    clientContext: null,
    createdAt: '2026-08-07T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-08-07T00:00:00.000Z',
    ...partial,
  };
}

describe('aggregateCreatorAssessments', () => {
  it('ignores catalog rows and tallies creator verdicts + weak/bad facets', () => {
    const aggs = aggregateCreatorAssessments([
      row({
        slug: 'draft-a',
        reviewerUid: 'r1',
        verdict: 'cut',
        checklist: { graphics: 'ok', gameplay: 'bad', fun: 'weak', sound: 'ok', controls: 'bad' },
      }),
      row({ slug: 'draft-a', reviewerUid: 'r2', verdict: 'keep' }),
      row({ slug: 'draft-a', reviewerUid: 'r3', verdict: 'cut', source: 'catalog' }),
      row({ slug: 'other', reviewerUid: 'r1', verdict: 'keep', source: 'catalog' }),
    ]);
    expect(aggs).toHaveLength(1);
    expect(aggs[0]).toMatchObject({
      slug: 'draft-a',
      reviewers: 2,
      keep: 1,
      cut: 1,
      skip: 0,
      weakOrBad: { graphics: 0, gameplay: 1, fun: 1, sound: 0, controls: 1 },
    });
  });
});

describe('hasEditorialCutConsensus / routeEditorialAggregate', () => {
  const base: EditorialAggregate = {
    slug: 'draft-a',
    title: 'Draft A',
    reviewers: 2,
    keep: 0,
    cut: 2,
    skip: 1,
    weakOrBad: { graphics: 0, gameplay: 2, fun: 0, sound: 0, controls: 1 },
    latestUpdatedAt: '2026-08-07T12:00:00.000Z',
  };

  it('requires two reviewers and cut ≥ keep', () => {
    expect(hasEditorialCutConsensus({ ...base, reviewers: 1, cut: 1, keep: 0 })).toBe(false);
    expect(hasEditorialCutConsensus({ ...base, cut: 1, keep: 2 })).toBe(false);
    expect(hasEditorialCutConsensus(base)).toBe(true);
  });

  it('routes with aggregate findings and never includes notes', () => {
    const routed = routeEditorialAggregate(base);
    expect(routed?.class).toBe('editorial');
    expect(routed?.evidence[0].finding).toMatch(/2 of 2 non-skip editorial reviews cut this game/);
    expect(routed?.evidence[0].finding).not.toMatch(/draft/i);
    expect(JSON.stringify(routed)).not.toMatch(/SECRET|NOTE|Draft A/i);
    expect(routed?.untrustedContext.errorSamples).toEqual([]);
  });

  it('stays silent without consensus', () => {
    expect(routeEditorialAggregate({ ...base, cut: 0, keep: 2 })).toBeNull();
  });
});

describe('playSignalWinsOverEditorial', () => {
  it('protects defect and friction only', () => {
    expect(playSignalWinsOverEditorial('defect')).toBe(true);
    expect(playSignalWinsOverEditorial('friction')).toBe(true);
    expect(playSignalWinsOverEditorial('design-change')).toBe(false);
    expect(playSignalWinsOverEditorial('editorial')).toBe(false);
  });
});
