// Summarizes delivered versions for the Studio build rail and its progress bar.

import { stagesForLane, type GateProgressStage } from './gate-progress.js';
import type { VersionManifest } from './games-store.js';

export interface RecentBuild {
  version: string;
  createdAt: string;
  // Lane that produced it; absent means 'publish'.
  mode: 'preview' | 'publish' | 'proposal';
  // 'pending' until this version's gate reports; not stuck.
  verdict: 'pending' | 'green' | 'red';
  // Machine-readable outcome for non-ordinary verdicts.
  status?: 'kit_outdated';
  // Where a red run died, so the bar can freeze.
  failedStage?: GateProgressStage;
  failedIndex?: number;
  // Lane stage count: preview 6, publish 12.
  total?: number;
  // Delivery to verdict, in ms; the ETA median is built from these.
  finishedInMs?: number;
}

// Null unless both ends parse; a bad clock is ignored.
function spanMs(from: string, to: string | undefined): number | null {
  const start = Date.parse(from);
  const end = to ? Date.parse(to) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return end - start;
}

// Preview verdicts live in their own field.
function verdictSourceFor(manifest: VersionManifest) {
  return (manifest.deliveryMode ?? 'publish') === 'preview' ? manifest.previewGate : manifest.gate;
}

export function toRecentBuild(manifest: VersionManifest): RecentBuild {
  const mode = manifest.deliveryMode ?? 'publish';
  const verdictSource = verdictSourceFor(manifest);
  const lane = mode === 'preview' ? 'preview' : 'publish';
  const stages = stagesForLane(lane);
  // Only a red verdict carries a position.
  const failedStage = verdictSource && !verdictSource.green ? verdictSource.failedStage : undefined;
  const failedIndex = failedStage ? stages.indexOf(failedStage) : -1;
  const finishedInMs = spanMs(manifest.createdAt, verdictSource?.ranAt);
  return {
    version: manifest.version,
    createdAt: manifest.createdAt,
    mode,
    verdict: verdictSource ? (verdictSource.green ? 'green' : 'red') : 'pending',
    ...(verdictSource?.status ? { status: verdictSource.status } : {}),
    ...(failedStage ? { failedStage } : {}),
    ...(failedIndex >= 0 ? { failedIndex } : {}),
    total: stages.length,
    ...(finishedInMs !== null ? { finishedInMs } : {}),
  };
}

export function toRecentBuilds(manifests: readonly VersionManifest[]): RecentBuild[] {
  return manifests.map(toRecentBuild);
}
