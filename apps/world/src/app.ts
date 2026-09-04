import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { InvalidZoneTicketError, MAX_PLAYERS_PER_ZONE } from '@gamedevpl/zone-core';
import { ZoneAdmissionError, ZoneHost, type ZoneConnection, type ZoneHostOptions } from './host.js';

/**
 * The `gamedev-world` service: one websocket endpoint and a health probe
 * (docs/p3-zone-host-infra.md, docs/p3-zone-protocol.md §3).
 *
 * Deliberately thin. Everything that decides anything lives in `@gamedevpl/zone-core`;
 * what is here is the socket, the frame validation, and the per-connection limits. The
 * service holds no session, no cookie and no user record — a ticket minted by the main
 * API is the whole of what it knows about whoever just arrived.
 *
 * Every frame from a client is hostile input, unchanged from party mode: size-capped
 * before it is read, rate-limited before it is parsed, and narrowed by a schema before
 * any of it reaches a zone.
 */

import { ZONE_PROTOCOL_VERSION } from '@gamedevpl/contract';
export { ZONE_PROTOCOL_VERSION };

import {
  createFrameLimiter,
  DEFAULT_MAX_SOCKETS_PER_IP,
  MAX_SOCKET_FRAME_BYTES as MAX_FRAME_BYTES,
  MAX_SOCKET_FRAMES_PER_SECOND as MAX_FRAMES_PER_SECOND,
} from '@gamedevpl/contract';

export { DEFAULT_MAX_SOCKETS_PER_IP };

const HelloFrameSchema = z.object({
  t: z.literal('hello'),
  zone: z.string().min(1).max(120),
  ticket: z.string().min(1).max(512),
});

// The value field is `d`, not `v`: every frame carries `v` as the protocol version, so an
// enum input arriving as `v` would overwrite it and be dropped as a version mismatch.
const InputFrameSchema = z.object({
  t: z.literal('input'),
  k: z.string().min(1).max(16),
  d: z.union([z.number(), z.string().max(32), z.boolean()]).optional(),
});

const ClientFrameSchema = z.discriminatedUnion('t', [
  HelloFrameSchema,
  InputFrameSchema,
  z.object({ t: z.literal('resync') }),
  z.object({ t: z.literal('bye') }),
]);

export interface WorldAppOptions extends Omit<ZoneHostOptions, 'secret'> {
  secret?: string;
  logger?: boolean;
  maxSocketsPerIp?: number;
}

export interface WorldApp {
  app: FastifyInstance;
  host: ZoneHost;
}

