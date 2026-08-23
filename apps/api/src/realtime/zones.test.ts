import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import { verifyZoneTicket } from '@gamedevpl/zone-core';
import type { ZoneSchema } from '@gamedevpl/zone-core';
import type { ZoneSchemaSource } from './zone-source.js';

/**
 * Admission is all this service does for a zone: it mints a ticket and says where to
 * take it. So the tests are about the boundary — what the ticket carries, who may get
 * one, and what happens on a deployment that has no zone host at all, which is every
 * deployment until one exists.
 */

const sessionSecret = 'dev-session-secret-change-me';
const HOST_URL = 'https://gamedev-world.example.run.app';

const emberWatch: ZoneSchema = {
  tickHz: 10,
  maxPlayers: 4,
  inputs: [
    { k: 'move', type: 'enum', values: ['n', 's', 'e', 'w'] },
    { k: 'douse', type: 'none' },
  ],
};

function zoneSource(schemas: Record<string, ZoneSchema>): ZoneSchemaSource {
  return { getSchema: async (slug) => schemas[slug] ?? null };
}

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

async function appWith(
  hostUrl: string | null = HOST_URL,
  schemas: Record<string, ZoneSchema> = { 'ember-watch': emberWatch },
) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:ada' });
  return buildApp({ store, sessionSecret, zoneRoutes: { zones: zoneSource(schemas), hostUrl } });
}

describe('zone admission', () => {
  it('hands a signed-in player a ticket and the host to take it to', async () => {
    const app = await appWith();
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/ember-watch/zone/ticket',
      headers: authHeaders('g:ada'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ zone: 'ember-watch', hostUrl: HOST_URL, tickHz: 10, maxPlayers: 4, durable: true });
    expect(body.inputs).toEqual(emberWatch.inputs);

    const claims = verifyZoneTicket(body.ticket, sessionSecret);
    expect(claims).toMatchObject({ zone: 'ember-watch', slug: 'ember-watch' });
    await app.close();
  });

  it('never puts the account in the ticket', async () => {
    // The host is a place where untrusted game code runs. Handing it durable identity
    // would make the sim isolate a privacy boundary as well as a safety one, and one
    // cage should not have two jobs.
    //
    // Assert on the full uid (`g:ada`), not a short substring like `ada`: the ticket's
    // player tag and HMAC are hex, and hex randomly contains `ada` — that flake failed
    // CI without any product change.
    const app = await appWith();
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/ember-watch/zone/ticket',
      headers: authHeaders('g:ada'),
    });

    const body = response.json() as { ticket: string };
    const claims = verifyZoneTicket(body.ticket, sessionSecret);
    expect(claims.player).not.toBe('g:ada');
    expect(claims).not.toHaveProperty('uid');
    expect(claims).not.toHaveProperty('email');

    const decoded = Buffer.from(body.ticket, 'base64url').toString('utf8');
    expect(decoded).not.toContain('g:ada');
    expect(JSON.stringify(body)).not.toContain('g:ada');
    await app.close();
  });

  it('gives the same player the same seat across two admissions', async () => {
    // Which is what makes closing a tab and coming back land a character where it was
    // standing, rather than spawning a stranger beside it.
    const app = await appWith();
    const ask = () =>
      app.inject({ method: 'POST', url: '/api/games/ember-watch/zone/ticket', headers: authHeaders('g:ada') });
    const first = verifyZoneTicket((await ask()).json().ticket, sessionSecret);
    const second = verifyZoneTicket((await ask()).json().ticket, sessionSecret);
    expect(first.player).toBe(second.player);
    await app.close();
  });

  it('admits a guest, with an identity that lasts exactly as long as they do', async () => {
    // Plan §9: visiting is anonymous, persisting is not. A sign-in wall in front of
    // first play is the one thing this platform will not build.
    const app = await appWith();
    const ask = () => app.inject({ method: 'POST', url: '/api/games/ember-watch/zone/ticket' });

    const first = await ask();
    expect(first.statusCode).toBe(200);
    expect(first.json().durable).toBe(false);

    const second = await ask();
    expect(verifyZoneTicket(first.json().ticket, sessionSecret).player).not.toBe(
      verifyZoneTicket(second.json().ticket, sessionSecret).player,
    );
    await app.close();
  });

  it('404s a game that declares no zone', async () => {
    const app = await appWith();
    const response = await app.inject({ method: 'POST', url: '/api/games/lantern-depths/zone/ticket' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('404s every game when no zone host is configured', async () => {
    // Which is every deployment until one is stood up. The game hears "no zone here"
    // and plays on, exactly as it does when push or email is unconfigured.
    const app = await appWith(null);
    const response = await app.inject({ method: 'POST', url: '/api/games/ember-watch/zone/ticket' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('rejects a slug that could address something other than a game', async () => {
    const app = await appWith();
    for (const slug of ['Not-A-Slug', '-leading', 'has space']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/games/${encodeURIComponent(slug)}/zone/ticket`,
      });
      expect(response.statusCode, slug).toBe(400);
    }
    await app.close();
  });
});
