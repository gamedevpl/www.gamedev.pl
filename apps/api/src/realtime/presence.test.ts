import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { MAX_PRESENT_PER_WORLD, PRESENCE_TTL_MS, PresenceRegistry } from './presence.js';
import { InMemoryStore } from '../platform/store.js';
import type { WorldSchema } from './world-schema.js';
import type { WorldSchemaSource } from './world-source.js';

/**
 * Presence is the only feature here that reports something about a person *while they
 * are still there*, so the tests are weighted toward what it must never say rather than
 * what it says. Three things carry the feature's whole privacy story and each one has a
 * test that fails loudly if somebody removes it:
 *
 *   - no uid reaches another player, in any field, ever;
 *   - a presence tag is never the same value as a world entry's `ownerTag`, because
 *     equal tags would tell a player which stranger around them planted which thing;
 *   - a slot disappears on its own, so there is never anything to erase.
 *
 * The rest is about the count being honest: somebody who stopped playing must stop being
 * counted, and a crowded world must not report a number it trimmed out of the payload.
 */

const sessionSecret = 'dev-session-secret-change-me';

const green: WorldSchema = {
  maxPerPlayer: 2,
  presence: { cols: 15, rows: 9 },
  fields: { plant: { type: 'enum', values: ['oak', 'fern'] } },
};

/** A world with entries but no roster — the ordinary P2 world, unchanged by P2.5. */
const quietWorld: WorldSchema = {
  maxPerPlayer: 2,
  presence: null,
  fields: { plant: { type: 'enum', values: ['oak', 'fern'] } },
};

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function worldSource(schemas: Record<string, WorldSchema>): WorldSchemaSource {
  return { getSchema: async (slug) => schemas[slug] ?? null };
}

async function appWith(store: InMemoryStore, schemas: Record<string, WorldSchema> = { green, quiet: quietWorld }) {
  return buildApp({
    store,
    sessionSecret,
    worldRoutes: { worlds: worldSource(schemas) },
    presenceRoutes: { worlds: worldSource(schemas) },
  });
}

