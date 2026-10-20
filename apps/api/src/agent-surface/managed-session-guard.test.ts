import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { guardManagedEnd, guardManagedSubmit, type ManagedCall } from './managed-session-guard.js';
import { toolOk } from './mcp-tool-support.js';

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

  it('closes after a lost submit stays running past the wait', async () => {
    const { store, deps, call } = await setup();
    await store.stepManagedSession(5, 's1', 'submit', new Date(deps.now()).toISOString());
    const ended = await guardManagedEnd(
      { ...deps, waitMs: 3_000 },
      call(async () => toolOk({ ended: true })),
    );
    expect(ended.structuredContent).toMatchObject({ ended: true });
  });
});
