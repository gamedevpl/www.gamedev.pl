import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InvalidSessionError,
  mintSessionToken,
  registerAuthPlugin,
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type GoogleAuthVerifier,
} from './auth.js';
import { InMemoryStore } from './store.js';

class MockGoogleVerifier implements GoogleAuthVerifier {
  constructor(private mockUsers: Record<string, { sub: string; email?: string; name?: string; picture?: string }>) {}

  async verifyIdToken(idToken: string) {
    const found = this.mockUsers[idToken];
    if (!found) {
      throw new Error('invalid google authentication');
    }
    return found;
  }
}

describe('Session Token Minting & Verification', () => {
  const secret = 'test-secret-key-1';
  const prevSecret = 'test-secret-key-old';

  it('mints and verifies a valid token', () => {
    const token = mintSessionToken('g:user1', secret, 3600);
    const verified = verifySessionToken(token, secret);
    expect(verified.uid).toBe('g:user1');
    expect(verified.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('verifies token minted with previous secret when prevSecret supplied', () => {
    const token = mintSessionToken('g:user2', prevSecret, 3600);
    const verified = verifySessionToken(token, secret, prevSecret);
    expect(verified.uid).toBe('g:user2');
  });

  it('rejects expired tokens', () => {
    const token = mintSessionToken('g:user1', secret, -10); // expired 10 seconds ago
    expect(() => verifySessionToken(token, secret)).toThrow(InvalidSessionError);
  });

  it('rejects forged/tampered tokens', () => {
    const token = mintSessionToken('g:user1', secret, 3600);
    const tampered = token.slice(0, -5) + 'xxxxx';
    expect(() => verifySessionToken(tampered, secret)).toThrow(InvalidSessionError);
  });
});

describe('Auth API Routes', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const setupTestServer = async (
    mockUsers: Record<string, { sub: string; email?: string; name?: string; picture?: string }> = {},
  ) => {
    const store = new InMemoryStore();
    const verifier = new MockGoogleVerifier(mockUsers);
    const app: FastifyInstance = Fastify({ logger: false });

    await registerAuthPlugin(app, {
      store,
      sessionSecret: 'test-secret-key',
      googleAuthVerifier: verifier,
    });

    return { app, store };
  };

  it('POST /api/auth/google signs in user and sets cookie', async () => {
    const { app, store } = await setupTestServer({
      'valid-id-token': {
        sub: '10001',
        email: 'alice@example.com',
        name: 'Alice',
        picture: 'https://example.com/alice.png',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'valid-id-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.uid).toBe('g:10001');
    expect(body.user.email).toBe('alice@example.com');

    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');

    // Verify user in store
    const stored = await store.getUser('g:10001');
    expect(stored).not.toBeNull();
    expect(stored?.name).toBe('Alice');
  });

  it('POST /api/auth/google rejects invalid token', async () => {
    const { app } = await setupTestServer();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'bad-token' },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'invalid google authentication' });
  });

  it('POST /api/auth/google rejects blocked user', async () => {
    const { app, store } = await setupTestServer({
      'blocked-token': { sub: 'blocked_user' },
    });

    await store.upsertUser({ uid: 'g:blocked_user', tier: 'blocked' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'blocked-token' },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({ error: 'account is blocked' });
  });

  it('GET /api/auth/me returns 401 when unauthenticated', async () => {
    const { app } = await setupTestServer();

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /api/auth/me returns user profile when cookie is present', async () => {
    const { app } = await setupTestServer({
      'valid-id-token': { sub: '10002', name: 'Bob' },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'valid-id-token' },
    });

    const setCookie = loginRes.headers['set-cookie'] as string;
    const cookieHeader = setCookie.split(';')[0]!;

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieHeader },
    });

    expect(meRes.statusCode).toBe(200);
    expect(JSON.parse(meRes.body).user.uid).toBe('g:10002');
  });

  it('POST /api/auth/logout clears session cookie', async () => {
    const { app } = await setupTestServer();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
  });

  it('returns 503 when authentication is unconfigured in production', async () => {
    process.env.NODE_ENV = 'production';
    const store = new InMemoryStore();
    const app = Fastify();
    await registerAuthPlugin(app, { store });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'some-token' },
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ error: 'authentication is not configured' });
  });
});
