import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { RoomRegistry } from '../realtime/mp.js';

afterEach(() => vi.unstubAllEnvs());

describe('relay-only app', () => {
  it('boots without a session key and serves only relay and probe routes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MP_RELAY_ONLY', '1');
    vi.stubEnv('SESSION_SECRET', undefined);
    vi.stubEnv('SESSION_SECRET_PREV', undefined);
    vi.stubEnv('MP_ROOM_SECRET', 'room-key');

    const app = await buildApp({
      multiplayerRoutes: {
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
});
