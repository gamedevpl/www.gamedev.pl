import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { ContentChecker } from '../platform/moderation.js';
import { InMemoryStore } from '../platform/store.js';
import type { WorldSchema } from './world-schema.js';
import type { WorldSchemaSource } from './world-source.js';

/**
 * These routes are the first place on the platform where one player's typing reaches
 * another player's screen with nothing human in between. The tests are weighted
 * accordingly: reads are cheap to get right, so most of what follows is about writes
 * that must not land — somebody else's key, a shape the game never declared, a note the
 * moderator refused, an entry past the quota.
 */

const sessionSecret = 'dev-session-secret-change-me';

const garden: WorldSchema = {
  maxPerPlayer: 2,
  fields: {
    plant: { type: 'enum', values: ['oak', 'fern'] },
    note: { type: 'text', max: 40 },
  },
};

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function worldSource(schemas: Record<string, WorldSchema>): WorldSchemaSource {
  return { getSchema: async (slug) => schemas[slug] ?? null };
}

/** Allows everything unless the text contains "badword" — enough to prove the wiring. */
const permissiveChecker: ContentChecker = {
  check: async (text) => ({ allowed: !text.includes('badword'), category: 'harassment' as const }),
  checkFields: async (fields) => ({
    allowed: !fields.some((field) => field.includes('badword')),
    category: 'harassment' as const,
  }),
};

async function appWith(
  store: InMemoryStore,
  schemas: Record<string, WorldSchema> = { garden },
  worldRoutes: Record<string, unknown> = {},
) {
  return buildApp({
    store,
    sessionSecret,
    contentChecker: permissiveChecker,
    worldRoutes: { worlds: worldSource(schemas), ...worldRoutes },
  });
}

function plot(fields: Record<string, unknown>) {
  return { fields };
}

