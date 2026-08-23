// Writes a verdict onto a version manifest, in memory.

import type { GateProgressStage } from './delivery/gate-progress.js';
import type { VersionManifest } from './delivery/games-store.js';

export interface GateResultInput {
  green: boolean;
  report?: string;
  status?: 'kit_outdated';
  screenshot?: string;
  behaviouralDiff?: boolean;
  engineRef?: string;
}

// Read before gateProgress is cleared; see the A28 runbook.
function dyingStage(manifest: VersionManifest, green: boolean): GateProgressStage | undefined {
  if (green) return undefined;
  return manifest.gateProgress?.stage;
}

export function applyGateVerdict(manifest: VersionManifest, result: GateResultInput, ranAt: string): void {
  const failedStage = dyingStage(manifest, result.green);
  manifest.gate = {
    green: result.green,
    ranAt,
    report: result.report,
    ...(result.status ? { status: result.status } : {}),
    ...(result.screenshot ? { screenshot: result.screenshot } : {}),
    ...(result.behaviouralDiff ? { behaviouralDiff: true } : {}),
    ...(failedStage ? { failedStage } : {}),
  };
  delete manifest.gateProgress;
}

export function applyPreviewGateVerdict(manifest: VersionManifest, result: GateResultInput, ranAt: string): void {
  const failedStage = dyingStage(manifest, result.green);
  manifest.previewGate = {
    green: result.green,
    ranAt,
    ...(result.report ? { report: result.report } : {}),
    ...(result.status ? { status: result.status } : {}),
    ...(result.screenshot ? { screenshot: result.screenshot } : {}),
    ...(failedStage ? { failedStage } : {}),
  };
  delete manifest.gateProgress;
}

export function applyHealthVerdict(
  manifest: VersionManifest,
  result: { green: boolean; report?: string; engineRef?: string },
  ranAt: string,
): void {
  manifest.health = {
    green: result.green,
    ranAt,
    ...(result.engineRef ? { engineRef: result.engineRef } : {}),
    ...(result.report ? { report: result.report } : {}),
  };
  delete manifest.gateProgress;
}
