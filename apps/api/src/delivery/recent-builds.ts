import type { RecentBuild } from '@gamedevpl/contract';
import { stagesForLane } from './gate-progress.js';
import type { VersionManifest } from './games-store.js';
import { resolveFailedStage } from './version-verdict.js';

export type { RecentBuild } from '@gamedevpl/contract';

function spanMs(from: string, to: string | undefined): number | null {
  const start = Date.parse(from);
  const end = to ? Date.parse(to) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return end - start;
}

function verdictSourceFor(manifest: VersionManifest) {
  return (manifest.deliveryMode ?? 'publish') === 'preview' ? manifest.previewGate : manifest.gate;
}

export function toRecentBuild(manifest: VersionManifest): RecentBuild {
  const mode = manifest.deliveryMode ?? 'publish';
  const verdictSource = verdictSourceFor(manifest);
  const crash = verdictSource ? undefined : manifest.gateCrash;
  const lane = mode === 'preview' ? 'preview' : 'publish';
  const stages = stagesForLane(lane);
  const failedStage = resolveFailedStage(verdictSource, crash);
  const failedIndex = failedStage ? stages.indexOf(failedStage) : -1;
  const finishedInMs = spanMs(manifest.createdAt, verdictSource?.ranAt);
  const report = verdictSource && !verdictSource.green ? verdictSource.report : undefined;
  return {
    version: manifest.version,
    createdAt: manifest.createdAt,
    mode,
    verdict: verdictSource ? (verdictSource.green ? 'green' : 'red') : crash ? 'red' : 'pending',
    ...(crash ? { status: crash.status } : {}),
    ...(verdictSource?.status ? { status: verdictSource.status } : {}),
    ...(failedStage ? { failedStage } : {}),
    ...(failedIndex >= 0 ? { failedIndex } : {}),
    total: stages.length,
    ...(finishedInMs !== null ? { finishedInMs } : {}),
    ...(manifest.authorship ? { authorship: manifest.authorship } : {}),
    ...(manifest.summary ? { summary: manifest.summary } : {}),
    ...(manifest.sourceFiles ? { fileCount: manifest.sourceFiles.length } : {}),
    ...(manifest.jobId ? { jobId: manifest.jobId } : {}),
    ...(report ? { report } : {}),
  };
}

export function toRecentBuilds(manifests: readonly VersionManifest[]): RecentBuild[] {
  return manifests.map(toRecentBuild);
}
