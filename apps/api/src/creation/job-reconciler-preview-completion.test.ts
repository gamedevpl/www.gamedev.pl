import { describe, expect, it, vi } from 'vitest';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import type { GamesStore } from '../delivery/games-store.js';
import { sealRefusal } from '../platform/seal-preview.js';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { createJobReconciler } from './job-reconciler.js';

const AT = '2026-09-26T12:00:00.000Z';
type AgentState = 'in_progress' | 'completed' | 'idle';

async function setup(previewGate: { green: boolean } | null, observeQuietMs = 0, ledger = true, backend = 'managed') {
  const store = new InMemoryStore();
  await store.createSubmission(9, 'g:owner', 'Preview game');
  await store.setSubmissionSlug(9, 'preview-game');
  await store.recordDispatch(9, { backend, ref: 'session-1', workspace: 'ws-1' });
  if (ledger)
    await store.recordJobCost(9, { kind: 'agent_session', at: AT, by: 'managed', ref: 'session-1', credits: 1 });
  await store.recordJobTransition(9, { to: 'building', at: AT, by: 'agent', reason: 'task_in_progress' });
  await store.setSubmissionPreviewVersion(9, 'v1');
  await store.incrementRoundDeliveryCount(9);
  const generation = (await store.getSubmission(9))!.roundGeneration ?? 1;
  const agent = { state: 'completed' as AgentState };
  const observe = vi.fn(async (_ref: string, opts: { hasCandidate: boolean }) => ({
    state: agent.state,
    hasCandidate: opts.hasCandidate,
  }));
  const gate = { current: previewGate };
  const gamesStore = {
    getManifest: vi.fn(async () =>
      gate.current ? { roundGeneration: generation, previewGate: { ...gate.current, ranAt: AT } } : null,
    ),
  } as unknown as GamesStore;
  const resumeBuild = vi.fn(async () => ({}));
  const acknowledgeBuilderHandoff = vi.fn(async () => ({ started: false }));
  const reconciler = createJobReconciler({
    store,
    gamesStore,
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    now: () => Date.parse(AT) + 5 * 60_000,
    observeQuietMs,
    maxDeliveryNudges: 1,
    backendForRecord: async () => ({ name: 'managed', observe }) as unknown as AgentBackend,
    releaseWorkspace: async () => {},
    resumeBuild,
    acknowledgeBuilderHandoff,
    probeGateCrash: async () => null,
    postGateScreenshot: async () => null,
    onGateRed: async () => false,
  });
  const poll = async () => {
    const record = (await store.getSubmission(9))!;
    return (await reconciler.reconcileNativeJob(record)) ?? (await reconciler.reconcileGateVerdict(record));
  };
  return { store, agent, gate, observe, resumeBuild, acknowledgeBuilderHandoff, poll, reconciler };
}

