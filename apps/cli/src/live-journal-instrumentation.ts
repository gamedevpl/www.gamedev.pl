import type { JournalEntry } from './live-journal-protocol.js';

type SnapshotStatus = 'available' | 'unsupported' | 'unavailable' | 'error' | 'unknown';
export function journalInstrumentation() {
  return {
    samples: 0,
    lastSampleSeq: null as number | null,
    snapshotStatus: 'unknown' as SnapshotStatus,
    snapshotCounts: { available: 0, unsupported: 0, unavailable: 0, error: 0, unknown: 0 },
    harness: null as { seq: number; present: boolean; ready: boolean; snapshotMethod: boolean } | null,
  };
}
export type JournalInstrumentation = ReturnType<typeof journalInstrumentation>;

export function observeInstrumentation(info: JournalInstrumentation, entry: JournalEntry) {
  if (!entry.data || typeof entry.data !== 'object') return;
  const data = entry.data as Record<string, unknown>;
  if (entry.kind === 'lifecycle' && data.event === 'harness-capabilities') {
    if (typeof data.present === 'boolean' && typeof data.ready === 'boolean' && typeof data.snapshotState === 'boolean')
      info.harness = { seq: entry.seq, present: data.present, ready: data.ready, snapshotMethod: data.snapshotState };
  }
  if (entry.kind !== 'state') return;
  info.samples++;
  info.lastSampleSeq = entry.seq;
  const status = data.stateStatus;
  info.snapshotStatus =
    status === 'available' || status === 'unsupported' || status === 'unavailable' || status === 'error'
      ? status
      : 'unknown';
  info.snapshotCounts[info.snapshotStatus]++;
}

export function instrumentationReport(info: JournalInstrumentation) {
  const nextStep = !info.samples
    ? 'check_readiness_and_capture_gaps'
    : info.snapshotStatus === 'error'
      ? 'repair_snapshot_provider'
      : info.snapshotStatus === 'unsupported' || info.snapshotStatus === 'unavailable'
        ? 'add_observations_or_snapshot_if_needed'
        : 'inspect_recorded_fields';
  return { ...info, scope: 'latest evidence in this recording; not a guarantee for every historical frame', nextStep };
}

export const INSTRUMENTATION_HELP = {
  interpretation:
    'Missing snapshots do not mean the whole game is uninstrumented. Inputs, logs and observations may still be useful. No state samples can also mean startup, a disconnected recorder or capture failure; inspect coverage first.',
  workflow: [
    'Inspect the recorded fields and the game source to identify the data needed for this debugging task.',
    'If the required data is missing, use normal source-editing tools to add small, synchronous, JSON-serializable observations or fix/add snapshotState(). For GameKit inspect the installed Kit docs/types and existing observation or .persist(...) contract first.',
    'Avoid side effects and expensive serialization. Verify the change, release live control, and use the normal Play build-apply workflow.',
    'Reproduce the problem in the new build and check its new recordingId/revision for the requested fields. Instrumentation cannot backfill old recordings.',
  ],
  readOnly: true,
};
