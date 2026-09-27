import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { registerSeedDispatchRoute } from './seed-dispatch.js';

it('carries the expected round through the dream handoff', async () => {
  const runDreamNow = vi.fn(async () => 'superseded');
  const app = Fastify();
  try {
    await registerSeedDispatchRoute(app, {
      runDreamNow,
      dispatchQueuedJob: async () => ({ outcome: 'skipped' }),
      internalAuthVerifier: { verify: async () => true },
    });
    const input = { jobId: 7, action: 'dream', version: 'v1', expectedRoundGeneration: 2 };
    const response = await app.inject({ method: 'POST', url: '/api/internal/seed', payload: input });
    expect(response.statusCode).toBe(202);
    expect(runDreamNow).toHaveBeenCalledWith({ jobId: 7, version: 'v1', expectedRoundGeneration: 2 });
    expect(JSON.parse(response.body.trim())).toEqual({ outcome: 'superseded' });
  } finally {
    await app.close();
  }
});