describe('a finished session that delivered only a preview', () => {
  it('is not publish readiness while its preview gate is still pending', async () => {
    const { store, resumeBuild, poll } = await setup(null);
    await poll();
    const after = (await store.getSubmission(9))!;
    expect(after.state).toBe('building');
    expect(after.roundDeliveryCount).toBe(1);
    expect(sealRefusal(after)).toBe('not_reviewable');
    expect(resumeBuild).not.toHaveBeenCalled();
  });

  it('goes to needs_changes, not review, when its preview gate is red', async () => {
    const { store, poll } = await setup({ green: false });
    await poll();
    expect((await store.getSubmission(9))?.state).toBe('needs_changes');
  });

  it('becomes owner-sealable when a preview-only builder finishes green', async () => {
    const { store, poll } = await setup({ green: true });
    const transition = await poll();
    expect(transition).toMatchObject({ to: 'ready_for_review', reason: 'preview_gate_green' });
    const after = (await store.getSubmission(9))!;
    expect(after.deliveredVersion).toBeUndefined();
    expect(sealRefusal(after)).toBeNull();
    expect(await store.claimSeal(9, AT)).not.toBeNull();
  });

  it('seals up once a gate that was pending at session end turns green', async () => {
    const { store, gate, poll } = await setup(null);
    await poll();
    expect((await store.getSubmission(9))?.state).toBe('building');
    gate.current = { green: true };
    await poll();
    expect(sealRefusal((await store.getSubmission(9))!)).toBeNull();
  });

  it('keeps a green preview building while the session is still live', async () => {
    const { store, agent, poll } = await setup({ green: true });
    agent.state = 'in_progress';
    await poll();
    await poll();
    expect((await store.getSubmission(9))?.state).toBe('building');
  });

  it('seals up a green preview whose session ended but stays idle', async () => {
    const { store, agent, poll } = await setup({ green: true });
    agent.state = 'idle';
    await store.markAgentEnded(9, AT, 'end');
    await poll();
    await poll();
    expect(sealRefusal((await store.getSubmission(9))!)).toBeNull();
  });

  it('keeps an idle session without an end marker building', async () => {
    const { store, agent, poll } = await setup({ green: true });
    agent.state = 'idle';
    await poll();
    await poll();
    expect((await store.getSubmission(9))?.state).toBe('building');
  });

  it('ignores a completed state left by the previous round', async () => {
    const { store, poll } = await setup({ green: true }, 60 * 60_000);
    await store.setSubmissionAgentState(9, 'completed', 'session-1');
    await store.recordDispatch(9, { backend: 'managed', ref: 'session-2' });
    await store.recordJobCost(9, { kind: 'agent_session', at: AT, by: 'managed', ref: 'session-2', credits: 1 });
    await poll();
    await poll();
    expect((await store.getSubmission(9))?.state).toBe('building');
  });

  it('resumes a pending builder handoff when the preview round closes', async () => {
    const { store, acknowledgeBuilderHandoff, poll } = await setup({ green: true });
    await store.requestBuilderHandoff(9, 'self', AT);
    await poll();
    expect((await store.getSubmission(9))?.state).toBe('ready_for_review');
    expect(acknowledgeBuilderHandoff).toHaveBeenCalledWith(expect.objectContaining({ jobId: 9 }));
  });

  it('does not close a replacement round opened after the read', async () => {
    const { store, reconciler } = await setup({ green: true }, 60 * 60_000);
    await store.setJobCostFinished(9, 'session-1', AT, 'completed');
    const evaluated = (await store.getSubmission(9))!;
    await store.bumpRoundGeneration(9);
    await store.recordDispatch(9, { backend: 'managed', ref: 'session-2' });
    expect(await reconciler.reconcileGateVerdict(evaluated)).toBeNull();
    expect((await store.getSubmission(9))?.state).toBe('building');
  });

  it('seals up when the cost ledger entry was never written', async () => {
    const { store, poll } = await setup({ green: true }, 0, false);
    await poll();
    await poll();
    expect((await store.getSubmission(9))?.agentStateRef).toBe('session-1');
    expect(sealRefusal((await store.getSubmission(9))!)).toBeNull();
  });

  it('honours an explicit end marker whatever the provider reports', async () => {
    const { store, agent, poll } = await setup({ green: true }, 0, false);
    agent.state = 'in_progress';
    await store.markAgentEnded(9, AT, 'end');
    await poll();
    expect(sealRefusal((await store.getSubmission(9))!)).toBeNull();
  });

  it('lets a self editor preview plus end() be sealed by the owner', async () => {
    const { store, agent, poll } = await setup({ green: true }, 0, false, 'self');
    agent.state = 'in_progress';
    await store.markAgentEnded(9, AT, 'end');
    await poll();
    expect(sealRefusal((await store.getSubmission(9))!)).toBeNull();
  });

  it('does not treat a takeover marker as the agent ending', async () => {
    const { store, agent, poll } = await setup({ green: true }, 0, false, 'self');
    agent.state = 'in_progress';
    await store.markAgentEnded(9, AT, 'takeover');
    await poll();
    expect((await store.getSubmission(9))?.state).toBe('building');
  });

  it('does not close a round the same session resumed after end()', async () => {
    const { store, reconciler } = await setup({ green: true }, 60 * 60_000, false);
    await store.markAgentEnded(9, '2099-01-01T00:00:00.000Z', 'end');
    const evaluated = (await store.getSubmission(9))!;
    await store.clearAgentEnded(9);
    expect(await reconciler.reconcileGateVerdict(evaluated)).toBeNull();
    expect((await store.getSubmission(9))?.state).toBe('building');
  });
});

describe.each<[string, () => Store]>([
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
])('%s round-scoped transition guard', (_name, makeStore) => {
  it('refuses a close for another generation or dispatch ref', async () => {
    const store = makeStore();
    await store.createSubmission(4, 'g:owner', 'Guarded');
    await store.recordDispatch(4, { backend: 'managed', ref: 'session-2' });
    const close = { to: 'ready_for_review' as const, at: AT, by: 'gate' as const, reason: 'preview_gate_green' };
    expect(await store.recordJobTransition(4, close, { dispatchRef: 'session-1' })).toBe(false);
    expect(await store.recordJobTransition(4, close, { roundGeneration: 7 })).toBe(false);
    expect(await store.recordJobTransition(4, close, { roundGeneration: 1, dispatchRef: 'session-2' })).toBe(true);
  });
});
