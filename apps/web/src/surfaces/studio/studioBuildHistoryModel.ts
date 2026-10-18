import { isAwaitingVerification, isBuildLive, isCurrentBuild } from '../../buildLive.js';
import type { RecentBuild, SubmissionStatus } from '../../submissionApi.js';

export function buildHistoryVerdict(status: SubmissionStatus, build: RecentBuild) {
  if (build.verdict !== 'pending') return build.verdict;
  if (isAwaitingVerification(status, build)) return 'waiting';
  return isCurrentBuild(status, build) && isBuildLive(status) ? 'pending' : 'unverified';
}

export function mergeBuildHistory(status: readonly RecentBuild[], fetched: readonly RecentBuild[]): RecentBuild[] {
  const versions = new Map(fetched.map((build) => [build.version, build]));
  for (const build of status) {
    const fetchedBuild = versions.get(build.version);
    if (build.verdict === 'pending' && fetchedBuild && fetchedBuild.verdict !== 'pending') continue;
    versions.set(build.version, build);
  }
  return [...versions.values()].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.version.localeCompare(a.version),
  );
}
