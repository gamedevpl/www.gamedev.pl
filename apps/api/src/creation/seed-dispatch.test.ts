import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { createSeedDispatchClient, createSeedDispatchClientFromEnv, registerSeedDispatchRoute } from './seed-dispatch.js';

// The client answers one question: did the callee take it?

const audience = 'https://svc/api/internal/seed';
const token = async () => 'id-token';

function respond(status: number, body = '{}') {
  return vi.fn(async () => new Response(body, { status }));
}

describe('createSeedDispatchClient', () => {
  it('returns true on 202 and sends the job id with a bearer token for the audience', async () => {
    const fetchImpl = respond(202);
    const client = createSeedDispatchClient({ audience, authTokenFor: token, fetchImpl });

    expect(await client.enqueue(42)).toBe(true);

    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(audience);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer id-token');
    expect(JSON.parse(String(init.body))).toEqual({ jobId: 42, action: 'dispatch' });
  });

  it('carries the kind of work and the steer, so one route serves every seed job', async () => {
    const fetchImpl = respond(202);
    const client = createSeedDispatchClient({ audience, authTokenFor: token, fetchImpl });

    await client.enqueue(7, { action: 'regenerate', steer: 'more enemies' });

    const [, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ jobId: 7, action: 'regenerate', steer: 'more enemies' });
  });

  it('returns false on any other status, so the caller dispatches inline', async () => {
    for (const status of [200, 401, 500]) {
      const client = createSeedDispatchClient({ audience, authTokenFor: token, fetchImpl: respond(status) });
      expect(await client.enqueue(1)).toBe(false);
    }
  });

  it('returns false without an identity token, and never calls out', async () => {
    const fetchImpl = respond(202);
    const client = createSeedDispatchClient({ audience, authTokenFor: async () => undefined, fetchImpl });

    expect(await client.enqueue(1)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns false when the callee cannot be reached', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = createSeedDispatchClient({ audience, authTokenFor: token, fetchImpl });

    expect(await client.enqueue(1)).toBe(false);
  });

  it('gives up waiting for headers after the timeout', async () => {
    // A cold start that never answers must not hold the caller.
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const client = createSeedDispatchClient({ audience, authTokenFor: token, fetchImpl, timeoutMs: 5 });

    expect(await client.enqueue(1)).toBe(false);
  });
});

describe('createSeedDispatchClientFromEnv', () => {
  it('is null without an audience, which is the inline path', () => {
    expect(createSeedDispatchClientFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(createSeedDispatchClientFromEnv({ SEED_DISPATCH_AUDIENCE: '  ' } as NodeJS.ProcessEnv)).toBeNull();
    expect(createSeedDispatchClientFromEnv({ SEED_DISPATCH_AUDIENCE: audience } as NodeJS.ProcessEnv)).not.toBeNull();
  });
});

describe('registerSeedDispatchRoute', () => {
  const acceptAll = { verify: async () => true };

  async function routeApp(handlers: Partial<Parameters<typeof registerSeedDispatchRoute>[1]>) {
    const app = Fastify();
    await registerSeedDispatchRoute(app, {
      internalAuthVerifier: acceptAll,
      dispatchQueuedJob: async () => ({ outcome: 'dispatched' as const }),
      ...handlers,
    });
    return app;
  }

  it('runs a regeneration with its steer and reports it in the held-open body', async () => {
    const regenerateSeedNow = vi.fn(async () => undefined);
    const app = await routeApp({ regenerateSeedNow });

    const res = await app.inject({ method: 'POST', url: '/api/internal/seed', payload: { jobId: 3, action: 'regenerate', steer: 'calmer' } });

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body.trim())).toEqual({ outcome: 'regenerated' });
    expect(regenerateSeedNow).toHaveBeenCalledWith(expect.objectContaining({ jobId: 3, steer: 'calmer' }));
    await app.close();
  });

  it('assembles a staged preview and reports the assembler outcome', async () => {
    const publishStagedPreviewNow = vi.fn(async () => 'published');
    const app = await routeApp({ publishStagedPreviewNow });

    const res = await app.inject({ method: 'POST', url: '/api/internal/seed', payload: { jobId: 4, action: 'staged-preview' } });

    expect(JSON.parse(res.body.trim())).toEqual({ outcome: 'published' });
    expect(publishStagedPreviewNow).toHaveBeenCalledWith(4);
    await app.close();
  });

  it('answers 503 before any headers when the work is not wired here', async () => {
    const app = await routeApp({ regenerateSeedNow: null });

    const res = await app.inject({ method: 'POST', url: '/api/internal/seed', payload: { jobId: 5, action: 'regenerate' } });

    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('reports a failure in the body rather than a 5xx, since the headers are gone', async () => {
    const app = await routeApp({ dispatchQueuedJob: async () => { throw new Error('boom'); } });

    const res = await app.inject({ method: 'POST', url: '/api/internal/seed', payload: { jobId: 6 } });

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body.trim())).toEqual({ outcome: 'failed' });
    await app.close();
  });
});