export async function buildWorldApp(options: WorldAppOptions): Promise<WorldApp> {
  const secret = options.secret ?? process.env.SESSION_SECRET;
  if (!secret) {
    // The host cannot verify a ticket without it, so every connection would be refused.
    // Failing at boot says that once instead of once per player.
    throw new Error('SESSION_SECRET is required: it is what zone tickets are signed with');
  }

  // Cloud Run appends the real client IP to X-Forwarded-For rather than replacing it, so
  // trusting exactly one hop resolves to the entry Cloud Run itself wrote. `true` would
  // take the leftmost and let any caller pick their own rate-limit bucket.
  const app = Fastify({ logger: options.logger ?? false, trustProxy: (_address, hop) => hop === 0 });
  const host = new ZoneHost({
    ...options,
    secret,
    onWarn:
      options.onWarn ??
      ((event) => {
        // Not an admission failure — the join proceeds on the last snapshot. Still worth
        // a warn: skipped catch-up is how a world looks "frozen in time" after a cold
        // start, and A6 used to fire before this path existed (2026-08-02).
        app.log.warn(
          { err: event.error, slug: event.slug, zoneId: event.zoneId, elapsedMs: event.elapsedMs },
          'zone wake catch-up skipped after timeout',
        );
      }),
  });
  const maxSocketsPerIp = options.maxSocketsPerIp ?? DEFAULT_MAX_SOCKETS_PER_IP;
  const socketsByIp = new Map<string, number>();

  await app.register(fastifyWebsocket, { options: { maxPayload: MAX_FRAME_BYTES } });

  app.get('/health', async () => ({
    ok: true,
    zones: host.liveZoneCount,
    maxPlayersPerZone: MAX_PLAYERS_PER_ZONE,
  }));

  app.get('/zone/ws', { websocket: true }, (socket, request) => {
    const limiter = createFrameLimiter(MAX_FRAMES_PER_SECOND);
    let zoneId: string | null = null;
    let slot = -1;
    let admitting = false;

    const connection: ZoneConnection = {
      send(frame) {
        try {
          socket.send(JSON.stringify({ v: ZONE_PROTOCOL_VERSION, ...frame }));
        } catch {
          // A dead socket is not an error worth failing a zone over; the close handler
          // cleans it up.
        }
      },
      close(reason) {
        try {
          socket.send(JSON.stringify({ v: ZONE_PROTOCOL_VERSION, t: 'closed', reason }));
        } catch {
          // already gone
        }
        socket.close(1000, reason);
      },
    };

    // An idle socket costs memory and a file descriptor while costing the opener
    // nothing, and this door is reachable by anyone holding a ticket — including a guest,
    // by design. The ceiling clears a household playing together with reconnect overlap.
    const ip = connectionAddress(request);
    if (ip !== null) {
      const open = socketsByIp.get(ip) ?? 0;
      if (open >= maxSocketsPerIp) {
        connection.close('too_many_connections');
        return;
      }
      socketsByIp.set(ip, open + 1);
    }

    let released = false;
    const releaseSocket = () => {
      if (released || ip === null) return;
      released = true;
      const remaining = (socketsByIp.get(ip) ?? 1) - 1;
      if (remaining > 0) socketsByIp.set(ip, remaining);
      else socketsByIp.delete(ip);
    };

    const onMessage = async (raw: unknown) => {
      const text = typeof raw === 'string' ? raw : String(raw);
      if (text.length > MAX_FRAME_BYTES) return connection.close('frame_too_large');
      if (!limiter.allow(Date.now())) return connection.close('rate_limited');

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        return connection.close('bad_frame');
      }

      const frame = ClientFrameSchema.safeParse(payload);
      if (!frame.success) return connection.close('bad_frame');
      const message = frame.data;

      if (message.t === 'hello') {
        if (zoneId !== null || admitting) return connection.close('already_joined');
        admitting = true;
        try {
          const seated = await host.admit(message.ticket, connection);
          zoneId = seated.zoneId;
          slot = seated.slot;
          connection.send({
            t: 'welcome',
            slot,
            zone: seated.zoneId,
            slug: seated.zone.slug,
            tickHz: seated.zone.tickHz,
            maxPlayers: seated.zone.maxPlayers,
          });
        } catch (error) {
          // `bad_ticket` covers expired, forged and wrong-zone alike. Telling a caller
          // which one they hold only helps somebody holding a stolen one.
          const reason =
            error instanceof ZoneAdmissionError
              ? error.reason
              : error instanceof InvalidZoneTicketError
                ? 'bad_ticket'
                : 'zone_unavailable';
          // The wire reason is deliberately uninformative, which leaves the operator with
          // nothing when it is the platform at fault rather than the caller: a host that
          // cannot start any zone at all answers `zone_unavailable` to every join and logs
          // nothing, and reads from the outside exactly like a host with no traffic. The
          // cause goes to the log, where the person who can fix it is the only one reading.
          //
          // `err` is the *cause* rather than the wrapper, because the wrapper's stack
          // begins where the error was caught and its message is the wire reason repeated.
          // Logging it was logging the fact that something failed to whoever already knew.
          // The unwrapped case keeps the error itself — that is a fault that escaped the
          // admission path entirely, and its own stack is the informative one.
          //
          // `slug` and `zoneId` ride along because the cause alone could not say which game
          // failed: A6 2026-08-05 logged a bundle that timed out loading and left no way to
          // find out whose bundle it was. They come off the verified ticket, so a refusal
          // that never got that far simply has none.
          if (reason === 'zone_unavailable') {
            const admission = error instanceof ZoneAdmissionError ? error : undefined;
            app.log.error(
              { err: admission?.cause ?? error, reason, slug: admission?.slug, zoneId: admission?.zoneId },
              'zone admission failed',
            );
          }
          connection.close(reason);
        } finally {
          admitting = false;
        }
        return;
      }

      if (zoneId === null) return connection.close('not_joined');

      if (message.t === 'input') {
        // Undeclared kinds and out-of-range values are dropped by the zone rather than
        // closing the socket: a client one version behind its game is a normal thing to
        // be, and hanging up on it would turn a harmless mismatch into an outage.
        host.input(zoneId, slot, message.k, message.d);
        return;
      }
      if (message.t === 'resync') return host.resync(zoneId, slot);
      if (message.t === 'bye') return connection.close('bye');
    };

    const onClose = () => {
      // Before the early return: a socket that never said hello has no zone, and that is
      // exactly the shape a flood takes.
      releaseSocket();
      if (zoneId === null) return;
      host.release(zoneId, slot, connection);
      zoneId = null;
    };

    socket.on('message', (payload: unknown) => void onMessage(payload));
    socket.on('close', () => onClose());
    socket.on('error', () => onClose());
  });

  host.start();
  app.addHook('onClose', async () => {
    await host.shutdown();
  });

  return { app, host };
}

/**
 * The address to bucket a connection under, or null when it cannot be determined.
 *
 * Null rather than a shared "unknown" bucket, deliberately: collapsing unclassifiable
 * connections together would let one transport exhaust a single bucket and lock everyone
 * else out. A cap that takes down the feature it protects is worse than no cap.
 */
function connectionAddress(request: { ip?: string }): string | null {
  try {
    return request.ip || null;
  } catch {
    return null;
  }
}
