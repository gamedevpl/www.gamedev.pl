import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { registerMultiplayerRoutes, RoomRegistry } from './mp.js';
import { HttpRelayClient, RelayUnavailableError, isRelayOnly, relayBaseUrl } from './mp-relay.js';
import type { InternalAuthVerifier } from '../platform/internal-auth.js';

const SECRET = 'test-secret';

const allowAll: InternalAuthVerifier = { verify: async () => true };
const denyAll: InternalAuthVerifier = { verify: async () => false };

/** Signs in as a real user; the mp routes read request.user for the owner uid. */
async function buildApp(options: Parameters<typeof registerMultiplayerRoutes>[1], uid = 'g:1') {
  const app = Fastify();
  await app.register(fastifyWebsocket, { options: { maxPayload: 4 * 1024 } });
  app.addHook('onRequest', async (request) => {
    (request as { user?: { uid: string } }).user = { uid };
  });
  await registerMultiplayerRoutes(app, options);
  await app.ready();
  return app;
}

describe('relay mode selection', () => {
  it('reads the flags off env and tolerates a trailing slash', () => {
    expect(isRelayOnly({ MP_RELAY_ONLY: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isRelayOnly({ MP_RELAY_ONLY: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isRelayOnly({} as NodeJS.ProcessEnv)).toBe(false);
    expect(relayBaseUrl({ MP_RELAY_URL: 'https://mp.example.com/' } as NodeJS.ProcessEnv)).toBe(
      'https://mp.example.com',
    );
    expect(relayBaseUrl({} as NodeJS.ProcessEnv)).toBeUndefined();
  });
});

describe('single-process mode (the default, and what local dev runs)', () => {
  it('creates rooms in its own registry and serves the socket', async () => {
    const app = await buildApp({ registry: new RoomRegistry({ secret: SECRET }) });
    const response = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      payload: { slug: 'arena-tag' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().code).toMatch(/^[A-Z0-9]{6}$/);
    // `inject` cannot perform a websocket upgrade, so it answers 404 whether or not the
    // route exists — asserting on it would pass for the wrong reason. Ask the router.
    expect(app.hasRoute({ method: 'GET', url: '/api/mp/ws' })).toBe(true);
    await app.close();
  });
});

describe('app-service mode (relay split out)', () => {
  it('forwards room creation to the relay and returns what it says', async () => {
    const created = {
      code: 'ABC234',
      hostToken: 'h',
      joinToken: 'j',
      joinPath: '/join/ABC234#j',
      maxPlayers: 4,
      expiresAt: Date.now() + 1000,
    };
    const relayClient = { createRoom: vi.fn().mockResolvedValue(created) };
    const app = await buildApp({ relayClient }, 'g:42');

    const response = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      payload: { slug: 'arena-tag', maxPlayers: 6 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(created);
    // The uid must travel: it is what preserves one-open-room-per-host inside the registry,
    // which now runs in a process that has no session to read it from.
    expect(relayClient.createRoom).toHaveBeenCalledWith({
      slug: 'arena-tag',
      ownerUid: 'g:42',
      maxPlayers: 6,
    });
    await app.close();
  });

  it('does NOT serve the websocket', async () => {
    // The regression this guards is subtle and expensive: if the app service kept
    // answering /api/mp/ws after the pin was lifted, guests would be load-balanced onto
    // instances with no room — intermittently, and blamed on their wifi. That is the exact
    // failure --max-instances 1 exists to prevent.
    const app = await buildApp({ relayClient: { createRoom: vi.fn() } });
    expect(app.hasRoute({ method: 'GET', url: '/api/mp/ws' })).toBe(false);
    await app.close();
  });

  it('answers 503, not 500, when the relay is down', async () => {
    const relayClient = { createRoom: vi.fn().mockRejectedValue(new RelayUnavailableError()) };
    const app = await buildApp({ relayClient });
    const response = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      payload: { slug: 'arena-tag' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatch(/unavailable/i);
    await app.close();
  });

  it('still rejects a bad slug locally, without troubling the relay', async () => {
    const relayClient = { createRoom: vi.fn() };
    const app = await buildApp({ relayClient });
    const response = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      payload: { slug: 'Not A Slug' },
    });
    expect(response.statusCode).toBe(400);
    expect(relayClient.createRoom).not.toHaveBeenCalled();
    await app.close();
  });

  it('enforces the per-IP room limit before forwarding', async () => {
    const relayClient = {
      createRoom: vi.fn().mockResolvedValue({
        code: 'ABC234',
        hostToken: 'h',
        joinToken: 'j',
        joinPath: '/x',
        maxPlayers: 4,
        expiresAt: Date.now() + 1000,
      }),
    };
    const app = await buildApp({ relayClient, maxRoomsPerWindow: 1 });
    const payload = { slug: 'arena-tag' };
    expect((await app.inject({ method: 'POST', url: '/api/mp/sessions', payload })).statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: '/api/mp/sessions', payload });
    // Who may host is decided on the cookie-bearing origin. The relay must never become
    // the place that answers that question.
    expect(second.statusCode).toBe(429);
    expect(relayClient.createRoom).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('relay-service mode', () => {
  it('serves the internal create route and the socket, but not the public route', async () => {
    const app = await buildApp({
      registry: new RoomRegistry({ secret: SECRET }),
      relayOnly: true,
      internalAuth: allowAll,
    });

    const internal = await app.inject({
      method: 'POST',
      url: '/api/internal/mp/sessions',
      payload: { slug: 'arena-tag', ownerUid: 'g:7' },
    });
    expect(internal.statusCode).toBe(200);
    expect(internal.json().code).toMatch(/^[A-Z0-9]{6}$/);

    // The cookie never reaches this origin, so the route that trusts one must not exist.
    const publicRoute = await app.inject({
      method: 'POST',
      url: '/api/mp/sessions',
      payload: { slug: 'arena-tag' },
    });
    expect(publicRoute.statusCode).toBe(404);
    expect(app.hasRoute({ method: 'GET', url: '/api/mp/ws' })).toBe(true);
    await app.close();
  });

  it('refuses an unverified caller', async () => {
    const app = await buildApp({
      registry: new RoomRegistry({ secret: SECRET }),
      relayOnly: true,
      internalAuth: denyAll,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/mp/sessions',
      payload: { slug: 'arena-tag', ownerUid: 'g:7' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('fails closed when no verifier is configured at all', async () => {
    // A relay deployed without MP_RELAY_AUDIENCE must not be an open room factory.
    const app = await buildApp({
      registry: new RoomRegistry({ secret: SECRET }),
      relayOnly: true,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/mp/sessions',
      payload: { slug: 'arena-tag', ownerUid: 'g:7' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('requires an owner uid', async () => {
    const app = await buildApp({
      registry: new RoomRegistry({ secret: SECRET }),
      relayOnly: true,
      internalAuth: allowAll,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/mp/sessions',
      payload: { slug: 'arena-tag' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe('HttpRelayClient', () => {
  const created = {
    code: 'ABC234',
    hostToken: 'h',
    joinToken: 'j',
    joinPath: '/join/ABC234#j',
    maxPlayers: 4,
    expiresAt: 1,
  };

  it('calls the internal route with a bearer token minted for the relay URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 200 }));
    const authTokenFor = vi.fn().mockResolvedValue('oidc-token');
    const client = new HttpRelayClient({
      baseUrl: 'https://mp.example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      authTokenFor,
    });

    expect(await client.createRoom({ slug: 'arena-tag', ownerUid: 'g:1' })).toEqual(created);
    // Audience is the callee's URL, so a token lifted from this call cannot be replayed
    // against the sweep endpoints — the property internal-auth.ts is built around.
    expect(authTokenFor).toHaveBeenCalledWith('https://mp.example.com');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mp.example.com/api/internal/mp/sessions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer oidc-token');
  });

  it('turns a non-2xx into RelayUnavailableError', async () => {
    const client = new HttpRelayClient({
      baseUrl: 'https://mp.example.com',
      fetchImpl: vi.fn().mockResolvedValue(new Response('nope', { status: 500 })) as unknown as typeof fetch,
      authTokenFor: async () => 'tok',
    });
    await expect(client.createRoom({ slug: 'arena-tag', ownerUid: 'g:1' })).rejects.toBeInstanceOf(
      RelayUnavailableError,
    );
  });

  it('turns a network failure into RelayUnavailableError rather than leaking it', async () => {
    const client = new HttpRelayClient({
      baseUrl: 'https://mp.example.com',
      fetchImpl: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch,
      authTokenFor: async () => 'tok',
    });
    await expect(client.createRoom({ slug: 'arena-tag', ownerUid: 'g:1' })).rejects.toBeInstanceOf(
      RelayUnavailableError,
    );
  });

  it('omits the header when no token could be minted, so the relay decides', async () => {
    // Locally there is no metadata server. The call must go out unauthenticated and be
    // refused by the relay's verifier — never silently treated as authorized here.
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 200 }));
    const client = new HttpRelayClient({
      baseUrl: 'https://mp.example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      authTokenFor: async () => undefined,
    });
    await client.createRoom({ slug: 'arena-tag', ownerUid: 'g:1' });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });
});
