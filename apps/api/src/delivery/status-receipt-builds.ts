import type { RecentBuild } from '../platform/submission-status.js';
import type { SubmissionRecord } from '../platform/store.js';

export function receiptBuilds(builds: RecentBuild[], jobId: number, record: SubmissionRecord | null): RecentBuild[] {
  const versions = new Set([record?.deliveredVersion, record?.receiptRound?.version]);
  return builds.filter((build) => (build.jobId === undefined ? versions.has(build.version) : build.jobId === jobId));
}
