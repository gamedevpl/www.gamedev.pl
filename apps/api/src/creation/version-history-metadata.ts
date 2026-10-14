import type { HistoryVersion } from '@gamedevpl/contract';
import type { VersionManifest } from '../delivery/games-store.js';

export function historyMetadata(row: VersionManifest): HistoryVersion {
  const gate = row.previewGate ?? row.gate;
  return {
    version: row.version,
    createdAt: row.createdAt,
    jobId: row.jobId,
    sourceFiles: row.sourceFiles,
    ...(row.deliveryMode ? { deliveryMode: row.deliveryMode } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.backend ? { backend: row.backend } : {}),
    ...(row.model ? { model: row.model } : {}),
    ...(row.origin ? { origin: row.origin } : {}),
    verdict: gate?.status ?? (gate ? (gate.green ? 'passed' : 'failed') : (row.gateCrash?.status ?? 'pending')),
  };
}
