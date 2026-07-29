import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { guestPlayerTag, mintZoneTicket, zonePlayerTag, ZONE_TICKET_TTL_MS } from '@gamedevpl/zone-core';
import type { ZoneSchemaSource } from './zone-source.js';

/**
 * Admission to an authoritative zone (docs/persistent-world-plan.md P3).
 *
 * This route mints a ticket and says where to take it. It does **not** run a
 * simulation, hold zone state, or relay anything — that is the separate
 * `gamedev-world` service (docs/p3-zone-host-infra.md), and keeping the two apart is
 * the point: the API is the front door that knows who you are, and the host is a place
 * where untrusted game code executes and therefore learns as little as possible.
 *
 * What crosses that line is deliberately thin. The host is told the zone, the game, the
 * declared input vocabulary it must enforce, and a **per-zone pseudonym** for the
 * arriving player. Never a uid, never an email, never a session. The reasoning is the
 * one P2 settled on for `ownerTag`, applied to a cage rather than a document: an
 * identifier that is stable in one place and uncorrelatable anywhere else is enough to
 * give somebody their seat back and not enough to learn anything about them.
 *
 * Guests may enter. §9 of the plan proposes the line — visiting is anonymous, persisting
 * is not — and this is where it is drawn: a guest gets a per-connection tag rather than a
 * per-person one, so they hold a seat for as long as they are in the zone and are a
 * stranger again the moment they leave. A sign-in wall in front of first play is the one
 * thing this platform will not build.
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
});

export interface ZoneRoutesOptions {
  /** Absent (no games repo configured) makes every slug answer 404, like worlds. */
  zones?: ZoneSchemaSource | null;
  /**
   * Base URL of the zone host, from `ZONE_HOST_URL`. Absent means zones are simply not
   * running here — the route 404s, the module reports unavailable, and the game falls
   * back to whatever it does offline. That is the same posture every other optional
   * capability takes when its infrastructure is not configured.
   */
  hostUrl?: string | null;
  secret?: string;
  now?: () => number;
}

/**
 * Today a game has exactly one zone and its id is the slug, mirroring how `worldId`
 * started. Kept opaque for the same reason: instanced or seasonal zones should be a new
 * id, not a migration of every ticket, snapshot path and directory entry.
 */
function zoneIdFor(slug: string): string {
  return slug;
}

export async function registerZoneRoutes(app: FastifyInstance, options: ZoneRoutesOptions = {}): Promise<void> {
  const zones = options.zones ?? null;
  const hostUrl = (options.hostUrl ?? process.env.ZONE_HOST_URL ?? '').trim() || null;
  const now = options.now ?? Date.now;

  const secret = options.secret ?? process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required to sign zone tickets in production');
  }
  const signingSecret = secret ?? 'dev-session-secret-change-me';

  // A ticket is cheap to mint and short-lived, but each one is a seat somebody may
  // claim, so the rate is set where a player reconnecting through a bad ten minutes of
  // wifi never notices and a script trying to hold every seat in a zone does.
  const ticketRateLimit = { max: 40, timeWindow: 60_000 };

  app.post('/api/games/:slug/zone/ticket', { config: { rateLimit: ticketRateLimit } }, async (request, reply) => {
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    if (!hostUrl) return reply.status(404).send({ error: 'zones not available' });

    const schema = await zones?.getSchema(params.data.slug);
    // No declaration means no zone: an unpublished game, one that declares none, or
    // one whose declaration did not parse. All three are "there is nothing here" from
    // the game's side, and it plays on without a zone.
    if (!schema) return reply.status(404).send({ error: 'zone not found' });

    const zone = zoneIdFor(params.data.slug);
    const uid = request.user?.uid;
    // A signed-in player's tag is derived from their uid, so closing the tab and
    // coming back lands them in the seat their character is standing in. A guest's is
    // random per ticket, which is the same thing said about somebody with no
    // durable identity to be stable against.
    const player = uid ? zonePlayerTag(uid, zone, signingSecret) : guestPlayerTag(randomBytes(16).toString('hex'));
    const expiresAt = now() + ZONE_TICKET_TTL_MS;

    return reply.send({
      zone,
      hostUrl,
      ticket: mintZoneTicket({ zone, slug: params.data.slug, player, expiresAt }, signingSecret),
      expiresAt,
      tickHz: schema.tickHz,
      maxPlayers: schema.maxPlayers,
      // Echoed so the shell can tell a game "this is the vocabulary" without a second
      // round trip. Advisory to the client and authoritative only on the host, which
      // re-validates every event against its own copy — a client that ignores this
      // list simply gets its events dropped.
      inputs: schema.inputs,
      /** Whether anything this player does here can outlive the session (plan §9). */
      durable: Boolean(uid),
    });
  });
}
