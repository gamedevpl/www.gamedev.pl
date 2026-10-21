import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { RoomRegistry } from '../realtime/mp.js';
import type { Store } from './store.js';

afterEach(() => vi.unstubAllEnvs());

describe('relay-only app', () => {
  it.each(['environment', 'option'])('serves health without store access in %s mode', async (mode) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MP_RELAY_ONLY', mode === 'environment' ? '1' : undefined);
    vi.stubEnv('PRIVATE_BETA', mode === 'environment' ? 'false' : 'true');
    vi.stubEnv('MP_ROOM_SECRET', 'room-key');
    const accessStore = vi.fn(() => {
      throw new Error('relay has no Firestore access');
    });
    const store = new Proxy({} as Store, { get: () => accessStore });
    const app = await buildApp({
      store,
      multiplayerRoutes: {
        relayOnly: mode === 'option',
        registry: new RoomRegistry({ secret: 'room-key' }),
        internalAuth: { verify: async () => true },
      },
    });
    try {
      for (const method of ['GET', 'GET', 'HEAD'] as const) {
        const response = await app.inject({ method, url: '/api/health' });
        expect(response.statusCode).toBe(200);
        if (method === 'GET') expect(response.json()).toEqual({ status: 'ok' });
      }
      expect(accessStore).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('boots without a session key and serves only relay and probe routes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MP_RELAY_ONLY', '1');
    vi.stubEnv('SESSION_SECRET', undefined);
    vi.stubEnv('SESSION_SECRET_PREV', undefined);
    vi.stubEnv('MP_ROOM_SECRET', 'room-key');

    const app = await buildApp({
      multiplayerRoutes: {
        relayOnly: false,
        registry: new RoomRegistry({ secret: 'room-key' }),
        internalAuth: { verify: async () => true },
      },
    });
    try {
      await app.ready();
      expect(app.hasRequestDecorator('user')).toBe(false);
      expect(app.hasRoute({ method: 'GET', url: '/api/health' })).toBe(true);
      expect(app.hasRoute({ method: 'POST', url: '/api/internal/mp/sessions' })).toBe(true);
      expect(app.hasRoute({ method: 'GET', url: '/api/mp/ws' })).toBe(true);
      expect(app.hasRoute({ method: 'POST', url: '/api/csp-report' })).toBe(true);
      expect(app.hasRoute({ method: 'GET', url: '/api/auth/me' })).toBe(false);
      expect(app.hasRoute({ method: 'GET', url: '/api/me/oauth-grants' })).toBe(false);
      expect(app.hasRoute({ method: 'POST', url: '/api/mp/sessions' })).toBe(false);
      expect(app.hasRoute({ method: 'POST', url: '/api/games/:slug/zone/ticket' })).toBe(false);

      expect(app.printRoutes()).toBe(`└── (empty root node)
    ├── /
    │   └── api/
    │       ├── csp-report (POST)
    │       ├── health (GET, HEAD)
    │       ├── internal/mp/sessions (POST)
    │       └── mp/ws (GET, HEAD)
    └── * (OPTIONS)
`);

      const created = await app.inject({
        method: 'POST',
        url: '/api/internal/mp/sessions',
        payload: { slug: 'arena-tag', ownerUid: 'g:7' },
      });
      expect(created.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('honors the relay-only option without an environment flag', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MP_RELAY_ONLY', undefined);
    vi.stubEnv('SESSION_SECRET', undefined);
    vi.stubEnv('MP_ROOM_SECRET', 'room-key');

    const app = await buildApp({
      multiplayerRoutes: {
        relayOnly: true,
        registry: new RoomRegistry({ secret: 'room-key' }),
        internalAuth: { verify: async () => true },
      },
    });
    try {
      await app.ready();
      expect(app.hasRequestDecorator('user')).toBe(false);
      expect(app.hasRoute({ method: 'POST', url: '/api/internal/mp/sessions' })).toBe(true);
      expect(app.hasRoute({ method: 'GET', url: '/api/auth/me' })).toBe(false);
      expect(app.hasRoute({ method: 'POST', url: '/api/mp/sessions' })).toBe(false);
    } finally {
      await app.close();
    }
  });
});
