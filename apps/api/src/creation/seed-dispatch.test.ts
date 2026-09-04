import { describe, expect, it, vi } from 'vitest';
import { createSeedDispatchClient, createSeedDispatchClientFromEnv } from './seed-dispatch.js';

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
    expect(JSON.parse(String(init.body))).toEqual({ jobId: 42 });
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
