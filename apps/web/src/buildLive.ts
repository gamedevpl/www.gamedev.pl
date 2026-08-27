import type { RecentBuild, SubmissionStatus } from './submissionApi.js';

const CURRENTLY_MOVING_STATUSES = new Set<SubmissionStatus['status']>(['building', 'publishing']);

// The gate owning a delivery outranks an agent stall.
export function isBuildLive(status: SubmissionStatus): boolean {
  if (status.gateProgress) return true;
  if (status.phase === 'submitted') return true;
  if (status.stall) return false;
  return CURRENTLY_MOVING_STATUSES.has(status.status);
}

// recentBuilds is slug history — its newest entry may be an older round.
export function newestBuildIsCurrentRound(builds: RecentBuild[], status: SubmissionStatus): boolean {
  if (builds.length === 0) return false;
  if (typeof status.issueNumber !== 'number') return true;
  if (typeof builds[0]?.issueNumber !== 'number') return true;
  return builds[0].issueNumber === status.issueNumber;
}
