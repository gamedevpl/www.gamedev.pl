import type { RecentBuild } from '../../submissionApi.js';

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
