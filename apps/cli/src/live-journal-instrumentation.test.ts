import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createJournalStore } from './live-journal-store.js';
import type { JournalEntry } from './live-journal-protocol.js';

const stores: ReturnType<typeof createJournalStore>[] = [];
afterEach(() => stores.splice(0).forEach((store) => store.close()));
function fixture() {
  const store = createJournalStore();
  stores.push(store);
  const source = { tabId: randomUUID(), sourceId: 1, revision: 'before' };
  const recordingId = randomUUID();
  let seq = 0;
  const append = (kind: JournalEntry['kind'], data: unknown) => {
    seq++;
    store.append(source, {
      type: 'live:journal',
      recordingId,
      startedAt: 123,
      entries: [{ seq, frame: seq, timeMs: seq, kind, data }],
    });
  };
  return { store, source, recordingId, append };
}

it.each(['unsupported', 'unavailable'] as const)(
  'reports %s snapshots without labelling useful observations as uninstrumented',
  (status) => {
    const { store, recordingId, append } = fixture();
    append('lifecycle', {
      event: 'harness-capabilities',
      present: true,
      ready: true,
      snapshotState: status === 'unavailable',
    });
    append('state', { metadata: { health: 7 }, persistedState: null, stateStatus: status });
    const info = store.status().recordings[0]!.instrumentation;
    expect(info).toMatchObject({
      samples: 1,
      snapshotStatus: status,
      harness: { present: true, ready: true, snapshotMethod: status === 'unavailable' },
      nextStep: 'add_observations_or_snapshot_if_needed',
    });
    const result = store.read({ recordingId });
    expect(result.instrumentation).toEqual(info);
    expect(result.instrumentationHelp.workflow.join(' ')).toContain('normal source-editing tools');
    expect(result.instrumentationHelp.workflow.join(' ')).toContain('cannot backfill');
  },
);

it('distinguishes unready or missing capture from a broken snapshot provider', () => {
  const { store, recordingId, append } = fixture();
  append('lifecycle', { event: 'harness-capabilities', present: false, ready: false, snapshotState: false });
  append('gap', { reason: 'State serialization failed' });
  expect(store.read({ recordingId }).instrumentation).toMatchObject({
    samples: 0,
    snapshotStatus: 'unknown',
    nextStep: 'check_readiness_and_capture_gaps',
  });
  append('state', { metadata: { health: 7 }, persistedState: null, stateStatus: 'error' });
  expect(store.read({ recordingId }).instrumentation).toMatchObject({
    snapshotStatus: 'error',
    nextStep: 'repair_snapshot_provider',
  });
  append('state', { metadata: { health: 7 }, persistedState: { health: 7 }, stateStatus: 'available' });
  expect(store.read({ recordingId }).instrumentation).toMatchObject({
    snapshotStatus: 'available',
    snapshotCounts: { error: 1, available: 1 },
    nextStep: 'inspect_recorded_fields',
  });
});

it('keeps missing-field evidence separate from an empty match or an empty interval', () => {
  const { store, recordingId, append } = fixture();
  append('state', { metadata: { health: 7, target: null }, stateStatus: 'unsupported' });
  const absent = store.read({
    recordingId,
    kinds: ['state'],
    where: { path: '/metadata/collision', op: 'eq', value: true },
  });
  expect(absent.entries).toEqual([]);
  expect(absent.fieldAvailability.paths).toEqual({ '/metadata/collision': { present: 0, missing: 1 } });
  const unmatched = store.read({ recordingId, where: { path: '/metadata/health', op: 'lt', value: 0 } });
  expect(unmatched.entries).toEqual([]);
  expect(unmatched.fieldAvailability.paths).toEqual({ '/metadata/health': { present: 1, missing: 0 } });
  const empty = store.read({ recordingId, fromFrame: 500, fields: ['/metadata/collision'] });
  expect(empty.fieldAvailability.paths).toEqual({ '/metadata/collision': { present: 0, missing: 0 } });
  expect(store.read({ recordingId, fields: ['/metadata/target'] }).fieldAvailability.paths).toEqual({
    '/metadata/target': { present: 1, missing: 0 },
  });
});

it('reports the new build independently without changing the old recording', () => {
  const { store, source, recordingId, append } = fixture();
  append('state', { metadata: { health: 7 }, stateStatus: 'unsupported' });
  const old = store.read({ recordingId });
  const next = randomUUID();
  store.append(
    { ...source, revision: 'instrumented' },
    {
      type: 'live:journal',
      recordingId: next,
      startedAt: 456,
      entries: [
        {
          seq: 1,
          frame: 1,
          timeMs: 1,
          kind: 'state',
          data: { persistedState: { health: 7, collisions: [] }, stateStatus: 'available' },
        },
      ],
    },
  );
  expect(store.read({ recordingId }).entries).toEqual(old.entries);
  expect(store.read({ recordingId }).instrumentation.snapshotStatus).toBe('unsupported');
  expect(store.read({ recordingId: next }).instrumentation.snapshotStatus).toBe('available');
});
