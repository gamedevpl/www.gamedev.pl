import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withRemoteVerdicts } from './gate-verdict-client.js';
import { GATE_VERDICT_PATH, registerGateVerdictRoutes } from './gate-verdict-routes.js';
import { GATE_VERDICT_TOKEN_TTL_SECONDS, mintGateVerdictToken, readGateVerdictToken } from './gate-verdict-token.js';
import type { GamesStore } from './games-store.js';

const secret = 'gate-verdict-test-secret';

function recordingStore() {
  const calls: Array<{ method: string; slug: string; version: string; result: unknown }> = [];
  const record =
    (method: string) =>
    async (slug: string, version: string, result: unknown): Promise<void> => {
      calls.push({ method, slug, version, result });
    };
  const store = {
    putGateResult: record('gate'),
    putPreviewGateResult: record('preview'),
    putHealthResult: record('health'),
    putGateProgress: record('progress'),
  } as unknown as GamesStore;
  return { store, calls };
}

async function serve(store: GamesStore, now = () => Date.now()): Promise<FastifyInstance> {
  const app = Fastify();
  registerGateVerdictRoutes(app, { store, secret, now });
  await app.ready();
  return app;
}

describe('gate verdict capability', () => {
  it('round-trips the version it was minted for', () => {
    const claims = readGateVerdictToken(mintGateVerdictToken('comet-courier', 'v1', secret), secret);
    expect(claims.slug).toBe('comet-courier');
    expect(claims.version).toBe('v1');
  });

  it('refuses a token signed with another secret', () => {
    const token = mintGateVerdictToken('comet-courier', 'v1', 'someone-elses-secret');
    expect(() => readGateVerdictToken(token, secret)).toThrow(/signature/);
  });

  it('refuses a token past its expiry', () => {
    const token = mintGateVerdictToken('comet-courier', 'v1', secret, 'gate', 1000);
    expect(() => readGateVerdictToken(token, secret, 1000 + GATE_VERDICT_TOKEN_TTL_SECONDS + 1)).toThrow(/expired/);
  });

  it('refuses a payload edited after signing', () => {
    const token = mintGateVerdictToken('comet-courier', 'v1', secret);
    const forged = `${Buffer.from(JSON.stringify({ slug: 'other', version: 'v1', kind: 'gate', exp: 9e9 })).toString('base64url')}.${token.split('.')[1]}`;
    expect(() => readGateVerdictToken(forged, secret)).toThrow(/signature/);
  });
});

describe('POST /api/internal/gate-verdict', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function post(app: FastifyInstance, token: string | null, payload: unknown) {
    apps.push(app);
    return app.inject({
      method: 'POST',
      url: GATE_VERDICT_PATH,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as Record<string, unknown>,
    });
  }

  it('records a verdict for the version the capability names', async () => {
    const { store, calls } = recordingStore();
    const app = await serve(store);
    const res = await post(app, mintGateVerdictToken('comet-courier', 'v1', secret), {
      slug: 'comet-courier',
      version: 'v1',
      kind: 'gate',
      result: { green: true },
    });

    expect(res.statusCode).toBe(204);
    expect(calls).toEqual([{ method: 'gate', slug: 'comet-courier', version: 'v1', result: { green: true } }]);
  });

  it('refuses a verdict for a different game', async () => {
    const { store, calls } = recordingStore();
    const app = await serve(store);
    const res = await post(app, mintGateVerdictToken('comet-courier', 'v1', secret), {
      slug: 'someone-elses-game',
      version: 'v1',
      kind: 'gate',
      result: { green: true },
    });

    expect(res.statusCode).toBe(403);
    expect(calls).toEqual([]);
  });

  it('refuses a verdict for a different version of the same game', async () => {
    const { store, calls } = recordingStore();
    const app = await serve(store);
    const res = await post(app, mintGateVerdictToken('comet-courier', 'v1', secret), {
      slug: 'comet-courier',
      version: 'v2',
      kind: 'gate',
      result: { green: true },
    });

    expect(res.statusCode).toBe(403);
    expect(calls).toEqual([]);
  });

  it('refuses a health run trying to record an acceptance verdict', async () => {
    const { store, calls } = recordingStore();
    const app = await serve(store);
    const res = await post(app, mintGateVerdictToken('comet-courier', 'v1', secret, 'health'), {
      slug: 'comet-courier',
      version: 'v1',
      kind: 'gate',
      result: { green: true },
    });

    expect(res.statusCode).toBe(403);
    expect(calls).toEqual([]);
  });

  it('lets every lane report progress', async () => {
    const { store, calls } = recordingStore();
    const app = await serve(store);
    for (const lane of ['gate', 'preview', 'health'] as const) {
      const res = await post(app, mintGateVerdictToken('comet-courier', 'v1', secret, lane), {
        slug: 'comet-courier',
        version: 'v1',
        kind: 'progress',
        result: { lane },
      });
      expect(res.statusCode, lane).toBe(204);
    }
    expect(calls).toHaveLength(3);
  });

  it('refuses an unsigned request', async () => {
    const { store, calls } = recordingStore();
    const res = await post(await serve(store), null, {
      slug: 'comet-courier',
      version: 'v1',
      kind: 'gate',
      result: { green: true },
    });
    expect(res.statusCode).toBe(401);
    expect(calls).toEqual([]);
  });

  it('routes each kind to its own writer', async () => {
    const { store, calls } = recordingStore();
    const app = await serve(store);
    apps.push(app);
    for (const kind of ['gate', 'preview', 'health', 'progress'] as const) {
      const lane = kind === 'progress' ? 'gate' : kind;
      const res = await app.inject({
        method: 'POST',
        url: GATE_VERDICT_PATH,
        headers: { authorization: `Bearer ${mintGateVerdictToken('comet-courier', 'v1', secret, lane)}` },
        payload: { slug: 'comet-courier', version: 'v1', kind, result: { green: true } },
      });
      expect(res.statusCode, kind).toBe(204);
    }
    expect(calls.map((c) => c.method)).toEqual(['gate', 'preview', 'health', 'progress']);
  });

  it('is closed when no secret is configured', async () => {
    const { store } = recordingStore();
    const app = Fastify();
    registerGateVerdictRoutes(app, { store, secret: '' });
    await app.ready();
    apps.push(app);
    const res = await app.inject({
      method: 'POST',
      url: GATE_VERDICT_PATH,
      headers: { authorization: 'Bearer anything' },
      payload: { slug: 'a', version: 'b', kind: 'gate', result: {} },
    });
    expect(res.statusCode).toBe(503);
  });
});

describe('the gate-side client', () => {
  it('sends the four manifest writers and leaves the rest on the store', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const putDerivedArtifact = vi.fn(async () => {});
    const base = { putDerivedArtifact } as unknown as GamesStore;
    const store = withRemoteVerdicts(base, { endpoint: 'https://api.example/gate-verdict', token: 't', fetchImpl });

    await store.putGateResult('comet-courier', 'v1', { green: true });
    await store.putDerivedArtifact('comet-courier', 'v1', 'media/a.png', Buffer.alloc(0), 'image/png');

    expect(seen).toEqual([{ slug: 'comet-courier', version: 'v1', kind: 'gate', result: { green: true } }]);
    expect(putDerivedArtifact).toHaveBeenCalledOnce();
  });

  it('throws when the API refuses', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 403 })) as unknown as typeof fetch;
    const store = withRemoteVerdicts({} as GamesStore, {
      endpoint: 'https://api.example/gate-verdict',
      token: 't',
      fetchImpl,
    });
    await expect(store.putGateResult('a', 'b', { green: false })).rejects.toThrow(/403/);
  });
});
