import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';
const AT = '2026-01-01T00:00:00.000Z';

function authCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

describe('game transfer routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
    vi.unstubAllEnvs();
  });

  async function appWith(store: InMemoryStore) {
    const app = await buildApp({ store, sessionSecret });
    apps.push(app);
    return app;
  }

  async function ownedGameWithRecipientCode() {
    vi.stubEnv('GAME_ACCESS_AUTHORITATIVE', 'true');
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.ensureGameAccess('sky', 'g:ada', AT, AT);
    const code = (await store.ensureRecipientCode('g:grace', AT))!;
    return { store, code };
  }

  it('404s every route while the flag is off', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: 'rc_whatever' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('the owner initiates a transfer by recipient code', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transfer).toMatchObject({ slug: 'sky', status: 'pending', recipientUid: 'g:grace' });
  });

  it('a non-owner cannot initiate', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    await store.upsertUser({ uid: 'g:mallory' });
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:mallory') },
      payload: { recipientCode: code },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a malformed recipient code is refused before it reaches the store', async () => {
    const { store } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: 'not/a/valid/code' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_code');
  });

  it('an unknown recipient code is refused', async () => {
    const { store } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: 'rc_does-not-exist' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_code');
  });

  it('cannot transfer to yourself', async () => {
    vi.stubEnv('GAME_ACCESS_AUTHORITATIVE', 'true');
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.ensureGameAccess('sky', 'g:ada', AT, AT);
    const code = (await store.ensureRecipientCode('g:ada', AT))!;
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('cannot_transfer_to_self');
  });

  it('a second initiation is refused while one is pending', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    const again = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(again.statusCode).toBe(409);
  });

  it('sender cancels; recipient rejects; both show up for their own inspect/incoming views', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    await store.upsertUser({ uid: 'g:stranger' });
    const app = await appWith(store);

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const incoming = await app.inject({
      method: 'GET',
      url: '/api/me/transfers/incoming',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(incoming.json().transfers).toHaveLength(1);

    const inspectBySender = await app.inject({
      method: 'GET',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(inspectBySender.json().transfer.status).toBe('pending');

    const inspectByStranger = await app.inject({
      method: 'GET',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:stranger') },
    });
    expect(inspectByStranger.json().transfer).toBeNull();

    const cancel = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer/cancel',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(cancel.json().transfer.status).toBe('cancelled');

    const cancelAgain = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer/cancel',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(cancelAgain.statusCode).toBe(404);
  });

  it('the recipient can reject a pending invitation', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const reject = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/reject',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(reject.json().transfer.status).toBe('rejected');

    const incoming = await app.inject({
      method: 'GET',
      url: '/api/me/transfers/incoming',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(incoming.json().transfers).toHaveLength(0);
  });
});
