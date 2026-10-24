import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { pickWelcomeRecipients } from './notifications/beta-welcome-email.js';
import type { AppleAuthPayload } from './platform/apple-auth.js';
import { registerAuthPlugin } from './platform/auth.js';
import { InMemoryStore } from './platform/store.js';

const UID = 'a:apple-contact';
const EMAIL = 'beta@privaterelay.appleid.com';
const PAYLOAD: AppleAuthPayload = {
  sub: 'apple-contact',
  email: EMAIL,
  emailVerified: true,
  isPrivateEmail: true,
};
const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup(overrides: Partial<AppleAuthPayload> = {}) {
  const store = new InMemoryStore();
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerAuthPlugin(app, {
    store,
    sessionSecret: 'test-secret-key',
    privateBeta: true,
    adminUids: new Set(['g:operator']),
    googleAuthVerifier: { verifyIdToken: async () => ({ sub: 'unused' }) },
    appleAuthVerifier: { verifyIdToken: async () => ({ ...PAYLOAD, ...overrides }) },
  });
  const join = () =>
    app.inject({
      method: 'POST',
      url: '/api/waitlist',
      payload: { idToken: 'apple-token', provider: 'apple', locale: 'pl' },
    });
  const signIn = (extra: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: '/api/auth/apple', payload: { idToken: 'apple-token', ...extra } });
  return { app, store, join, signIn };
}

describe('Apple waitlist contact', () => {
  it('keeps a relay applicant reachable through approval and later sign-ins', async () => {
    const { store, join, signIn } = await setup();
    expect((await signIn()).statusCode).toBe(403);
    expect((await join()).statusCode).toBe(200);

    const entry = await store.getWaitlistEntry(UID);
    expect(entry).toMatchObject({ uid: UID, email: EMAIL, status: 'pending', locale: 'pl' });
    expect(await store.listNotifications('g:operator')).toEqual([
      expect.objectContaining({ params: { title: EMAIL, email: EMAIL } }),
    ]);
    expect(pickWelcomeRecipients([{ ...entry!, email: entry!.email! }], { statuses: new Set(['pending']) })).toEqual([
      expect.objectContaining({ uid: UID, email: EMAIL }),
    ]);

    await store.setWaitlistStatus(UID, 'approved');
    expect((await signIn()).statusCode).toBe(200);
    expect((await store.getUser(UID))?.email).toBe(EMAIL);
    expect((await signIn()).statusCode).toBe(200);
  });

  it('repairs a missing contact when an applicant joins again', async () => {
    const { store, join } = await setup();
    await store.upsertWaitlistEntry({ uid: UID });
    await store.setWaitlistStatus(UID, 'approved');
    expect((await join()).statusCode).toBe(200);
    expect(await store.getWaitlistEntry(UID)).toMatchObject({ email: EMAIL, status: 'approved' });
  });

  it.each([{ emailVerified: false }, { email: undefined }, { email: '   ' }])(
    'does not store an unusable contact: %j',
    async (overrides) => {
      const { store, join } = await setup(overrides);
      expect((await join()).statusCode).toBe(200);
      expect((await store.getWaitlistEntry(UID))?.email).toBeUndefined();
    },
  );

  it('preserves the contact of an explicitly linked account', async () => {
    const { store, join, signIn } = await setup();
    await store.upsertUser({ uid: 'g:linked', email: 'creator@example.com' });
    await store.setAppleSub('g:linked', PAYLOAD.sub);
    expect((await join()).statusCode).toBe(200);
    expect(await store.getWaitlistEntry('g:linked')).toMatchObject({ email: 'creator@example.com' });
    await store.setWaitlistStatus('g:linked', 'approved');
    expect((await signIn()).statusCode).toBe(200);
    expect((await store.getUser('g:linked'))?.email).toBe('creator@example.com');
  });

  it('records the relay contact when joining through an invite', async () => {
    const { store, signIn } = await setup();
    const invite = await store.createBetaInvite('g:operator');
    expect((await signIn({ inviteCode: invite.code })).statusCode).toBe(200);
    expect(await store.getWaitlistEntry(UID)).toMatchObject({ email: EMAIL, status: 'approved' });
  });
});
