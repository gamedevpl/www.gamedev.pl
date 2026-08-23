import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MAX_MULTIPLAYER_SLOTS, ZONE_LINK_STEPS } from '@gamedevpl/contract';
import { rememberBounded } from '../platform/bounded-map.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';
import type { Store, TelemetryEvent } from '../platform/store.js';

/**
 * Play-session telemetry intake (docs/improvement-loop-plan.md IL-1).
 *
 * The platform is blind after publish: nothing today can answer "did anyone open
 * this game, did it run, where did they stop". This is the write half of that —
 * capture only, no aggregation, no dashboard, no agent. It exists now because the
 * data has to accumulate before it can be worth reading, and because a game that
 * throws on load is a fact one session proves, not a statistic needing volume.
 *
 * Everything here arrives from inside a sandboxed iframe or from a page hosting
 * one, so it is treated as hostile input: fixed vocabulary, per-request cap,
 * per-session ceiling, per-IP window, server-assigned timestamps, and no free text
 * beyond a truncated error message. Nothing recorded identifies a player — no uid,
 * no IP, no user agent — so these rows answer "how did this game do" and cannot
 * answer "what did this person play".
 *
 * Only *published* games are recorded, judged by catalog membership — see
 * [published-slugs.ts](./published-slugs.ts) for why the submission document is the
 * wrong authority for that question. A creator playtesting their own draft is real
 * signal, but it is developer traffic, and mixing it into the funnel would make
 * every number a creator sees partly a reflection of themselves; a draft preview is
 * not in the published catalog, so it stays out.
 */

/** Bounds one flush; the shell batches ~4 events per 15s, so this is generous. */
const MAX_EVENTS_PER_REQUEST = 50;
/** Ceiling per play session. A session that exceeds it is buggy or hostile. */
const MAX_EVENTS_PER_SESSION = 400;
/** Flushes one IP may send per minute, across all its tabs. */
const MAX_REQUESTS_PER_WINDOW = 120;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
/**
 * Hard ceilings on the in-memory bookkeeping. `sessionId` is client-supplied, so the
 * cap on sessions is what stops a stream of fresh ids from growing the map without
 * bound; the IP ceiling is far higher because evicting a limiter bucket hands that
 * caller a fresh window, and real client addresses are not cheap to vary.
 */
const MAX_TRACKED_SESSIONS = 5000;
const MAX_TRACKED_IPS = 20_000;
const MAX_MESSAGE_LENGTH = 200;
const MAX_LABEL_LENGTH = 40;
/** Log every Nth unknown-slug drop: enough to notice a systemic problem, not a flood. */
const DROP_LOG_INTERVAL = 25;
/** Ceiling on a client-reported session age. Beyond this it is not a session. */
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
/**
 * How far back an event may be dated from its flush. Bounds what a client can do with
 * the offsets it supplies: at worst it back-dates its own events within this window,
 * never into an arbitrary past partition.
 */
const MAX_BACKDATE_MS = 6 * 60 * 60 * 1000;

/**
 * How long after its session opened an event happened. Optional so a browser still
 * running the previous build keeps reporting instead of getting a 400 — its events
 * simply fall back to receipt time, which is what every event used to get.
 */
const offsetField = { msSinceOpen: z.number().int().min(0).max(MAX_SESSION_MS).optional() };
/** Scene3D / gfx soft vs WebGL — optional on progress/end (games snapshot). */
const gfxBackendField = {
  gfxBackend: z.enum(['canvas2d', 'webgl', 'webgl3d']).optional(),
};

const EventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('game_opened'),
    slots: z.number().int().min(1).max(MAX_MULTIPLAYER_SLOTS).optional(),
    ...offsetField,
  }),
  z.object({ type: z.literal('play_time'), seconds: z.number().int().min(1).max(3600), ...offsetField }),
  z.object({ type: z.literal('game_closed'), ...offsetField }),
  z.object({
    type: z.literal('error'),
    message: z
      .string()
      .trim()
      .min(1)
      .max(MAX_MESSAGE_LENGTH * 4),
    ...offsetField,
  }),
  z.object({ type: z.literal('alive'), frames: z.number().int().min(0).max(100_000), ...offsetField }),
  z.object({
    type: z.literal('progress'),
    label: z
      .string()
      .trim()
      .min(1)
      .max(MAX_LABEL_LENGTH * 4),
    ...gfxBackendField,
    ...offsetField,
  }),
  z.object({ type: z.literal('score'), value: z.number().finite(), ...offsetField }),
  // P3 zones. Shell-originated: `apps/web/src/gamePlayer.ts` does not accept this type
  // over postMessage, so a game cannot claim to be shared while it is sitting alone.
  z.object({
    type: z.literal('zone_link'),
    step: z.enum(ZONE_LINK_STEPS),
    ...offsetField,
  }),
  z.object({
    type: z.literal('end'),
    outcome: z.enum(['won', 'lost', 'quit']),
    ...gfxBackendField,
    ...offsetField,
  }),
]);

const RequestSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    // Slugs are games-repo directory names. Anchoring the shape here keeps a crafted
    // value from reaching a store lookup at all.
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'invalid slug'),
  sessionId: z.string().trim().uuid('sessionId must be a uuid'),
  /** Session age at flush time; anchors each event's offset to a real instant. */
  flushMsSinceOpen: z.number().int().min(0).max(MAX_SESSION_MS).optional(),
  events: z.array(EventSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
});

export interface TelemetryRoutesOptions {
  store: Store;
  /**
   * Decides whether a slug is a published game. Absent (no games repo configured),
   * every flush is accepted and dropped — the same answer an unknown slug gets.
   */
  publishedSlugs?: PublishedSlugGate | null;
  now?: () => number;
}

/**
 * Sliding-window limiter. Per-instance state, like every other limiter in this
 * service: it bounds one container's exposure, not the fleet's.
 */
function isRateLimited(buckets: Map<string, number[]>, key: string, currentTime: number): boolean {
  const hits = (buckets.get(key) ?? []).filter((timestamp) => currentTime - timestamp < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= MAX_REQUESTS_PER_WINDOW) {
    rememberBounded(buckets, key, hits, MAX_TRACKED_IPS);
    return true;
  }
  hits.push(currentTime);
  rememberBounded(buckets, key, hits, MAX_TRACKED_IPS);
  return false;
}

