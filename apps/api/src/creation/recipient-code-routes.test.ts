import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';

function authCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

describe('recipient code routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(store: InMemoryStore) {
    const app = await buildApp({ store, sessionSecret });
    apps.push(app);
    return app;
  }

  it('requires authentication', async () => {
    const app = await appWith(new InMemoryStore());
    const res = await app.inject({ method: 'GET', url: '/api/me/recipient-code' });
    expect(res.statusCode).toBe(401);
  });

  it('mints a code for the signed-in creator and returns the same one again', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    const app = await appWith(store);

    const first = await app.inject({
      method: 'GET',
      url: '/api/me/recipient-code',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(first.statusCode).toBe(200);
    const code = first.json().code as string;
    expect(code).toBeTruthy();

    const second = await app.inject({
      method: 'GET',
      url: '/api/me/recipient-code',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(second.json().code).toBe(code);
  });

  it('rotate mints a fresh code that no longer resolves the old one', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    const app = await appWith(store);

    const before = await app.inject({
      method: 'GET',
      url: '/api/me/recipient-code',
      headers: { cookie: authCookie('g:ada') },
    });
    const oldCode = before.json().code as string;

    const rotate = await app.inject({
      method: 'POST',
      url: '/api/me/recipient-code/rotate',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(rotate.statusCode).toBe(200);
    const newCode = rotate.json().code as string;
    expect(newCode).not.toBe(oldCode);

    expect(await store.getUserByRecipientCode(oldCode)).toBeNull();
    expect((await store.getUserByRecipientCode(newCode))?.uid).toBe('g:ada');
  });

  it('a blocked account is refused', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:blocked', tier: 'blocked' });
    const app = await appWith(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/recipient-code',
      headers: { cookie: authCookie('g:blocked') },
    });
    expect(res.statusCode).toBe(403);
  });
});
