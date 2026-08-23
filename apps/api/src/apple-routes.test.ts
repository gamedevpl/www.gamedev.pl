import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppleAuthPayload, AppleAuthVerifier } from './platform/apple-auth.js';
import { registerAuthPlugin, SESSION_COOKIE_NAME, type AuthPluginOptions } from './platform/auth.js';
import { InMemoryStore } from './platform/store.js';

class MockAppleVerifier implements AppleAuthVerifier {
  constructor(private tokens: Record<string, AppleAuthPayload>) {}

  async verifyIdToken(idToken: string): Promise<AppleAuthPayload> {
    const found = this.tokens[idToken];
    if (!found) throw new Error('invalid apple authentication');
    return found;
  }
}

const APPLE_SUB = '001234.abcdef.0000';

const VERIFIED = {
  sub: APPLE_SUB,
  email: 'creator@example.com',
  emailVerified: true,
  isPrivateEmail: false,
} satisfies AppleAuthPayload;

const RELAY = {
  sub: APPLE_SUB,
  email: 'zzz@privaterelay.appleid.com',
  emailVerified: true,
  isPrivateEmail: true,
} satisfies AppleAuthPayload;

const originalClientIds = process.env.APPLE_CLIENT_IDS;

beforeEach(() => {
  delete process.env.APPLE_CLIENT_IDS;
});

afterEach(() => {
  if (originalClientIds === undefined) delete process.env.APPLE_CLIENT_IDS;
  else process.env.APPLE_CLIENT_IDS = originalClientIds;
});

async function setup(
  tokens: Record<string, AppleAuthPayload> = { 'apple-token': VERIFIED },
  extra: Partial<AuthPluginOptions> = {},
) {
  const store = new InMemoryStore();
  const app: FastifyInstance = Fastify({ logger: false });

  await registerAuthPlugin(app, {
    store,
    sessionSecret: 'test-secret-key',
    googleAuthVerifier: { verifyIdToken: async () => ({ sub: 'unused' }) },
    appleAuthVerifier: new MockAppleVerifier(tokens),
    ...extra,
  });

  return { app, store };
}

function signIn(app: FastifyInstance, payload: Record<string, unknown> = { idToken: 'apple-token' }) {
  return app.inject({ method: 'POST', url: '/api/auth/apple', payload });
}