describe('presence routes', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
    await store.upsertUser({ uid: 'g:bob' });
  });

  it('404s for a world that declares no presence', async () => {
    // A world with entries has not thereby agreed to announce who is standing in it.
    const app = await appWith(store);
    const response = await app.inject({ method: 'GET', url: '/api/games/quiet/presence' });
    expect(response.statusCode).toBe(404);
  });

  it('404s for a game with no world at all', async () => {
    const app = await appWith(store);
    const response = await app.inject({ method: 'GET', url: '/api/games/nothing/presence' });
    expect(response.statusCode).toBe(404);
  });

  it('lets a signed-out visitor read the roster', async () => {
    // The P2 lesson: a count nobody may look at until they sign in shows an empty world
    // to exactly the visitor deciding whether an account is worth having.
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:alice'),
      payload: { col: 3, row: 4 },
    });

    const response = await app.inject({ method: 'GET', url: '/api/games/green/presence' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.count).toBe(1);
    expect(body.peers).toHaveLength(1);
    expect(body.visible).toBe(false);
  });

  it('refuses a heartbeat from a signed-out visitor', async () => {
    const app = await appWith(store);
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      payload: { col: 1, row: 1 },
    });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a heartbeat from a blocked account', async () => {
    await store.upsertUser({ uid: 'g:mallory', tier: 'blocked' });
    const app = await appWith(store);
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:mallory'),
      payload: { col: 1, row: 1 },
    });
    expect(response.statusCode).toBe(403);
  });

  it('never reports a uid, in any field, to anyone', async () => {
    // The single most important assertion in this file. Serialised and searched rather
    // than field-by-field, so a uid smuggled into a shape nobody thought of still fails.
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:alice'),
      payload: { col: 3, row: 4 },
    });

    const seenByBob = await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:bob'),
      payload: { col: 1, row: 1 },
    });

    expect(seenByBob.body).not.toContain('alice');
    expect(seenByBob.body).not.toContain('g:');
    expect(await (await app.inject({ method: 'GET', url: '/api/games/green/presence' })).body).not.toContain('alice');
  });

  it('does not reuse the world ownerTag, so a wanderer cannot be linked to a planting', async () => {
    // Equal tags would tell a player that the person standing over there is the one who
    // planted this — where a real person is, right now, tied to what they have built.
    const app = await appWith(store);
    await app.inject({
      method: 'PUT',
      url: '/api/games/green/world/tile.3.4',
      headers: authHeaders('g:alice'),
      payload: { fields: { plant: 'oak' } },
    });
    await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:alice'),
      payload: { col: 3, row: 4 },
    });

    const world = (await app.inject({ method: 'GET', url: '/api/games/green/world' })).json();
    const roster = (await app.inject({ method: 'GET', url: '/api/games/green/presence' })).json();

    expect(world.entries[0].ownerTag).toBeTruthy();
    expect(roster.peers[0].tag).toBeTruthy();
    expect(roster.peers[0].tag).not.toBe(world.entries[0].ownerTag);
  });

  it('counts a player once however many tabs they open', async () => {
    // A slot is keyed by uid, so there is no anonymous token anybody can mint more of.
    const app = await appWith(store);
    for (let tab = 0; tab < 5; tab++) {
      await app.inject({
        method: 'POST',
        url: '/api/games/green/presence',
        headers: authHeaders('g:alice'),
        payload: { col: tab, row: 1 },
      });
    }
    const roster = (await app.inject({ method: 'GET', url: '/api/games/green/presence' })).json();
    expect(roster.count).toBe(1);
  });

  it('excludes the asking player from peers but not from the count', async () => {
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:bob'),
      payload: { col: 9, row: 2 },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:alice'),
      payload: { col: 3, row: 4 },
    });

    const body = response.json();
    expect(body.count).toBe(2);
    expect(body.peers).toHaveLength(1);
    expect(body.peers[0]).toEqual({ tag: expect.any(String), col: 9, row: 2 });
    expect(body.visible).toBe(true);
  });

  it('clamps a position into the declared grid rather than refusing the beat', async () => {
    // Refusing would drop the player out of the world entirely, which is far worse than
    // drawing them one tile off.
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:alice'),
      payload: { col: 9999, row: -40 },
    });

    const roster = (await app.inject({ method: 'GET', url: '/api/games/green/presence' })).json();
    expect(roster.peers[0]).toMatchObject({ col: 14, row: 0 });
  });

  it('keeps the last reported tile when a beat carries no position', async () => {
    // The shell beats before the game has said where it is. Snapping to 0,0 for one poll
    // is a visible teleport with no cause anybody could find in the game's code.
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:alice'),
      payload: { col: 7, row: 5 },
    });
    await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:alice'),
      payload: {},
    });

    const roster = (await app.inject({ method: 'GET', url: '/api/games/green/presence' })).json();
    expect(roster.peers[0]).toMatchObject({ col: 7, row: 5 });
  });

  it('lets a player withdraw immediately rather than waiting out the TTL', async () => {
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/games/green/presence',
      headers: authHeaders('g:alice'),
      payload: { col: 3, row: 4 },
    });
    await app.inject({ method: 'DELETE', url: '/api/games/green/presence', headers: authHeaders('g:alice') });

    const roster = (await app.inject({ method: 'GET', url: '/api/games/green/presence' })).json();
    expect(roster.count).toBe(0);
  });

  it('reports the freshness window and cadence, so the two halves cannot drift', async () => {
    const app = await appWith(store);
    const body = (await app.inject({ method: 'GET', url: '/api/games/green/presence' })).json();
    expect(body.ttlMs).toBe(PRESENCE_TTL_MS);
    expect(body.heartbeatMs).toBeGreaterThan(0);
    expect(body.heartbeatMs * 2).toBeLessThan(PRESENCE_TTL_MS);
  });
});