export async function registerTelemetryRoutes(app: FastifyInstance, options: TelemetryRoutesOptions): Promise<void> {
  const { store, publishedSlugs } = options;
  const now = options.now ?? Date.now;

  const requestsByIp = new Map<string, number[]>();
  /** Flushes discarded for an unrecognised slug; logged sparsely, never per request. */
  let droppedUnknownSlug = 0;
  /** sessionId -> { count, lastSeen }. Capped and LRU-evicted — see bounded-map.ts. */
  const sessionCounts = new Map<string, { count: number; lastSeen: number }>();

  app.post('/api/telemetry', async (request, reply) => {
    const currentTime = now();

    const parsed = RequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    if (isRateLimited(requestsByIp, request.ip, currentTime)) {
      return reply.status(429).send({ error: 'too many telemetry requests' });
    }

    // Unknown, unpublished, or draft-only slug: accept and drop. Reporting the
    // difference would turn this endpoint into a slug oracle, and a client cannot act
    // on the answer. Note this branch is *silent by design*, which is precisely how it
    // hid a bug that discarded ~95% of real play — hence the counter below, so the
    // drop rate is visible in logs instead of being invisible until someone queries
    // Firestore and finds nothing.
    const published = (await publishedSlugs?.isPublished(parsed.data.slug)) ?? false;
    if (!published) {
      droppedUnknownSlug += 1;
      if (droppedUnknownSlug % DROP_LOG_INTERVAL === 1) {
        request.log.warn(
          { slug: parsed.data.slug, droppedUnknownSlug },
          'telemetry dropped: slug is not a published game',
        );
      }
      return reply.status(202).send({ accepted: 0 });
    }

    const session = sessionCounts.get(parsed.data.sessionId) ?? { count: 0, lastSeen: currentTime };
    const room = MAX_EVENTS_PER_SESSION - session.count;
    if (room <= 0) {
      rememberBounded(
        sessionCounts,
        parsed.data.sessionId,
        { count: session.count, lastSeen: currentTime },
        MAX_TRACKED_SESSIONS,
      );
      return reply.status(202).send({ accepted: 0 });
    }

    /**
     * When did this event actually happen?
     *
     * The flush's arrival is a real instant we measured; the client tells us how old
     * the session was at that moment and how old it was at each event. The difference
     * is a duration, and subtracting it from the arrival time dates the event without
     * trusting the client's clock for anything. Missing either offset — an older client
     * — falls back to receipt time, the behaviour every event used to have.
     */
    const flushOffset = parsed.data.flushMsSinceOpen;
    function eventTimeIso(msSinceOpen: number | undefined): string {
      if (flushOffset === undefined || msSinceOpen === undefined) return new Date(currentTime).toISOString();
      const backdateMs = Math.min(MAX_BACKDATE_MS, Math.max(0, flushOffset - msSinceOpen));
      return new Date(currentTime - backdateMs).toISOString();
    }

    const events: TelemetryEvent[] = parsed.data.events.slice(0, room).map((event) => {
      const base = {
        slug: parsed.data.slug,
        sessionId: parsed.data.sessionId,
        at: eventTimeIso(event.msSinceOpen),
        ...(event.msSinceOpen === undefined ? {} : { msSinceOpen: event.msSinceOpen }),
      };
      switch (event.type) {
        case 'game_opened':
          return { ...base, type: event.type, ...(event.slots === undefined ? {} : { slots: event.slots }) };
        case 'play_time':
          return { ...base, type: event.type, seconds: event.seconds };
        case 'error':
          // Truncated again server-side: the shell already does it, and the shell is
          // not the trust boundary for its own input.
          return { ...base, type: event.type, message: event.message.slice(0, MAX_MESSAGE_LENGTH) };
        case 'alive':
          return { ...base, type: event.type, frames: event.frames };
        case 'progress':
          return {
            ...base,
            type: event.type,
            label: event.label.slice(0, MAX_LABEL_LENGTH),
            ...(event.gfxBackend === undefined ? {} : { gfxBackend: event.gfxBackend }),
          };
        case 'score':
          return { ...base, type: event.type, value: event.value };
        case 'zone_link':
          return { ...base, type: event.type, step: event.step };
        case 'end':
          return {
            ...base,
            type: event.type,
            outcome: event.outcome,
            ...(event.gfxBackend === undefined ? {} : { gfxBackend: event.gfxBackend }),
          };
        default:
          return { ...base, type: event.type };
      }
    });

    rememberBounded(
      sessionCounts,
      parsed.data.sessionId,
      { count: session.count + events.length, lastSeen: currentTime },
      MAX_TRACKED_SESSIONS,
    );

    // Back-dating means one flush can straddle midnight, so events go to the partition
    // their own timestamp names rather than all following the last one's.
    const byDate = new Map<string, TelemetryEvent[]>();
    events.forEach((event) => {
      const dateStr = event.at.slice(0, 10);
      const bucket = byDate.get(dateStr);
      if (bucket) bucket.push(event);
      else byDate.set(dateStr, [event]);
    });

    try {
      for (const [dateStr, dateEvents] of byDate) {
        await store.appendTelemetryEvents(dateStr, dateEvents);
      }
    } catch (error) {
      // Telemetry is never worth failing a play session over. Log and swallow: the
      // client must not retry into a loop against a store that is already unhappy.
      request.log.error({ err: error }, 'failed to append telemetry events');
      return reply.status(202).send({ accepted: 0 });
    }

    return reply.status(202).send({ accepted: events.length });
  });
}
