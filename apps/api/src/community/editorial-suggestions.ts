// Editorial desk cut consensus → Studio suggestion (aggregates only).
import { ASSESSMENT_CHECKLIST_KEYS, type AssessmentChecklistKey } from '@gamedevpl/contract';
import type { AssessmentChecklist, GameAssessment } from '../store.js';
import type { Suggestion, SuggestionEvidence } from './suggestions.js';

export const MIN_EDITORIAL_REVIEWERS = 2;

// Same facets as review-checklist.ts's ASSESSMENT_CHECKLIST_KEYS.
export const CHECKLIST_FACETS = ASSESSMENT_CHECKLIST_KEYS;
export type ChecklistFacet = AssessmentChecklistKey;

export interface EditorialAggregate {
  slug: string;
  title: string;
  reviewers: number;
  keep: number;
  cut: number;
  skip: number;
  weakOrBad: Record<ChecklistFacet, number>;
  latestUpdatedAt: string;
}

export function aggregateCreatorAssessments(rows: readonly GameAssessment[]): EditorialAggregate[] {
  const bySlug = new Map<
    string,
    {
      title: string;
      keep: number;
      cut: number;
      skip: number;
      weakOrBad: Record<ChecklistFacet, number>;
      latestUpdatedAt: string;
      reviewers: Set<string>;
    }
  >();

  for (const row of rows) {
    if (row.source !== 'creator') continue;
    const bucket = bySlug.get(row.slug) ?? {
      title: row.title || row.slug,
      keep: 0,
      cut: 0,
      skip: 0,
      weakOrBad: emptyWeakOrBad(),
      latestUpdatedAt: row.updatedAt,
      reviewers: new Set<string>(),
    };
    bucket.reviewers.add(row.reviewerUid);
    bucket[row.verdict] += 1;
    if (row.title && row.title !== row.slug) bucket.title = row.title;
    if (row.updatedAt > bucket.latestUpdatedAt) bucket.latestUpdatedAt = row.updatedAt;
    tallyChecklist(bucket.weakOrBad, row.checklist);
    bySlug.set(row.slug, bucket);
  }

  return [...bySlug.entries()]
    .map(([slug, bucket]) => ({
      slug,
      title: bucket.title,
      reviewers: bucket.reviewers.size,
      keep: bucket.keep,
      cut: bucket.cut,
      skip: bucket.skip,
      weakOrBad: bucket.weakOrBad,
      latestUpdatedAt: bucket.latestUpdatedAt,
    }))
    .sort((a, b) => b.cut - a.cut || a.slug.localeCompare(b.slug));
}

function emptyWeakOrBad(): Record<ChecklistFacet, number> {
  return { graphics: 0, gameplay: 0, fun: 0, sound: 0, controls: 0 };
}

function tallyChecklist(into: Record<ChecklistFacet, number>, checklist: AssessmentChecklist | null): void {
  if (!checklist) return;
  for (const facet of CHECKLIST_FACETS) {
    const mark = checklist[facet];
    if (mark === 'weak' || mark === 'bad') into[facet] += 1;
  }
}

export function hasEditorialCutConsensus(agg: EditorialAggregate): boolean {
  if (agg.reviewers < MIN_EDITORIAL_REVIEWERS) return false;
  if (agg.cut < 1) return false;
  return agg.cut >= agg.keep;
}

export function routeEditorialAggregate(agg: EditorialAggregate): Suggestion | null {
  if (!hasEditorialCutConsensus(agg)) return null;

  const judged = agg.keep + agg.cut;
  const evidence: SuggestionEvidence[] = [
    {
      finding: `${agg.cut} of ${judged} non-skip editorial reviews cut this game (${agg.reviewers} reviewers).`,
      metrics: {
        reviewers: agg.reviewers,
        keep: agg.keep,
        cut: agg.cut,
        skip: agg.skip,
        judged,
      },
    },
  ];

  const weakFacets = CHECKLIST_FACETS.filter((facet) => agg.weakOrBad[facet] > 0);
  if (weakFacets.length > 0) {
    const metrics: Record<string, number | null> = {};
    for (const facet of CHECKLIST_FACETS) metrics[facet] = agg.weakOrBad[facet];
    evidence.push({
      finding: `Checklist facets marked weak or bad: ${weakFacets
        .map((facet) => `${facet}×${agg.weakOrBad[facet]}`)
        .join(', ')}.`,
      metrics,
    });
  }

  const priority = agg.cut * 10 + weakFacets.reduce((sum, facet) => sum + agg.weakOrBad[facet], 0);

  return {
    slug: agg.slug,
    class: 'editorial',
    priority,
    evidence,
    untrustedContext: { errorSamples: [], progressLabels: [], feedbackThemes: [] },
    computedFrom: agg.latestUpdatedAt,
  };
}

export function playSignalWinsOverEditorial(existingClass: string): boolean {
  return existingClass === 'defect' || existingClass === 'friction';
}