describe('the presence registry', () => {
  const grid = { cols: 15, rows: 9 };

  it('forgets a player who stopped beating, with nothing left behind', async () => {
    // This is the erasure story in one test. There is no delete path to get right
    // because there is no record: a slot ages out, and the world with it.
    let now = 1_000_000;
    const registry = new PresenceRegistry(() => now);

    registry.beat('green', 'g:alice', grid, { col: 3, row: 4 });
    expect(registry.roster('green').count).toBe(1);
    expect(registry.worldCount).toBe(1);

    now += PRESENCE_TTL_MS + 1;

    expect(registry.roster('green').count).toBe(0);
    // Not merely empty — gone. A game nobody is playing costs the process nothing.
    expect(registry.worldCount).toBe(0);
  });

  it('keeps a player who is still beating', async () => {
    let now = 1_000_000;
    const registry = new PresenceRegistry(() => now);

    registry.beat('green', 'g:alice', grid, { col: 3, row: 4 });
    now += PRESENCE_TTL_MS - 1_000;
    registry.beat('green', 'g:alice', grid, { col: 4, row: 4 });
    now += PRESENCE_TTL_MS - 1_000;

    expect(registry.roster('green').count).toBe(1);
  });

  it('expires one player without expiring another', async () => {
    let now = 1_000_000;
    const registry = new PresenceRegistry(() => now);

    registry.beat('green', 'g:alice', grid, { col: 1, row: 1 });
    now += PRESENCE_TTL_MS - 1_000;
    registry.beat('green', 'g:bob', grid, { col: 2, row: 2 });
    now += 2_000;

    const roster = registry.roster('green');
    expect(roster.count).toBe(1);
    expect(roster.peers).toHaveLength(1);
    expect(roster.peers[0]).toMatchObject({ col: 2, row: 2 });
  });

  it('caps a world by evicting whoever beat longest ago, not by refusing newcomers', async () => {
    // Refusing would make a full world permanently full, since everybody in it keeps
    // renewing and nobody new could ever displace them.
    let now = 1_000_000;
    const registry = new PresenceRegistry(() => now);

    for (let index = 0; index < MAX_PRESENT_PER_WORLD + 10; index++) {
      now += 1;
      registry.beat('green', `g:player-${index}`, grid, { col: 1, row: 1 });
    }

    expect(registry.roster('green').count).toBe(MAX_PRESENT_PER_WORLD);
    // The newest arrival is in, which is the half that a refusing cap gets wrong.
    const latest = registry.beat('green', `g:player-${MAX_PRESENT_PER_WORLD + 9}`, grid, { col: 2, row: 2 });
    expect(latest.present).toBe(true);
  });

  it('reports membership explicitly rather than by comparing count to peers', async () => {
    // A crowded world trims `peers` below `count`, so inferring "am I here" from the two
    // numbers would tell a visitor who is merely looking that they are in the roster.
    const registry = new PresenceRegistry();
    for (let index = 0; index < 40; index++) {
      registry.beat('green', `g:player-${index}`, grid, { col: 1, row: 1 });
    }
    const looking = registry.roster('green');
    expect(looking.count).toBe(40);
    expect(looking.peers.length).toBeLessThan(looking.count);
    expect(looking.present).toBe(false);
  });

  it('keeps rosters separate per world, with a different tag in each', async () => {
    // Same reasoning as the world's per-world ownerTag salt: one game must not be able to
    // recognise its visitors from another game's roster.
    const registry = new PresenceRegistry();
    registry.beat('green', 'g:alice', grid, { col: 1, row: 1 });
    registry.beat('meadow', 'g:alice', grid, { col: 1, row: 1 });

    const greenTag = registry.roster('green').peers[0].tag;
    const meadowTag = registry.roster('meadow').peers[0].tag;
    expect(greenTag).not.toBe(meadowTag);
  });
});