describe('shared world routes', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
    await store.upsertUser({ uid: 'g:bob' });
  });

  it('lets a signed-out visitor read the world', async () => {
    // Load-bearing: a world nobody can look at until they have an account looks empty
    // to exactly the visitor deciding whether it is worth having an account for.
    const app = await appWith(store);
    await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:alice'),
      payload: plot({ plant: 'oak', note: 'hello' }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/games/garden/world' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].fields).toEqual({ plant: 'oak', note: 'hello' });
    expect(body.writable).toBe(false);
    expect(body.maxPerPlayer).toBe(2);
    await app.close();
  });

  it('never exposes who wrote an entry, only whether it was you', async () => {
    const app = await appWith(store);
    await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:alice'),
      payload: plot({ plant: 'oak', note: 'mine' }),
    });

    const asBob = await app.inject({
      method: 'GET',
      url: '/api/games/garden/world',
      headers: authHeaders('g:bob'),
    });
    const entry = asBob.json().entries[0];

    expect(entry.mine).toBe(false);
    expect(entry.ownerTag).toMatch(/^[0-9a-f]{12}$/);
    // The uid is the thing that must never cross this line, in any field, at any depth.
    expect(JSON.stringify(asBob.json())).not.toContain('alice');

    const asAlice = await app.inject({
      method: 'GET',
      url: '/api/games/garden/world',
      headers: authHeaders('g:alice'),
    });
    expect(asAlice.json().entries[0].mine).toBe(true);
    expect(asAlice.json().writable).toBe(true);
    await app.close();
  });

  it('stops moderating world text once the day is spent', async () => {
    let calls = 0;
    const counting: ContentChecker = {
      check: async () => ({ allowed: true }),
      checkFields: async () => {
        calls += 1;
        return { allowed: true };
      },
    };
    const app = await buildApp({
      store,
      sessionSecret,
      contentChecker: counting,
      worldRoutes: { worlds: worldSource({ garden }), dailyWorldWriteQuota: 1 },
    });

    const write = (key: string) =>
      app.inject({
        method: 'PUT',
        url: `/api/games/garden/world/${key}`,
        headers: authHeaders('g:alice'),
        payload: plot({ plant: 'oak', note: 'mine' }),
      });

    expect((await write('plot.1')).statusCode).toBe(200);
    expect(calls).toBe(1);

    // A paid classifier per text field, reachable by any signed-in player.
    expect((await write('plot.2')).statusCode).toBe(429);
    expect(calls).toBe(1);
    await app.close();
  });

  it('answers 404 for a game with no world, rather than inventing one', async () => {
    const app = await appWith(store);
    const read = await app.inject({ method: 'GET', url: '/api/games/brick-storm/world' });
    expect(read.statusCode).toBe(404);

    const write = await app.inject({
      method: 'PUT',
      url: '/api/games/brick-storm/world/plot.1',
      headers: authHeaders('g:alice'),
      payload: plot({ plant: 'oak', note: 'hi' }),
    });
    expect(write.statusCode).toBe(404);
    await app.close();
  });

  it('needs a session to write or remove, but not to read', async () => {
    const app = await appWith(store);
    for (const method of ['PUT', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: '/api/games/garden/world/plot.1',
        payload: plot({ plant: 'oak', note: 'hi' }),
      });
      expect(response.statusCode, `${method} must require a session`).toBe(401);
    }
    expect((await app.inject({ method: 'GET', url: '/api/games/garden/world' })).statusCode).toBe(200);
    await app.close();
  });

  it('refuses a blocked account', async () => {
    await store.upsertUser({ uid: 'g:blocked', tier: 'blocked' });
    const app = await appWith(store);

    const write = await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:blocked'),
      payload: plot({ plant: 'oak', note: 'hi' }),
    });
    expect(write.statusCode).toBe(403);

    // And is told so before acting, rather than after: the read reports the world as
    // not writable, so the game can say why instead of silently dropping the action.
    const read = await app.inject({
      method: 'GET',
      url: '/api/games/garden/world',
      headers: authHeaders('g:blocked'),
    });
    expect(read.json().writable).toBe(false);
    await app.close();
  });

  it('validates every field against the declared schema', async () => {
    const app = await appWith(store);
    const bad = [
      { plant: 'triffid', note: 'hi' },
      { plant: 'oak', note: 'x'.repeat(41) },
      { plant: 'oak' },
      { plant: 'oak', note: 'hi', extra: 1 },
      { plant: 'oak', note: '   ' },
    ];
    for (const fields of bad) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/games/garden/world/plot.1',
        headers: authHeaders('g:alice'),
        payload: plot(fields),
      });
      expect(response.statusCode, JSON.stringify(fields)).toBe(400);
    }
    expect(await store.listWorldEntries('garden')).toEqual([]);
    await app.close();
  });

  it('refuses a key that could escape the world it belongs to', async () => {
    const app = await appWith(store);
    for (const key of ['..%2Fescape', 'has%20space', '.hidden'] as const) {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/games/garden/world/${key}`,
        headers: authHeaders('g:alice'),
        payload: plot({ plant: 'oak', note: 'hi' }),
      });
      expect(response.statusCode, key).toBe(400);
    }
    await app.close();
  });

  it('moderates text before it is stored, not after', async () => {
    // There is no "pending review" window for a world entry: it is on every other
    // player's screen the moment it lands, so a rejected string must never be stored.
    const app = await appWith(store);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:alice'),
      payload: plot({ plant: 'oak', note: 'a badword here' }),
    });

    expect(response.statusCode).toBe(422);
    expect(await store.listWorldEntries('garden')).toEqual([]);
    await app.close();
  });

  it('gives the first writer of a key ownership of it', async () => {
    const app = await appWith(store);
    await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:alice'),
      payload: plot({ plant: 'oak', note: 'alice was here' }),
    });

    const overwrite = await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:bob'),
      payload: plot({ plant: 'fern', note: 'bob was here' }),
    });

    expect(overwrite.statusCode).toBe(409);
    expect((await store.getWorldEntry('garden', 'plot.1'))?.fields.note).toBe('alice was here');
    await app.close();
  });

  it('lets the owner edit their own entry without spending quota', async () => {
    const app = await appWith(store);
    for (const note of ['first', 'second', 'third']) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/games/garden/world/plot.1',
        headers: authHeaders('g:alice'),
        payload: plot({ plant: 'oak', note }),
      });
      expect(response.statusCode, note).toBe(200);
    }
    expect((await store.getWorldEntry('garden', 'plot.1'))?.fields.note).toBe('third');
    expect(await store.countWorldEntries('garden', 'g:alice')).toBe(1);
    await app.close();
  });

  it('holds a player to the quota the game declared', async () => {
    // The only thing standing between a cooperative world and one person paving it.
    const app = await appWith(store);
    for (const key of ['plot.1', 'plot.2']) {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/games/garden/world/${key}`,
        headers: authHeaders('g:alice'),
        payload: plot({ plant: 'oak', note: 'hi' }),
      });
      expect(response.statusCode, key).toBe(200);
    }

    const third = await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.3',
      headers: authHeaders('g:alice'),
      payload: plot({ plant: 'oak', note: 'hi' }),
    });
    expect(third.statusCode).toBe(403);

    // Another player is unaffected — the quota is per person, not per world.
    const bob = await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.3',
      headers: authHeaders('g:bob'),
      payload: plot({ plant: 'fern', note: 'hi' }),
    });
    expect(bob.statusCode).toBe(200);
    await app.close();
  });

  it('frees quota when an entry is removed', async () => {
    const app = await appWith(store);
    for (const key of ['plot.1', 'plot.2']) {
      await app.inject({
        method: 'PUT',
        url: `/api/games/garden/world/${key}`,
        headers: authHeaders('g:alice'),
        payload: plot({ plant: 'oak', note: 'hi' }),
      });
    }
    await app.inject({ method: 'DELETE', url: '/api/games/garden/world/plot.1', headers: authHeaders('g:alice') });

    const third = await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.3',
      headers: authHeaders('g:alice'),
      payload: plot({ plant: 'oak', note: 'hi' }),
    });
    expect(third.statusCode).toBe(200);
    await app.close();
  });

  it('will not let one player delete another player’s entry', async () => {
    const app = await appWith(store);
    await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:alice'),
      payload: plot({ plant: 'oak', note: 'mine' }),
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:bob'),
    });

    // 404, not 403: "not yours" and "not there" must read identically, or the route
    // becomes a way to ask what exists in a world you cannot see.
    expect(response.statusCode).toBe(404);
    expect(await store.getWorldEntry('garden', 'plot.1')).not.toBeNull();
    await app.close();
  });

  it('lets a player take their own entry back even after the game leaves the catalog', async () => {
    const app = await appWith(store);
    await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:alice'),
      payload: plot({ plant: 'oak', note: 'mine' }),
    });

    // No schema any more — the game was unpublished. The entry is still theirs.
    const unpublished = await appWith(store, {});
    const response = await unpublished.inject({
      method: 'DELETE',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:alice'),
    });

    expect(response.statusCode).toBe(200);
    expect(await store.getWorldEntry('garden', 'plot.1')).toBeNull();
    await app.close();
    await unpublished.close();
  });
});

