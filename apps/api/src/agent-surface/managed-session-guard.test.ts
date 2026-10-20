import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { guardManagedEnd, guardManagedSubmit, type ManagedCall } from './managed-session-guard.js';
import { toolOk } from './mcp-tool-support.js';
import { nextManagedSession } from '../store/slices/managed-session-step.js';

async function setup() {
  const store = new InMemoryStore();
  await store.createSubmission(5, 'g:owner', 'Game');
  let clock = Date.parse('2026-10-20T10:00:00.000Z');
  const deps = {
    store,
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
  };
  const call = (run: ManagedCall['run'], sessionId = 's1'): ManagedCall => ({
    jobId: 5,
    roundGeneration: 1,
    sessionId,
    handoffPending: false,
    mode: 'preview',
    live: async () => ({ statusCode: 200, json: () => ({ pending: [] }) }),
    run,
  });
  return { store, deps, call };
}

describe('managed session guard', () => {
  it('lets end wait for a running submit and close once it delivered', async () => {
    const { deps, call } = await setup();
    let release!: () => void;
    const submitted = guardManagedSubmit(
      deps,
      call(() => new Promise((resolve) => (release = () => resolve(toolOk({ ok: true }))))),
    );
    await Promise.resolve();
    const order: string[] = [];
    const ended = guardManagedEnd(
      {
        ...deps,
        sleep: async (ms) => {
          await deps.sleep(ms);
          if (order.push('poll') === 2) release();
        },
      },
      call(async () => toolOk({ ok: true, ended: true })),
    );
    await submitted;
    expect(await ended).toMatchObject({ structuredContent: { ok: true, ended: true } });
    expect(order.length).toBeGreaterThanOrEqual(2);
  });

  it('never refuses an end that acknowledges a builder handoff, nor another session', async () => {
    const { deps, call } = await setup();
    await guardManagedSubmit(
      deps,
      call(async () => toolOk({ ok: false })),
    );
    const ack = { ...call(async () => toolOk({ ok: true, ended: true })), handoffPending: true };
    expect((await guardManagedEnd(deps, ack)).structuredContent).toMatchObject({ ended: true });
    const other = call(async () => toolOk({ ok: true, ended: true }), 's2');
    expect((await guardManagedEnd(deps, other)).structuredContent).toMatchObject({ ended: true });
  });

  it('refuses end while a submit still runs past the wait, and ends once it is lost', async () => {
    const { store, deps, call } = await setup();
    await store.stepManagedSession(5, 1, 's1', 'submit', new Date(deps.now()).toISOString());
    const ended = () =>
      guardManagedEnd(
        { ...deps, waitMs: 3_000 },
        call(async () => toolOk({ ended: true })),
      );
    expect((await ended()).structuredContent).toMatchObject({ ended: false, rejected: 'submit_running' });
    await deps.sleep(90_000);
    expect((await ended()).structuredContent).toMatchObject({ ended: true });
  });

  it('keeps waiting while any of two overlapping submits runs', async () => {
    const { store, deps } = await setup();
    const at = () => new Date(deps.now()).toISOString();
    await store.stepManagedSession(5, 1, 's1', 'submit', at());
    await store.stepManagedSession(5, 1, 's1', 'submit', at());
    await store.stepManagedSession(5, 1, 's1', 'delivered', at());
    expect(await store.stepManagedSession(5, 1, 's1', 'end', at())).toBe('wait');
    await store.stepManagedSession(5, 1, 's1', 'refused', at());
    expect(await store.stepManagedSession(5, 1, 's1', 'end', at())).toBe('ok');
  });

  it('ignores a step from a round that has moved on', async () => {
    const { store, deps } = await setup();
    const at = () => new Date(deps.now()).toISOString();
    await store.stepManagedSession(5, 1, 's1', 'submit', at());
    await store.bumpRoundGeneration(5);
    await store.stepManagedSession(5, 2, 's2', 'submit', at());
    await store.stepManagedSession(5, 1, 's1', 'submit', at());
    expect(await store.stepManagedSession(5, 2, 's2', 'end', at())).toBe('wait');
  });

  it('keeps every session of the round: end waits for the other session’s submit', async () => {
    const { store, deps } = await setup();
    const at = () => new Date(deps.now()).toISOString();
    await store.stepManagedSession(5, 1, 's1', 'submit', at());
    expect(await store.stepManagedSession(5, 1, 's2', 'end', at())).toBe('wait');
    await store.stepManagedSession(5, 1, 's1', 'delivered', at());
    expect(await store.stepManagedSession(5, 1, 's1', 'end', at())).toBe('ok');
    expect(await store.stepManagedSession(5, 1, 's2', 'submit', at())).toBe('ok');
    expect(await store.stepManagedSession(5, 1, 's1', 'submit', at())).toBe('ended');
  });

  it('lets end acknowledge a handoff the record shows, even mid-submit', () => {
    const at = '2026-10-20T10:00:00.000Z';
    const submitted = nextManagedSession({}, 1, 's1', 'submit', at).state!;
    const handoff = { awaitsAgentAck: true } as never;
    expect(nextManagedSession({ managedSessions: submitted }, 1, 's1', 'end', at).outcome).toBe('wait');
    expect(
      nextManagedSession({ managedSessions: submitted, builderHandoff: handoff }, 1, 's1', 'end', at).outcome,
    ).toBe('ok');
  });

  it('forgets sessions of an earlier round generation', () => {
    const at = '2026-10-20T10:00:00.000Z';
    const earlier = nextManagedSession({}, 1, 's1', 'submit', at).state!;
    expect(nextManagedSession({ managedSessions: earlier }, 2, 's2', 'end', at).outcome).toBe('ok');
  });

  it('leaves the session open when the channel refuses its end', async () => {
    const { store, deps, call } = await setup();
    const refused = { isError: true, content: [], structuredContent: { error: 'summary too long' } };
    await guardManagedEnd(
      deps,
      call(async () => refused as never),
    );
    const at = new Date(deps.now()).toISOString();
    expect(await store.stepManagedSession(5, 1, 's1', 'submit', at)).toBe('ok');
  });

  it('keeps every session of the round, running or ended', () => {
    const at = '2026-10-20T10:00:00.000Z';
    let record = { managedSessions: nextManagedSession({}, 1, 's0', 'submit', at).state! };
    for (let i = 1; i <= 9; i += 1) {
      const id = `s${i}`;
      record = { managedSessions: nextManagedSession(record, 1, id, 'submit', at).state! };
      record = { managedSessions: nextManagedSession(record, 1, id, 'delivered', at).state! };
    }
    expect(Object.keys(record.managedSessions.byId)).toContain('s0');
    expect(nextManagedSession(record, 1, 's9', 'end', at).outcome).toBe('wait');
    record = { managedSessions: nextManagedSession(record, 1, 's0', 'delivered', at).state! };
    record = { managedSessions: nextManagedSession(record, 1, 's1', 'end', at).state! };
    for (let i = 10; i <= 20; i += 1) {
      record = { managedSessions: nextManagedSession(record, 1, `s${i}`, 'submit', at).state! };
    }
    expect(nextManagedSession(record, 1, 's1', 'submit', at).outcome).toBe('ended');
  });
});
