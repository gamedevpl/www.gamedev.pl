import { expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore, type Store } from '../platform/store.js';
import { mintAgentToken } from '../platform/agent-token.js';

function latch() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}
async function setup() {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:owner' });
  await store.createSubmission(7, 'g:owner', 'Game');
  await store.ensureRoundGeneration(7);
  await store.requestBuilderHandoff(7, 'self', new Date().toISOString());
  const app = await buildApp({ store, submissionRoutes: { submissionTokenSecret: 'handoff-secret' } });
  const headers = { authorization: `Bearer ${mintAgentToken(7, 'handoff-secret', { roundGeneration: 1 })}` };
  return { store, app, headers };
}

it('finalizes overlapping end requests once before opening the replacement round', async () => {
  const { store, app, headers } = await setup();
  const message = await store.appendCreatorMessage(7, 'Finish the game');
  const arrived = latch();
  const acknowledge = store.acknowledgeBuilderHandoff.bind(store);
  let callers = 0;
  store.acknowledgeBuilderHandoff = async (...args: Parameters<Store['acknowledgeBuilderHandoff']>) => {
    if (++callers === 2) arrived.release();
    await arrived.pending;
    return acknowledge(...args);
  };
  const closing: Array<{ summaries: number; pending: number; generation: number | undefined }> = [];
  const bump = store.bumpRoundGeneration.bind(store);
  vi.spyOn(store, 'bumpRoundGeneration').mockImplementation(async (jobId) => {
    closing.push({
      summaries: (await store.listBuildEvents(jobId)).filter((event) => event.kind === 'done').length,
      pending: (await store.listPendingCreatorMessages(jobId)).length,
      generation: (await store.getSubmission(jobId))?.roundGeneration,
    });
    return bump(jobId);
  });
  try {
    const payload = { summary: 'Handing over.', ackInboxIds: [message.id] };
    const replies = await Promise.all([
      app.inject({ method: 'POST', url: '/api/agent/build/end', headers, payload }),
      app.inject({ method: 'POST', url: '/api/agent/build/end', headers, payload }),
    ]);
    expect(replies.map((reply) => reply.statusCode)).toEqual([200, 200]);
    expect(replies.filter((reply) => reply.json().accepted)).toHaveLength(1);
    expect(closing).toEqual([{ summaries: 1, pending: 0, generation: 1 }]);
    expect((await store.listBuildEvents(7)).filter((event) => event.kind === 'done')).toHaveLength(1);
    expect((await store.getSubmission(7))?.roundGeneration).toBe(2);
  } finally {
    arrived.release();
    await app.close();
  }
});

it('cannot acknowledge a new handoff after takeover while the old end request waits', async () => {
  const { store, app, headers } = await setup();
  const entered = latch();
  const resume = latch();
  const acknowledge = store.acknowledgeBuilderHandoff.bind(store);
  store.acknowledgeBuilderHandoff = async (...args: Parameters<Store['acknowledgeBuilderHandoff']>) => {
    entered.release();
    await resume.pending;
    return acknowledge(...args);
  };
  try {
    const response = Promise.resolve(app.inject({ method: 'POST', url: '/api/agent/build/end', headers }));
    await entered.pending;
    await store.bumpRoundGeneration(7);
    await store.requestBuilderHandoff(7, 'self', new Date().toISOString());
    const before = await store.getSubmission(7);
    resume.release();
    expect((await response).statusCode).toBe(401);
    expect(await store.getSubmission(7)).toEqual(before);
    expect(await store.listBuildEvents(7)).toEqual([]);
  } finally {
    resume.release();
    await app.close();
  }
});
