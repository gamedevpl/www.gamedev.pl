import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_DURATION_SECONDS,
  InvalidSessionError,
  LEGACY_SESSION_COOKIE_NAME,
  mintSessionToken,
  registerAuthPlugin,
  SESSION_COOKIE_NAME,
  TOKEN_SESSION_DURATION_SECONDS,
  readSessionToken,
  sessionDurationSeconds,
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
    adminUids?: Set<string>,
    privateBeta = false,
  ) => {
    const store = new InMemoryStore();
    const verifier = new MockGoogleVerifier(mockUsers);
    const app: FastifyInstance = Fastify({ logger: false });

    await registerAuthPlugin(app, {
      store,
      sessionSecret: 'test-secret-key',
      googleAuthVerifier: verifier,
      ...(adminUids ? { adminUids } : {}),
      ...(privateBeta
        ? { privateBeta: true, betaAllowedUids: new Set<string>(), betaAllowedEmails: new Set<string>() }
        : {}),
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

  it('marks only a newly created account for the beta welcome', async () => {
    const { app } = await setupTestServer({
      'new-user-token': { sub: '10006', email: 'new@example.com' },
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'new-user-token' },
    });
    expect(JSON.parse(first.body).betaWelcome).toBe(true);

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'new-user-token' },
    });
    expect(JSON.parse(second.body).betaWelcome).toBeUndefined();
  });

  it('records the browser language on sign-in, so agent-created games can inherit it', async () => {
    // The only place this preference survives leaving the browser. A game created over
    // MCP has no accept-language — Claude chat is not a browser — so without this
    // create_game had nothing to fall back on and pinned every self-build game to
    // English regardless of who owned it.
    const { app, store } = await setupTestServer({
      'valid-id-token': { sub: '10009', email: 'ola@example.com', name: 'Ola' },
    });

    await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      headers: { 'accept-language': 'pl-PL,pl;q=0.9,en;q=0.8' },
      payload: { idToken: 'valid-id-token' },
    });

    expect((await store.getUser('g:10009'))?.locale).toBe('pl');
  });

  it('leaves a stored language alone when the client sends no accept-language', async () => {
    // Absent must stay distinct from 'en': an API client with no header should not
    // overwrite a preference the browser recorded.
    const { app, store } = await setupTestServer({
      'valid-id-token': { sub: '10010', email: 'ola@example.com', name: 'Ola' },
    });

    await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      headers: { 'accept-language': 'pl-PL,pl;q=0.9' },
      payload: { idToken: 'valid-id-token' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'valid-id-token' },
    });

    expect((await store.getUser('g:10010'))?.locale).toBe('pl');
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

  it('accepts a beta invite once and binds it to the first account', async () => {
    const { app, store } = await setupTestServer(
      {
        'first-token': { sub: '10011', email: 'first@example.com', emailVerified: true },
        'second-token': { sub: '10012', email: 'second@example.com', emailVerified: true },
      },
      undefined,
      true,
    );
    const created = await store.createBetaInvite('g:operator');

    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'first-token', inviteCode: created.code },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'second-token', inviteCode: created.code },
    });
    expect(second.statusCode).toBe(403);
    expect(JSON.parse(second.body).error).toBe('beta invite is invalid or already used');

    const invites = await store.listBetaInvites();
    expect(invites[0]).toMatchObject({ status: 'claimed', claimedUid: 'g:10011' });
    expect(invites[0]).not.toHaveProperty('code');
  });

  it('records an invite claim as closed-beta membership', async () => {
    // No row: invisible in the console, locked out when sessions lapse.
    const { app, store } = await setupTestServer(
      {
        'invited-token': { sub: '10013', email: 'Invited@Example.com', emailVerified: true, name: 'Invited' },
      },
      undefined,
      true,
    );
    const created = await store.createBetaInvite('g:operator');

    const claimed = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'invited-token', inviteCode: created.code },
    });
    expect(claimed.statusCode).toBe(200);

    expect(await store.getWaitlistEntry('g:10013')).toMatchObject({
      uid: 'g:10013',
      email: 'invited@example.com',
      name: 'Invited',
      status: 'approved',
    });
    expect(await store.listWaitlistEntries({ status: 'approved' })).toHaveLength(1);

    // Membership is what lets them back in without the link.
    const returning = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'invited-token' },
    });
    expect(returning.statusCode).toBe(200);
  });

  it('does not record membership for an invite that was not claimed', async () => {
    const { app, store } = await setupTestServer(
      {
        'first-token': { sub: '10014', email: 'first@example.com', emailVerified: true },
        'second-token': { sub: '10015', email: 'second@example.com', emailVerified: true },
      },
      undefined,
      true,
    );
    const created = await store.createBetaInvite('g:operator');

    await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'first-token', inviteCode: created.code },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'second-token', inviteCode: created.code },
    });

    expect(await store.getWaitlistEntry('g:10015')).toBeNull();
  });

  it('keeps requestedAt when an invite is claimed by someone already on the waitlist', async () => {
    // Accepting an invite should not rewrite how long they had been waiting.
    const { app, store } = await setupTestServer(
      {
        'waiting-token': { sub: '10016', email: 'waiting@example.com', emailVerified: true },
      },
      undefined,
      true,
    );
    await store.upsertWaitlistEntry({ uid: 'g:10016', email: 'waiting@example.com' });
    const joinedAt = (await store.getWaitlistEntry('g:10016'))!.requestedAt;
    const created = await store.createBetaInvite('g:operator');

    await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'waiting-token', inviteCode: created.code },
    });

    expect(await store.getWaitlistEntry('g:10016')).toMatchObject({ status: 'approved', requestedAt: joinedAt });
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

  // FH-01's whole point: an old cookie must survive and come back renamed.
  it('authenticates a pre-rename cookie and re-mints it under the new name', async () => {
    const { app, store } = await setupTestServer();
    await store.upsertUser({ uid: 'g:10009', email: 'legacy@example.com' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        // Long-lived on purpose: proves the re-mint follows the name, not the expiry.
        cookie: `${LEGACY_SESSION_COOKIE_NAME}=${mintSessionToken('g:10009', 'test-secret-key', DEFAULT_SESSION_DURATION_SECONDS)}`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.uid).toBe('g:10009');

    const setCookie = [res.headers['set-cookie'] ?? []].flat().join('\n');
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    // Retired in the same response, or the browser keeps sending a stripped name.
    expect(setCookie).toContain(`${LEGACY_SESSION_COOKIE_NAME}=;`);
  });

  it('prefers the new cookie when a browser carries both', async () => {
    const { app, store } = await setupTestServer();
    await store.upsertUser({ uid: 'g:10010', email: 'current@example.com' });
    await store.upsertUser({ uid: 'g:10011', email: 'stale@example.com' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: [
          `${SESSION_COOKIE_NAME}=${mintSessionToken('g:10010', 'test-secret-key')}`,
          `${LEGACY_SESSION_COOKIE_NAME}=${mintSessionToken('g:10011', 'test-secret-key')}`,
        ].join('; '),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.uid).toBe('g:10010');
  });

  it('blocks old credentials while deletion is pending and restores the account on sign-in', async () => {
    const { app, store } = await setupTestServer({
      'restore-token': { sub: '10005', email: 'restore@example.com' },
    });
    await store.upsertUser({ uid: 'g:10005', email: 'restore@example.com' });
    await store.scheduleAccountDeletion('g:10005', '2026-08-04T00:00:00.000Z', '2026-08-18T00:00:00.000Z');

    const stale = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:10005', 'test-secret-key')}` },
    });
    expect(stale.statusCode).toBe(401);

    const restored = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'restore-token' },
    });
    expect(restored.statusCode).toBe(200);
    expect((await store.getUser('g:10005'))?.deletionScheduledFor).toBeUndefined();
  });

  it('tells an operator’s session that it is one, and says nothing to anyone else', async () => {
    // The client draws the console link from this rather than from probing an operator
    // endpoint and reading its 404 as "no" — that probe put an error in every
    // non-operator's console on every page load.
    const { app } = await setupTestServer({ 'boss-token': { sub: '10003' } }, new Set(['g:10003']));

    const bossLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'boss-token' },
    });
    expect(JSON.parse(bossLogin.body).user.admin).toBe(true);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: (bossLogin.headers['set-cookie'] as string).split(';')[0]! },
    });
    expect(JSON.parse(meRes.body).user.admin).toBe(true);
  });

  it('leaves the flag off a session that is not an operator’s', async () => {
    // Absent rather than false: a client that has never heard of the flag is
    // unaffected, and nothing can read `admin: false` as a claim about anything else.
    const { app } = await setupTestServer({ 'player-token': { sub: '10004' } }, new Set(['g:10003']));

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'player-token' },
    });

    expect(JSON.parse(login.body).user).not.toHaveProperty('admin');
  });

  it('POST /api/auth/logout clears session cookie', async () => {
    const { app } = await setupTestServer();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(res.statusCode).toBe(200);
    // Both names: the pre-FH-01 cookie still authenticates through the read fallback.
    const setCookie = [res.headers['set-cookie'] ?? []].flat().join('\n');
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain(`${LEGACY_SESSION_COOKIE_NAME}=;`);
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
    adminUids?: Set<string>,
  ) => {
    const store = new InMemoryStore();
    const verifier = new MockGoogleVerifier(mockUsers);
    const app: FastifyInstance = Fastify({ logger: false });

    await registerAuthPlugin(app, {
      store,
      sessionSecret: 'test-secret-key',
      googleAuthVerifier: verifier,
      ...(adminUids ? { adminUids } : {}),
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

  it('notifies operators when someone joins, once per applicant', async () => {
    const { app, store } = await setupTestServer(
      {
        'rejected-token': { sub: '20010', email: 'newbie@example.com', emailVerified: true, name: 'Newbie' },
      },
      new Set(['g:boss']),
    );
    await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com', tier: 'trusted' });

    const first = await app.inject({
      method: 'POST',
      url: '/api/waitlist',
      payload: { idToken: 'rejected-token' },
    });
    expect(first.statusCode).toBe(200);

    const notes = await store.listNotifications('g:boss');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id: 'op-waitlist-g:20010',
      type: 'operator.waitlist_joined',
      link: '/admin/waitlist',
      params: { title: 'Newbie', email: 'newbie@example.com' },
    });

    const second = await app.inject({
      method: 'POST',
      url: '/api/waitlist',
      payload: { idToken: 'rejected-token' },
    });
    expect(second.statusCode).toBe(200);
    expect(await store.listNotifications('g:boss')).toHaveLength(1);
  });

  it('still joins when no operators are configured', async () => {
    const { app, store } = await setupTestServer({
      'rejected-token': { sub: '20011', email: 'solo@example.com', emailVerified: true },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/waitlist',
      payload: { idToken: 'rejected-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(store.waitlistEntries()).toHaveLength(1);
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
    expect(JSON.parse(res.body).betaWelcome).toBe(true);
    expect(res.headers['set-cookie']).toBeDefined();
    // The uid namespace keeps a local account from ever colliding with a Google identity.
    expect(await store.getUser('dev:local')).not.toBeNull();

    const second = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: {} });
    expect(JSON.parse(second.body).betaWelcome).toBeUndefined();

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

describe('Session lifetime', () => {
  const setupServer = async () => {
    const store = new InMemoryStore();
    const app: FastifyInstance = Fastify({ logger: false });
    await registerAuthPlugin(app, {
      store,
      sessionSecret: 'test-secret-key',
      googleAuthVerifier: new MockGoogleVerifier({ 'gap-token': { sub: '20001' } }),
    });
    const login = await app.inject({ method: 'POST', url: '/api/auth/google', payload: { idToken: 'gap-token' } });
    return { app, store, uid: 'g:20001', loginCookie: login.headers['set-cookie'] as string };
  };

  const meWith = (app: FastifyInstance, token: string) =>
    app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });

  const agedToken = (uid: string, ageSeconds: number, source?: 'token') =>
    mintSessionToken(
      uid,
      'test-secret-key',
      sessionDurationSeconds(source),
      Math.floor(Date.now() / 1000) - ageSeconds,
      source,
    );

  it('signs a person in for 30 days, not for an afternoon', async () => {
    // The regression this fixes: 12h expired between ordinary visits.
    const { app, loginCookie } = await setupServer();

    expect(loginCookie).toContain(`Max-Age=${DEFAULT_SESSION_DURATION_SECONDS}`);
    expect(DEFAULT_SESSION_DURATION_SECONDS).toBe(30 * 24 * 60 * 60);

    await app.close();
  });

  it('still knows a session that went five days untouched', async () => {
    const { app, uid } = await setupServer();

    const res = await meWith(app, agedToken(uid, 5 * 24 * 60 * 60));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.uid).toBe(uid);
    // Nowhere near half spent, so nothing to reissue.
    expect(res.headers['set-cookie']).toBeUndefined();

    await app.close();
  });

  it('slides the expiry once the session is past half its life', async () => {
    const { app, uid } = await setupServer();

    const res = await meWith(app, agedToken(uid, 20 * 24 * 60 * 60));

    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie'] as string).toContain(`Max-Age=${DEFAULT_SESSION_DURATION_SECONDS}`);

    await app.close();
  });

  it('keeps a token-derived cookie on the short 12h clock, renewal included', async () => {
    // Renewal must not promote a token cookie to a month.
    const { app, uid } = await setupServer();

    const res = await meWith(app, agedToken(uid, 7 * 60 * 60, 'token'));

    expect(res.statusCode).toBe(200);
    const renewed = res.headers['set-cookie'] as string;
    expect(renewed).toContain(`Max-Age=${TOKEN_SESSION_DURATION_SECONDS}`);
    expect(readSessionToken(renewed.split(';')[0]!.split('=')[1]!, 'test-secret-key').src).toBe('token');

    await app.close();
  });
});
