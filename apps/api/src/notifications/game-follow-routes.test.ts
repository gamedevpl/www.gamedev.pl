import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../auth.js';
import { createFollowerFanout } from './game-follow-notify.js';
import { InMemoryStore } from '../store.js';

const sessionSecret = 'dev-session-secret-change-me';

function authCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

async function publish(store: InMemoryStore): Promise<void> {
  await store.setPublication({
    slug: 'neon-courier',
    state: 'published',
    currentVersion: 'v-live',
    publishedAt: '2026-08-01T12:00:00.000Z',
  });
}

describe('game follow routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(store: InMemoryStore) {
    const app = await buildApp({ store, sessionSecret });
    apps.push(app);
    return app;
  }

  it('shows the count to anyone and personal state only to a signed-in follower', async () => {
    const store = new InMemoryStore();
    await publish(store);
    await store.upsertUser({ uid: 'g:player' });
    const app = await appWith(store);

    const anonymous = await app.inject({ method: 'GET', url: '/api/games/neon-courier/follow' });
    expect(anonymous.json()).toEqual({ slug: 'neon-courier', followers: 0, following: null });

    const follow = await app.inject({
      method: 'PUT',
      url: '/api/games/neon-courier/follow',
      headers: { cookie: authCookie('g:player') },
      payload: { following: true },
    });
    expect(follow.json()).toEqual({ slug: 'neon-courier', followers: 1, following: true });

    // Following twice is not two followers.
    await app.inject({
      method: 'PUT',
      url: '/api/games/neon-courier/follow',
      headers: { cookie: authCookie('g:player') },
      payload: { following: true },
    });
    const state = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/follow',
      headers: { cookie: authCookie('g:player') },
    });
    expect(state.json()).toEqual({ slug: 'neon-courier', followers: 1, following: true });

    // The count is public; who follows is not exposed by any route.
    const stranger = await app.inject({ method: 'GET', url: '/api/games/neon-courier/follow' });
    expect(stranger.json()).toEqual({ slug: 'neon-courier', followers: 1, following: null });

    const unfollow = await app.inject({
      method: 'PUT',
      url: '/api/games/neon-courier/follow',
      headers: { cookie: authCookie('g:player') },
      payload: { following: false },
    });
    expect(unfollow.json()).toEqual({ slug: 'neon-courier', followers: 0, following: false });
  });

  it('shows the count through the private-beta wall, but still needs a session to follow', async () => {
    const store = new InMemoryStore();
    await publish(store);
    await store.upsertUser({ uid: 'g:player' });
    await store.setGameFollow('neon-courier', 'g:someone', '2026-08-01T00:00:00.000Z');
    const app = await buildApp({ store, sessionSecret, betaAllowedUids: 'g:player' });
    apps.push(app);

    // The page is public during closed beta; a count missing from it would be a
    // hole rather than a policy.
    const anonymous = await app.inject({ method: 'GET', url: '/api/games/neon-courier/follow' });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json()).toEqual({ slug: 'neon-courier', followers: 1, following: null });

    // Following is still a session action — the wall passing it does not grant it.
    const write = await app.inject({
      method: 'PUT',
      url: '/api/games/neon-courier/follow',
      payload: { following: true },
    });
    expect(write.statusCode).toBe(401);
  });

  it('refuses to follow an unpublished game, and refuses anonymously', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:player' });
    const app = await appWith(store);

    expect((await app.inject({ method: 'GET', url: '/api/games/neon-courier/follow' })).statusCode).toBe(404);

    await publish(store);
    const anonymous = await app.inject({
      method: 'PUT',
      url: '/api/games/neon-courier/follow',
      payload: { following: true },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('follower fan-out', () => {
  function fanoutStore(): InMemoryStore {
    return new InMemoryStore();
  }

  it('notifies followers once per version and skips the owner', async () => {
    const store = fanoutStore();
    for (const uid of ['g:one', 'g:two', 'g:owner']) {
      await store.upsertUser({ uid });
      await store.setGameFollow('neon-courier', uid, '2026-08-01T00:00:00.000Z');
    }

    const fanout = createFollowerFanout({ store, emitDeps: { store } });
    const first = await fanout({
      slug: 'neon-courier',
      version: 'v2',
      gameTitle: 'Neon Courier',
      ownerUid: 'g:owner',
    });

    expect(first).toMatchObject({ notified: 2, failed: 0, truncated: false });
    expect((await store.listNotifications('g:one')).map((n) => n.type)).toEqual(['game.new_version']);
    // The creator gets their own submission.published note; a second one is noise.
    expect(await store.listNotifications('g:owner')).toEqual([]);

    // Re-running the same publish (a retried click) must not notify again.
    const again = await fanout({
      slug: 'neon-courier',
      version: 'v2',
      gameTitle: 'Neon Courier',
      ownerUid: 'g:owner',
    });
    expect(again.notified).toBe(0);
    expect(await store.listNotifications('g:one')).toHaveLength(1);

    // A genuinely new version does notify.
    const next = await fanout({
      slug: 'neon-courier',
      version: 'v3',
      gameTitle: 'Neon Courier',
      ownerUid: 'g:owner',
    });
    expect(next.notified).toBe(2);
    expect(await store.listNotifications('g:one')).toHaveLength(2);
  });

  it('does not count the skipped owner as a truncation, or let them cost a slot', async () => {
    const store = fanoutStore();
    // Exactly `maxFanout` real followers, plus the owner — who is dropped, not
    // notified. Reporting `truncated` here would claim followers were missed when
    // every one of them was reached.
    await store.setGameFollow('neon-courier', 'g:owner', '2026-08-01T00:00:00.000Z');
    await store.setGameFollow('neon-courier', 'g:a', '2026-08-02T00:00:00.000Z');
    await store.setGameFollow('neon-courier', 'g:b', '2026-08-03T00:00:00.000Z');
    const errors: string[] = [];
    const fanout = createFollowerFanout({
      store,
      emitDeps: { store },
      maxFanout: 2,
      log: { error: (_context, message) => errors.push(message) },
    });

    const result = await fanout({ slug: 'neon-courier', version: 'v2', gameTitle: 'N', ownerUid: 'g:owner' });

    expect(result).toMatchObject({ notified: 2, failed: 0, truncated: false });
    expect(errors.join(' ')).not.toContain('cap');
    // Both real followers heard about it — the owner did not displace one.
    expect(await store.listNotifications('g:a')).toHaveLength(1);
    expect(await store.listNotifications('g:b')).toHaveLength(1);
    expect(await store.listNotifications('g:owner')).toEqual([]);
  });

  it('caps the fan-out and says so rather than notifying silently short', async () => {
    const store = fanoutStore();
    for (let index = 0; index < 5; index += 1) {
      await store.setGameFollow('neon-courier', `g:p${index}`, `2026-08-0${index + 1}T00:00:00.000Z`);
    }
    const errors: string[] = [];
    const fanout = createFollowerFanout({
      store,
      emitDeps: { store },
      maxFanout: 2,
      log: { error: (_context, message) => errors.push(message) },
    });

    const result = await fanout({ slug: 'neon-courier', version: 'v2', gameTitle: 'N', ownerUid: 'g:owner' });

    expect(result).toMatchObject({ notified: 2, truncated: true });
    expect(errors.join(' ')).toContain('cap');
  });

  it('keeps going when one follower cannot be notified', async () => {
    const store = fanoutStore();
    await store.setGameFollow('neon-courier', 'g:ok', '2026-08-01T00:00:00.000Z');
    await store.setGameFollow('neon-courier', 'g:bad', '2026-08-02T00:00:00.000Z');
    const failing = {
      ...store,
      createNotification: vi.fn(async (uid: string, notification: { id: string }) => {
        if (uid === 'g:bad') throw new Error('write failed');
        return store.createNotification(uid, notification as never);
      }),
      listGameFollowers: (slug: string, opts?: { limit?: number }) => store.listGameFollowers(slug, opts),
    } as unknown as InMemoryStore;

    const errors: string[] = [];
    const fanout = createFollowerFanout({
      store: failing,
      emitDeps: { store: failing },
      log: { error: (_context, message) => errors.push(message) },
    });
    const result = await fanout({ slug: 'neon-courier', version: 'v2', gameTitle: 'N', ownerUid: 'g:owner' });

    expect(result).toMatchObject({ notified: 1, failed: 1 });
    expect(errors.join(' ')).toContain('could not notify a follower');
  });
});
