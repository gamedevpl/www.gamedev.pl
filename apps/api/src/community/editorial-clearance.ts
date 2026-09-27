import {
  aggregateCreatorAssessments,
  hasEditorialCutConsensus,
  type ChecklistFacet,
  type EditorialAggregate,
} from './editorial-suggestions.js';
import type { GameAssessment } from '../platform/store.js';

export type EditorialClearanceDecision = 'blocked' | 'pending' | 'clear';

export interface EditorialClearance {
  decision: EditorialClearanceDecision;
  reviewers: number;
  keep: number;
  cut: number;
  skip: number;
  weakOrBad: Record<ChecklistFacet, number>;
}

export function decideEditorialClearance(
  rows: readonly GameAssessment[],
  slug: string,
  version: string,
): EditorialClearance {
  const agg = aggregateCreatorAssessments(rows.filter((row) => row.gameVersion === version)).find(
    (row) => row.slug === slug,
  );
  if (!agg) return emptyPending();
  if (hasEditorialCutConsensus(agg)) return fromAggregate(agg, 'blocked');
  if (agg.keep >= 1) return fromAggregate(agg, 'clear');
  return fromAggregate(agg, 'pending');
}

function fromAggregate(agg: EditorialAggregate, decision: EditorialClearanceDecision): EditorialClearance {
  return {
    decision,
    reviewers: agg.reviewers,
    keep: agg.keep,
    cut: agg.cut,
    skip: agg.skip,
    weakOrBad: agg.weakOrBad,
  };
}

function emptyPending(): EditorialClearance {
  return {
    decision: 'pending',
    reviewers: 0,
    keep: 0,
    cut: 0,
    skip: 0,
    weakOrBad: { graphics: 0, gameplay: 0, fun: 0, sound: 0, controls: 0 },
  };
}
