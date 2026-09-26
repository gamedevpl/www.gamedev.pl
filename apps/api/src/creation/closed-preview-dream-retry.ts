import type { SubmissionRecord } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { dreamClaimHolds } from '../store/slices/round-budget.js';
import type { JobReconcilerDeps } from './job-reconciler.js';

export async function retryClosedPreviewDream(
  record: SubmissionRecord,
  gamesStore: GamesStore,
  onGreen: JobReconcilerDeps['onPreviewGateGreen'],
  now: () => number,
): Promise<void> {
  const receipt = record.receiptRound;
  const version = record.previewVersion;
  if (
    !onGreen ||
    !record.slug ||
    !version ||
    record.state !== 'ready_for_review' ||
    record.deliveredVersion ||
    record.abandonedAt ||
    record.moderationBlockedAt ||
    record.transitions?.at(-1)?.reason !== 'preview_gate_green' ||
    receipt?.version !== version ||
    receipt.generation + 1 !== record.roundGeneration
  )
    return;
  const at = new Date(now()).toISOString();
  if (
    dreamClaimHolds(record.dreamRun, version, at, receipt.generation) ||
    dreamClaimHolds(record.dreamRun, version, at, record.roundGeneration)
  )
    return;
  const manifest = await gamesStore.getManifest(record.slug, version);
  if (manifest?.roundGeneration !== receipt.generation || !manifest.previewGate?.green) return;
  await onGreen({
    record,
    version,
    ...(manifest.previewGate.screenshot ? { screenshotPath: manifest.previewGate.screenshot } : {}),
  });
}