// A read costs the whole collection, and game code sets the cadence.
describe('shared world reads are bounded', () => {
  let store: InMemoryStore;
  let clock: number;
  const now = () => clock;

  beforeEach(async () => {
    store = new InMemoryStore();
    clock = Date.parse('2026-03-01T12:00:00.000Z');
    await store.upsertUser({ uid: 'g:alice' });
    await store.upsertUser({ uid: 'g:bob' });
  });

  async function cachingApp() {
    return buildApp({
      store,
      sessionSecret,
      contentChecker: permissiveChecker,
      worldRoutes: { worlds: worldSource({ garden }), now },
    });
  }

  async function plant(app: Awaited<ReturnType<typeof cachingApp>>, uid: string, key: string) {
    return app.inject({
      method: 'PUT',
      url: `/api/games/garden/world/${key}`,
      headers: authHeaders(uid),
      payload: plot({ plant: 'oak', note: 'hello' }),
    });
  }

  it('serves a crowd from one collection read instead of one each', async () => {
    const app = await cachingApp();
    await plant(app, 'g:alice', 'plot.1');
    const reads = vi.spyOn(store, 'listWorldEntries');

    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({ method: 'GET', url: '/api/games/garden/world' });
      expect(res.json().entries).toHaveLength(1);
    }

    expect(reads).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('reads again once the window has passed', async () => {
    const app = await cachingApp();
    await plant(app, 'g:alice', 'plot.1');
    const reads = vi.spyOn(store, 'listWorldEntries');

    await app.inject({ method: 'GET', url: '/api/games/garden/world' });
    clock += 3_000;
    await app.inject({ method: 'GET', url: '/api/games/garden/world' });

    expect(reads).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('shows a player their own write immediately, not when the window lapses', async () => {
    const app = await cachingApp();
    await app.inject({ method: 'GET', url: '/api/games/garden/world' });

    await plant(app, 'g:alice', 'plot.1');
    const res = await app.inject({ method: 'GET', url: '/api/games/garden/world' });

    expect(res.json().entries).toHaveLength(1);
    await app.close();
  });

  it('shows a delete immediately too', async () => {
    const app = await cachingApp();
    await plant(app, 'g:alice', 'plot.1');
    await app.inject({ method: 'GET', url: '/api/games/garden/world' });

    await app.inject({ method: 'DELETE', url: '/api/games/garden/world/plot.1', headers: authHeaders('g:alice') });
    const res = await app.inject({ method: 'GET', url: '/api/games/garden/world' });

    expect(res.json().entries).toHaveLength(0);
    await app.close();
  });

  it('never lets one viewer read another viewer as the owner', async () => {
    // A warm shared cache must not make Alice's plot Bob's.
    const app = await cachingApp();
    await plant(app, 'g:alice', 'plot.1');

    const mine = await app.inject({ method: 'GET', url: '/api/games/garden/world', headers: authHeaders('g:alice') });
    const theirs = await app.inject({ method: 'GET', url: '/api/games/garden/world', headers: authHeaders('g:bob') });
    const anon = await app.inject({ method: 'GET', url: '/api/games/garden/world' });

    expect(mine.json().entries[0].mine).toBe(true);
    expect(theirs.json().entries[0].mine).toBe(false);
    expect(anon.json().entries[0].mine).toBe(false);
    expect(theirs.json().writable).toBe(true);
    expect(anon.json().writable).toBe(false);
    await app.close();
  });

  it('collapses simultaneous cold reads into one collection read', async () => {
    const app = await cachingApp();
    await plant(app, 'g:alice', 'plot.1');
    const reads = vi.spyOn(store, 'listWorldEntries');

    const all = await Promise.all(
      Array.from({ length: 5 }, () => app.inject({ method: 'GET', url: '/api/games/garden/world' })),
    );

    expect(reads).toHaveBeenCalledTimes(1);
    for (const res of all) expect(res.json().entries).toHaveLength(1);
    await app.close();
  });

  it('does not let a read started before a write repopulate the old rows', async () => {
    const app = await cachingApp();
    await plant(app, 'g:alice', 'plot.1');
    const before = await store.listWorldEntries('garden');

    let release: (rows: typeof before) => void = () => {};
    const reads = vi
      .spyOn(store, 'listWorldEntries')
      .mockReturnValueOnce(new Promise((resolve) => (release = resolve)));

    // The write lands under a read holding pre-write rows.
    const stale = app.inject({ method: 'GET', url: '/api/games/garden/world' });
    await plant(app, 'g:alice', 'plot.2');
    release(before);
    expect((await stale).json().entries).toHaveLength(1);

    reads.mockRestore();
    const fresh = await app.inject({ method: 'GET', url: '/api/games/garden/world' });

    expect(fresh.json().entries).toHaveLength(2);
    await app.close();
  });

  it('rate-limits a client that reads far faster than a world changes', async () => {
    // The ceiling on one runaway game loop, not on a crowd.
    const app = await cachingApp();
    let limited: number | undefined;
    for (let attempt = 0; attempt < 61; attempt += 1) {
      const res = await app.inject({ method: 'GET', url: '/api/games/garden/world' });
      if (res.statusCode === 429) {
        limited = attempt;
        break;
      }
    }

    expect(limited).toBe(60);
    await app.close();
  });

  it('keeps the rows of one world out of another', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      contentChecker: permissiveChecker,
      worldRoutes: { worlds: worldSource({ garden, meadow: garden }), now },
    });
    await app.inject({
      method: 'PUT',
      url: '/api/games/garden/world/plot.1',
      headers: authHeaders('g:alice'),
      payload: plot({ plant: 'oak', note: 'hello' }),
    });
    await app.inject({ method: 'GET', url: '/api/games/garden/world' });

    const res = await app.inject({ method: 'GET', url: '/api/games/meadow/world' });

    expect(res.json().entries).toHaveLength(0);
    await app.close();
  });
});
