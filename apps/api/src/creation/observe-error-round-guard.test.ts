import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryStore, FirestoreStore, type Store } from '../platform/store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import { createJobReconciler } from './job-reconciler.js';
import { recordSessionCrash } from './session-crash-record.js';
import { resetSessionCrashCounters } from './session-crash.js';

const AT = '2026-09-26T12:00:00.000Z';
async function setup() {
  const store = new InMemoryStore();
  await store.createSubmission(9, 'g:owner', 'Game');
  await store.recordDispatch(9, { backend: 'managed', ref: 'session-1', workspace: 'ws' });
  await store.recordJobTransition(9, { to: 'building', by: 'agent', at: AT });
  await store.recordJobCost(9, { kind: 'agent_session', at: AT, by: 'managed', ref: 'session-1', credits: 1 });
  const observe = vi.fn(async () => {
    throw new Error('backend unavailable');
  });
  const reconciler = createJobReconciler({
    store,
    gamesStore: undefined,
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    now: () => Date.parse(AT) + 60_000,
    observeQuietMs: 0,
    maxDeliveryNudges: 1,
    backendForRecord: async () => ({ name: 'managed', observe }) as unknown as AgentBackend,
    releaseWorkspace: async () => {},
    resumeBuild: async () => ({}),
    probeGateCrash: async () => null,
    postGateScreenshot: async () => null,
    onGateRed: async () => false,
  });
  return { store, observe, reconciler };
}

describe('observe errors respect the latest job authority', () => {
  afterEach(resetSessionCrashCounters);
  it('settles only costs when a gated job still has unmeasured usage', async () => {
    const { store, reconciler } = await setup();
    await store.recordJobTransition(9, { to: 'ready_for_review', by: 'gate', at: AT });
    for (let i = 0; i < 2; i++) await reconciler.reconcileNativeJob((await store.getSubmission(9))!);
    expect((await store.getSubmission(9))?.state).toBe('ready_for_review');
  });
  it('does not reclaim a candidate whose gate closes during observation', async () => {
    const { store, observe, reconciler } = await setup();
    await reconciler.reconcileNativeJob((await store.getSubmission(9))!);
    observe.mockImplementationOnce(async () => {
      await store.recordJobTransition(9, { to: 'ready_for_review', by: 'gate', at: AT });
      throw new Error('late backend failure');
    });
    await reconciler.reconcileNativeJob((await store.getSubmission(9))!);
    expect((await store.getSubmission(9))?.state).toBe('ready_for_review');
  });
  it('does not close a replacement dispatch after a stale observation fails', async () => {
    const { store, observe, reconciler } = await setup();
    await reconciler.reconcileNativeJob((await store.getSubmission(9))!);
    observe.mockImplementationOnce(async () => {
      await store.recordDispatch(9, { backend: 'managed', ref: 'session-2', workspace: 'next' });
      throw new Error('old backend failure');
    });
    await reconciler.reconcileNativeJob((await store.getSubmission(9))!);
    expect((await store.getSubmission(9))?.state).toBe('building');
  });
  it('still closes an active round after repeated errors', async () => {
    const { store, reconciler } = await setup();
    for (let i = 0; i < 2; i++) await reconciler.reconcileNativeJob((await store.getSubmission(9))!);
    expect((await store.getSubmission(9))?.state).toBe('needs_changes');
  });
  it.each(['memory', 'firestore'])('atomically refuses a state change after the last read: %s', async (kind) => {
    const store: Store = kind === 'memory' ? new InMemoryStore() : new FirestoreStore(fakeFirestore().db);
    await store.createSubmission(9, 'g:owner', 'Game');
    await store.recordDispatch(9, { backend: 'managed', ref: 'session-1' });
    await store.recordJobTransition(9, { to: 'building', by: 'agent', at: AT });
    const evaluated = (await store.getSubmission(9))!;
    const write = store.recordJobTransition.bind(store);
    vi.spyOn(store, 'recordJobTransition').mockImplementationOnce(async (job, transition, guard) => {
      await write(9, { to: 'submitted', by: 'gate', at: AT });
      return write(job, transition, guard);
    });
    expect(await recordSessionCrash(store, evaluated, 'session-1', () => Date.parse(AT))).toBeNull();
    expect((await store.getSubmission(9))?.state).toBe('submitted');
  });
});
