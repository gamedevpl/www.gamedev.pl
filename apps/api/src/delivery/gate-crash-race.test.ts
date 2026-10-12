import { describe, expect, it, vi } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { lastRoundActivityAt } from '../platform/quiet-round.js';
import { createGateCrashProbe } from './gate-crash.js';
import type { GamesStore } from './games-store.js';
import { createJobReconciler } from '../creation/job-reconciler.js';

const stores: Array<[string, () => Store]> = [
  ['memory', () => new InMemoryStore()],
  ['Firestore', () => new FirestoreStore(fakeFirestore().db)],
];

describe.each(stores)('%s gate crash delivery guard', (_name, makeStore) => {
  it.each(['publish', 'preview'] as const)(
    'preserves a replaced %s delivery before its heartbeat changes',
    async (lane) => {
      const store = makeStore();
      await store.createSubmission(7, 'g:owner', 'Retry');
      await store.setSubmissionSlug(7, 'retry-game');
      const createdAt = (await store.getSubmission(7))!.createdAt;
      await store.recordDispatch(7, { backend: 'managed', ref: 'session-1' });
      await store.recordJobTransition(7, {
        to: lane === 'publish' ? 'submitted' : 'building',
        by: 'agent',
        at: createdAt,
      });
      if (lane === 'publish') await store.setSubmissionDeliveredVersion(7, 'v1');
      else await store.setSubmissionPreviewVersion(7, 'v1');
      await store.recordJobCost(7, { kind: 'gate_run', at: createdAt, by: 'cloud-build', ref: 'build-1' });
      const seen = (await store.getSubmission(7))!;
      const now = () => Date.parse(createdAt) + 60 * 60_000;
      const putGateCrash = vi.fn(async () => true);
      const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const probe = createGateCrashProbe({
        recordJobTransition: store.recordJobTransition.bind(store),
        getManifest: async () => ({ createdAt, roundGeneration: 1, jobId: 7 }),
        putGateCrash,
        log,
        now,
        thresholdMs: 10 * 60_000,
        readBuildOutcome: async () => {
          if (lane === 'publish') await store.setSubmissionDeliveredVersion(7, 'v2');
          else await store.setSubmissionPreviewVersion(7, 'v2');
          expect(lastRoundActivityAt((await store.getSubmission(7))!)).toBe(lastRoundActivityAt(seen));
          return 'timed_out';
        },
      });
      expect(await probe(seen)).toBeNull();
      expect(putGateCrash).toHaveBeenCalledWith('retry-game', 'v1', expect.anything());
      const after = (await store.getSubmission(7))!;
      expect(after.state).toBe(seen.state);
      expect(after.previewVersion).toBe('v2');
      expect(after.transitions?.some((entry) => entry.reason === 'gate_crashed')).toBe(false);

      await store.markAgentEnded(7, new Date(now()).toISOString(), 'end');
      const gamesStore = {
        getManifest: async (_slug: string, version: string) => {
          expect(version).toBe('v2');
          const verdict = { green: true, ranAt: new Date(now()).toISOString() };
          return { roundGeneration: 1, ...(lane === 'publish' ? { gate: verdict } : { previewGate: verdict }) };
        },
      } as unknown as GamesStore;
      const reconciler = createJobReconciler({
        store,
        gamesStore,
        log,
        now,
        observeQuietMs: 0,
        maxDeliveryNudges: 1,
        backendForRecord: async () => undefined,
        releaseWorkspace: async () => {},
        resumeBuild: async () => ({}),
        acknowledgeBuilderHandoff: async () => ({ started: false }),
        probeGateCrash: async () => null,
        postGateScreenshot: async () => null,
      });
      expect(await reconciler.reconcileGateVerdict((await store.getSubmission(7))!)).toMatchObject({
        to: 'ready_for_review',
      });
    },
  );
});
