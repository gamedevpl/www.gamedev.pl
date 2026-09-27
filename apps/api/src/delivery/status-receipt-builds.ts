import type { RecentBuild, SubmissionStatusResponse } from '../platform/submission-status.js';
import type { SubmissionRecord } from '../platform/store.js';

export function receiptBuilds(builds: RecentBuild[], jobId: number, record: SubmissionRecord | null): RecentBuild[] {
  const versions = new Set([record?.deliveredVersion, record?.receiptRound?.version]);
  return builds.filter((build) => (build.jobId === undefined ? versions.has(build.version) : build.jobId === jobId));
}

export function redactReceiptMetadata(status: SubmissionStatusResponse, record: SubmissionRecord | null): void {
  delete status.totalBuildsCount;
  const version = status.progress?.headSha || record?.previewVersion || record?.deliveredVersion;
  const trusted =
    version &&
    (version === record?.deliveredVersion ||
      version === record?.receiptRound?.version ||
      status.recentBuilds?.some((build) => build.version === version));
  if (trusted) return;
  if (status.progress) status.progress.headSha = '';
  delete status.previewGate;
  delete status.gateProgress;
  delete status.canSeal;
  delete status.preview;
}

export function finishReceiptStatus(
  status: SubmissionStatusResponse,
  record: SubmissionRecord | null,
  viewerOwns: boolean,
): SubmissionStatusResponse {
  if (!viewerOwns) redactReceiptMetadata(status, record);
  return status;
}
