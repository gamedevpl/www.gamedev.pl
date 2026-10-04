export const REVIEWER_COHORTS = ['include', 'exclude', 'only'] as const;
export type ReviewerCohort = (typeof REVIEWER_COHORTS)[number];

export function selectTelemetryCohort<T extends { reviewer?: boolean; agentMode?: boolean }>(
  events: readonly T[],
  key: (event: T) => string,
  cohort: ReviewerCohort = 'exclude',
  agentScope: 'session' | 'event' = 'session',
): T[] {
  const reviewers = new Set(events.filter((event) => event.reviewer === true).map(key));
  const agents = new Set(events.filter((event) => event.agentMode === true).map(key));
  return events.filter(
    (event) =>
      !(agentScope === 'session' ? agents.has(key(event)) : event.agentMode === true) &&
      (cohort === 'include' || (cohort === 'only') === reviewers.has(key(event))),
  );
}
