import type { RecentBuild, SubmissionStatusResponse } from '../platform/submission-status.js';
import type { GamesStore } from './games-store.js';
import type { SubmissionRecord } from '../platform/store.js';

export function receiptBuilds(builds: RecentBuild[], jobId: number, record: SubmissionRecord | null): RecentBuild[] {
  const versions = new Set([record?.deliveredVersion, record?.receiptRound?.version]);
  return builds.filter((build) => (build.jobId === undefined ? versions.has(build.version) : build.jobId === jobId));
}

function redactReceiptMetadata(
  status: SubmissionStatusResponse,
  record: SubmissionRecord | null,
  trustedVersion?: string,
): void {
  delete status.totalBuildsCount;
  const version = status.progress?.headSha || record?.previewVersion || record?.deliveredVersion;
  const trusted =
    version &&
    (version === record?.deliveredVersion || version === record?.receiptRound?.version || version === trustedVersion);
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
  trustedVersion?: string,
): SubmissionStatusResponse {
  if (!viewerOwns) redactReceiptMetadata(status, record, trustedVersion);
  return status;
}

export async function refreshReceiptGateProgress(
  status: SubmissionStatusResponse,
  record: SubmissionRecord,
  gamesStore: GamesStore | undefined,
  jobId: number,
): Promise<string | undefined> {
  const version = record.previewVersion ?? record.deliveredVersion;
  if (!record.slug || !version || !gamesStore?.getManifest) return undefined;
  try {
    const manifest = await gamesStore.getManifest(record.slug, version);
    if (manifest?.gateProgress && !manifest.gate && !manifest.previewGate) status.gateProgress = manifest.gateProgress;
    else delete status.gateProgress;
    return manifest?.jobId === jobId ? version : undefined;
  } catch {
    return undefined;
  }
}
