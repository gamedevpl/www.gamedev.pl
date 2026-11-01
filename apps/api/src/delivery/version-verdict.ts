// Writes a verdict onto a version manifest, in memory.

import { normalizeGateStageName, type GateProgressStage } from './gate-progress.js';
import type { VersionManifest } from './games-store.js';

export interface GateResultInput {
  green: boolean;
  report?: string;
  status?: 'kit_outdated';
  screenshot?: string;
  behaviouralDiff?: boolean;
  engineRef?: string;
}

export function parseFailedGateStage(report: string | undefined): GateProgressStage | undefined {
  if (!report) return undefined;
  const patterns = [
    /FAILED at\s+([a-z][a-z0-9:-]*)\s+after\b/i,
    /===\s+([a-z][a-z0-9:-]*)\s+\([^)\n]*\)\s+FAILED\b/i,
    /(?:^|\n)\s*FAIL\s+([a-z][a-z0-9:-]*)\b/i,
  ];
  for (const re of patterns) {
    const match = re.exec(report);
    const stage = match?.[1] ? normalizeGateStageName(match[1]) : null;
    if (stage) return stage;
  }
  return undefined;
}

export function resolveFailedStage(
  verdictSource: { green: boolean; failedStage?: GateProgressStage; report?: string } | undefined,
  crash: { failedStage?: GateProgressStage } | undefined,
): GateProgressStage | undefined {
  if (!verdictSource) return crash?.failedStage;
  if (verdictSource.green) return undefined;
  return parseFailedGateStage(verdictSource.report) ?? verdictSource.failedStage;
}

// Read before gateProgress is cleared; see the A28 runbook.
function dyingStage(manifest: VersionManifest, green: boolean, report?: string): GateProgressStage | undefined {
  if (green) return undefined;
  return parseFailedGateStage(report) ?? manifest.gateProgress?.stage;
}

export function applyGateVerdict(manifest: VersionManifest, result: GateResultInput, ranAt: string): void {
  const failedStage = dyingStage(manifest, result.green, result.report);
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
  delete manifest.gateCrash;
}

export function applyPreviewGateVerdict(manifest: VersionManifest, result: GateResultInput, ranAt: string): void {
  const failedStage = dyingStage(manifest, result.green, result.report);
  manifest.previewGate = {
    green: result.green,
    ranAt,
    ...(result.report ? { report: result.report } : {}),
    ...(result.status ? { status: result.status } : {}),
    ...(result.screenshot ? { screenshot: result.screenshot } : {}),
    ...(failedStage ? { failedStage } : {}),
  };
  delete manifest.gateProgress;
  delete manifest.gateCrash;
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
  delete manifest.gateCrash;
}
