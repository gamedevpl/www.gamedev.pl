import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InvalidSessionError,
  mintSessionToken,
  registerAuthPlugin,
  SESSION_COOKIE_NAME,
  readSessionToken,
  type GoogleAuthVerifier,
} from './auth.js';
import { InMemoryStore } from './store.js';

class MockGoogleVerifier implements GoogleAuthVerifier {
  constructor(
    private mockUsers: Record<
      string,
      { sub: string; email?: string; emailVerified?: boolean; name?: string; picture?: string }
    >,
  ) {}

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
    const verified = readSessionToken(token, secret);
    expect(verified.uid).toBe('g:user1');
    expect(verified.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('verifies token minted with previous secret when prevSecret supplied', () => {
    const token = mintSessionToken('g:user2', prevSecret, 3600);
    const verified = readSessionToken(token, secret, prevSecret);
    expect(verified.uid).toBe('g:user2');
  });

  it('rejects expired tokens', () => {
    const token = mintSessionToken('g:user1', secret, -10); // expired 10 seconds ago
    expect(() => readSessionToken(token, secret)).toThrow(InvalidSessionError);
  });

  it('rejects forged/tampered tokens', () => {
    const token = mintSessionToken('g:user1', secret, 3600);
    const tampered = token.slice(0, -5) + 'xxxxx';
    expect(() => readSessionToken(tampered, secret)).toThrow(InvalidSessionError);
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

describe('POST /api/waitlist', () => {
  const setupTestServer = async (
    mockUsers: Record<
      string,
      { sub: string; email?: string; emailVerified?: boolean; name?: string; picture?: string }
    > = {},
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

  it('works without a session, verifying the token server-side and storing the entry', async () => {
    const { app, store } = await setupTestServer({
      'rejected-token': { sub: '20001', email: 'waiter@example.com', emailVerified: true, name: 'Waiter' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/waitlist',
      payload: { idToken: 'rejected-token', locale: 'en' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok', waitlistStatus: 'pending' });

    const entries = store.waitlistEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      uid: 'g:20001',
      email: 'waiter@example.com',
      name: 'Waiter',
      locale: 'en',
    });

    // Never wrote a users/ doc — the caller was never signed in.
    expect(await store.getUser('g:20001')).toBeNull();
  });

  it('is idempotent — joining twice keeps a single entry and only bumps requestedAt', async () => {
    const { app, store } = await setupTestServer({
      'rejected-token': { sub: '20002', email: 'waiter2@example.com', emailVerified: true },
    });

    await app.inject({ method: 'POST', url: '/api/waitlist', payload: { idToken: 'rejected-token' } });
    const firstRequestedAt = store.waitlistEntries()[0]!.requestedAt;

    await app.inject({ method: 'POST', url: '/api/waitlist', payload: { idToken: 'rejected-token' } });
    const entries = store.waitlistEntries();

    expect(entries).toHaveLength(1);
    expect(new Date(entries[0]!.requestedAt).getTime()).toBeGreaterThanOrEqual(new Date(firstRequestedAt).getTime());
  });

  it('never stores an unverified email', async () => {
    const { app, store } = await setupTestServer({
      'unverified-token': { sub: '20003', email: 'unverified@example.com', emailVerified: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/waitlist',
      payload: { idToken: 'unverified-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(store.waitlistEntries()[0]).toMatchObject({ uid: 'g:20003', email: undefined });
  });

  it('rejects an invalid/forged token, storing nothing', async () => {
    const { app, store } = await setupTestServer();

    const res = await app.inject({
      method: 'POST',
      url: '/api/waitlist',
      payload: { idToken: 'bad-token' },
    });

    expect(res.statusCode).toBe(401);
    expect(store.waitlistEntries()).toHaveLength(0);
  });

  it('returns 400 for a missing/empty body', async () => {
    const { app } = await setupTestServer();

    const res = await app.inject({ method: 'POST', url: '/api/waitlist' });

    expect(res.statusCode).toBe(400);
  });
});

describe('beta rejection includes waitlistStatus', () => {
  it('403 on beta rejection includes waitlistStatus when the user is on the waitlist', async () => {
    const store = new InMemoryStore();
    const verifier = new MockGoogleVerifier({
      'beta-token': { sub: '30001', email: 'outsider@example.com', emailVerified: true },
    });
    const app: FastifyInstance = Fastify({ logger: false });

    await registerAuthPlugin(app, {
      store,
      sessionSecret: 'test-secret-key',
      googleAuthVerifier: verifier,
      privateBeta: true,
      betaAllowedEmails: new Set(['insider@example.com']),
    });

    // First, join the waitlist
    await app.inject({
      method: 'POST',
      url: '/api/waitlist',
      payload: { idToken: 'beta-token' },
    });

    // Now attempt sign-in — should 403 with waitlistStatus
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'beta-token' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as { error: string; waitlistStatus: string | null };
    expect(body.error).toBe('private beta \u2014 sign-ups are closed');
    expect(body.waitlistStatus).toBe('pending');
  });

  it('403 on beta rejection returns null waitlistStatus when user is not on the waitlist', async () => {
    const store = new InMemoryStore();
    const verifier = new MockGoogleVerifier({
      'beta-token': { sub: '30002', email: 'newbie@example.com', emailVerified: true },
    });
    const app: FastifyInstance = Fastify({ logger: false });

    await registerAuthPlugin(app, {
      store,
      sessionSecret: 'test-secret-key',
      googleAuthVerifier: verifier,
      privateBeta: true,
      betaAllowedEmails: new Set(['insider@example.com']),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'beta-token' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as { error: string; waitlistStatus: string | null };
    expect(body.waitlistStatus).toBeNull();
  });

  it('allows sign-in in private-beta mode when user waitlist entry is approved in store', async () => {
    const store = new InMemoryStore();
    await store.upsertWaitlistEntry({ uid: 'g:30003', email: 'approved-waitlist@example.com' });
    await store.setWaitlistStatus('g:30003', 'approved');

    const verifier = new MockGoogleVerifier({
      'beta-token': { sub: '30003', email: 'approved-waitlist@example.com', emailVerified: true },
    });
    const app: FastifyInstance = Fastify({ logger: false });

    await registerAuthPlugin(app, {
      store,
      sessionSecret: 'test-secret-key',
      googleAuthVerifier: verifier,
      privateBeta: true,
      // Note: betaAllowedEmails and betaAllowedUids do NOT contain this user!
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'beta-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

describe('Local development sign-in', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const setupServer = async () => {
    const store = new InMemoryStore();
    const app: FastifyInstance = Fastify({ logger: false });
    await registerAuthPlugin(app, { store, sessionSecret: 'test-secret-key' });
    return { app, store };
  };

  it('mints a session for a synthetic account outside production', async () => {
    const { app, store } = await setupServer();

    const res = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: {} });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.uid).toBe('dev:local');
    expect(res.headers['set-cookie']).toBeDefined();
    // The uid namespace keeps a local account from ever colliding with a Google identity.
    expect(await store.getUser('dev:local')).not.toBeNull();

    await app.close();
  });

  it('is invisible in production', async () => {
    process.env.NODE_ENV = 'production';
    const { app } = await setupServer();

    const res = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: {} });

    expect(res.statusCode).toBe(404);
    expect(res.headers['set-cookie']).toBeUndefined();

    await app.close();
  });

  it('rejects a malformed handle rather than minting an odd uid', async () => {
    const { app } = await setupServer();

    const res = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { uid: 'Not A Handle!' } });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