describe('POST /api/auth/apple', () => {
  it('signs a new Apple user in and sets the session cookie', async () => {
    const { app, store } = await setup();

    const res = await signIn(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().user.uid).toBe(`a:${APPLE_SUB}`);
    expect(res.cookies.some((c) => c.name === SESSION_COOKIE_NAME)).toBe(true);
    expect((await store.getUser(`a:${APPLE_SUB}`))?.email).toBe('creator@example.com');
  });

  it('signs into the creator’s existing Google account instead of a new one', async () => {
    // The defect this prevents: an established creator taps the new button and finds an
    // empty account where their games used to be.
    const { app, store } = await setup();
    await store.upsertUser({ uid: 'g:google-sub', email: 'creator@example.com', name: 'Creator' });

    const res = await signIn(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().user.uid).toBe('g:google-sub');
    expect(res.json().user.name).toBe('Creator');
    expect(await store.getUser(`a:${APPLE_SUB}`)).toBeNull();
  });

  it('records the display name Apple sends only on the first authorization', async () => {
    const { app, store } = await setup();

    await signIn(app, { idToken: 'apple-token', name: 'Ada Lovelace' });

    expect((await store.getUser(`a:${APPLE_SUB}`))?.name).toBe('Ada Lovelace');
  });

  it('keeps the stored name when a later sign-in carries none', async () => {
    // Apple sends the name exactly once, so every subsequent sign-in arrives without it
    // and must not blank the one already recorded.
    const { app, store } = await setup();
    await signIn(app, { idToken: 'apple-token', name: 'Ada Lovelace' });

    await signIn(app);

    expect((await store.getUser(`a:${APPLE_SUB}`))?.name).toBe('Ada Lovelace');
  });

  it('never stores a Hide-My-Email relay address', async () => {
    // Storing it would overwrite a real address with a per-app forwarding alias and break
    // the notification emails the account already receives.
    const { app, store } = await setup({ 'apple-token': RELAY });

    await signIn(app);

    expect((await store.getUser(`a:${APPLE_SUB}`))?.email).toBeUndefined();
  });

  it('rejects an unverifiable token', async () => {
    const { app } = await setup();

    const res = await signIn(app, { idToken: 'garbage' });

    expect(res.statusCode).toBe(401);
  });

  it('rejects a request with no token', async () => {
    const { app } = await setup();

    expect((await signIn(app, {})).statusCode).toBe(400);
  });

  it('refuses a blocked account', async () => {
    const { app, store } = await setup();
    await store.upsertUser({ uid: `a:${APPLE_SUB}`, tier: 'blocked' });

    const res = await signIn(app);

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/blocked/);
  });

  it('answers 503 when no Services ID is configured', async () => {
    // Rather than failing deep inside token verification with a message that reads like
    // the user's fault. This is the state of every environment until the owner creates
    // the Services ID in the Apple Developer portal.
    const store = new InMemoryStore();
    const app: FastifyInstance = Fastify({ logger: false });
    await registerAuthPlugin(app, {
      store,
      sessionSecret: 'test-secret-key',
      googleAuthVerifier: { verifyIdToken: async () => ({ sub: 'unused' }) },
    });

    const res = await signIn(app);

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatch(/apple/i);
  });

  describe('private beta', () => {
    const beta = (extra: Partial<AuthPluginOptions>) => ({ privateBeta: true, ...extra });

    it('turns away an Apple user who is not on any allowlist', async () => {
      const { app } = await setup({ 'apple-token': VERIFIED }, beta({}));

      const res = await signIn(app);

      expect(res.statusCode).toBe(403);
    });

    it('leaves no account behind when it turns one away', async () => {
      // Same property the Google path has: a rejected sign-in must not write to Firestore.
      const { app, store } = await setup({ 'apple-token': VERIFIED }, beta({}));

      await signIn(app);

      expect(await store.getUser(`a:${APPLE_SUB}`)).toBeNull();
    });

    it('admits an Apple user whose email is allowlisted', async () => {
      const { app } = await setup(
        { 'apple-token': VERIFIED },
        beta({ betaAllowedEmails: new Set(['creator@example.com']) }),
      );

      expect((await signIn(app)).statusCode).toBe(200);
    });

    it('admits a creator already allowlisted by their Google uid', async () => {
      // The allowlist is checked against the *resolved* uid, so somebody already in the
      // beta is not turned away merely for arriving through a different button.
      const { app, store } = await setup(
        { 'apple-token': VERIFIED },
        beta({ betaAllowedUids: new Set(['g:google-sub']) }),
      );
      await store.upsertUser({ uid: 'g:google-sub', email: 'creator@example.com' });

      const res = await signIn(app);

      expect(res.statusCode).toBe(200);
      expect(res.json().user.uid).toBe('g:google-sub');
    });

    it('never admits on a relay address, which no allowlist can contain', async () => {
      const { app } = await setup(
        { 'apple-token': RELAY },
        beta({ betaAllowedEmails: new Set(['zzz@privaterelay.appleid.com']) }),
      );

      expect((await signIn(app)).statusCode).toBe(403);
    });
  });
});

describe('POST /api/waitlist with an Apple token', () => {
  it('accepts an Apple user turned away by the beta', async () => {
    // Without this the Apple button is a dead end for exactly the people it was added
    // for: the beta's only way in would remain a Google account.
    const { app, store } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/api/waitlist',
      payload: { idToken: 'apple-token', provider: 'apple', locale: 'pl' },
    });

    expect(res.statusCode).toBe(200);
    expect(await store.getWaitlistEntry(`a:${APPLE_SUB}`)).not.toBeNull();
  });

  it('still defaults to Google when no provider is given', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'POST', url: '/api/waitlist', payload: { idToken: 'apple-token' } });

    // The mock Google verifier accepts anything, so this proves only that the Apple
    // branch was not taken — which is the compatibility property that matters for every
    // waitlist entry made before Sign in with Apple existed.
    expect(res.json().status).toBe('ok');
  });
});
