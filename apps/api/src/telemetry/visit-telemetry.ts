import {
  ASSIST_STEPS,
  BETA_WELCOME_STEPS,
  CODE_COMPLETION_KINDS,
  CODE_COMPLETION_OUTCOMES,
  CODE_STEPS,
  CREATE_STEPS,
  EDITOR_STEPS,
  HOW_TO_PLAY_VIAS,
  INVITE_STEPS,
  PLAY_VIAS,
  REMIX_CONTROLS,
  REMIX_PAINTED_VIAS,
  REMIX_STEPS,
  STUDIO_STEP_DETAILS,
  STUDIO_STEPS,
  VISIT_ROUTE_KINDS,
  BUILDERS,
  WAITLIST_STEPS,
} from '@gamedevpl/contract';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rememberBounded } from '../platform/bounded-map.js';
import type { Store, VisitEvent } from '../platform/store.js';
import { cliStepEventSchema, toCliVisitEvent } from './visit-cli-event.js';
import { isVisitTelemetryRateLimited } from './visit-telemetry-limit.js';
/**
 * Visit telemetry intake — the write half of the funnel that play telemetry cannot see.
 *
 * [telemetry.ts](./telemetry.ts) records what happened *inside* a game once one is
 * open. Everything before that — the landing, the browse, whether a second game got
 * played, where the visitor came from — produced no rows at all, so the first minute of
 * every visit and the depth of every sitting were unmeasurable.
 *
 * The privacy posture is the stricter one, deliberately: a visit id is a per-tab uuid
 * from `sessionStorage`, no game slug is accepted (so this stream cannot be joined with
 * play telemetry into one tab's browsing history), acquisition is a bare hostname plus
 * filtered UTM values, and — as with play events — no uid, IP, or user agent is ever
 * recorded. These rows answer "how do visits go", and cannot answer "what did this
 * person do".
 *
 * Input is treated as hostile even though the app is the only intended sender: the
 * endpoint is reachable by anyone who can reach the site.
 */

const MAX_EVENTS_PER_REQUEST = 25;
const MAX_EVENTS_PER_VISIT = 200;
const MAX_COMPLETION_EVENTS_PER_VISIT = 50;
const MAX_VISIT_MS = 24 * 60 * 60 * 1000;
/** How far back an event may be dated from its flush — bounds client-supplied offsets. */
const MAX_BACKDATE_MS = 6 * 60 * 60 * 1000;
/**
 * Hard ceilings on the in-memory bookkeeping. `visitId` is client-supplied, so the
 * cap on visits is what stops a stream of fresh ids from growing the map without
 * bound; the IP ceiling is far higher because evicting a limiter bucket hands that
 * caller a fresh window, and real client addresses are not cheap to vary.
 */
const MAX_TRACKED_VISITS = 5000;
const RouteKindSchema = z.enum(VISIT_ROUTE_KINDS);
const CreateStepSchema = z.enum(CREATE_STEPS);
const WaitlistStepSchema = z.enum(WAITLIST_STEPS);
const InviteStepSchema = z.enum(INVITE_STEPS);
const BetaWelcomeStepSchema = z.enum(BETA_WELCOME_STEPS);
const StudioStepSchema = z.enum(STUDIO_STEPS);
/** Platform vs creator's own agent. Optional on create_step; required on studio_step. */
const BuilderDimensionSchema = z.enum(BUILDERS);
const StudioStepDetailSchema = z.enum(STUDIO_STEP_DETAILS);
const EditorStepSchema = z.enum(EDITOR_STEPS);
const AssistStepSchema = z.enum(ASSIST_STEPS);
const CodeStepSchema = z.enum(CODE_STEPS);
const CodeCompletionKindSchema = z.enum(CODE_COMPLETION_KINDS);
const CodeCompletionOutcomeSchema = z.enum(CODE_COMPLETION_OUTCOMES);
const RemixStepSchema = z.enum(REMIX_STEPS);
const RemixViaSchema = z.enum(REMIX_PAINTED_VIAS);
const RemixControlSchema = z.enum(REMIX_CONTROLS);
const HowToPlayViaSchema = z.enum(HOW_TO_PLAY_VIAS);
const PlayViaSchema = z.enum(PLAY_VIAS);
/**
 * Acquisition strings are re-validated here rather than trusted from the client. The
 * browser filters them for cleanliness; this filters them because a value that reaches a
 * grouping key must not be able to carry punctuation, markup, or an address.
 */
const UtmSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^[a-z0-9._-]+$/, 'invalid utm value');
const ReferrerSchema = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9.-]+$/, 'invalid referrer');

const offsetField = { msSinceStart: z.number().int().min(0).max(MAX_VISIT_MS) };

const EventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('visit_started'),
    entry: RouteKindSchema,
    referrer: ReferrerSchema.optional(),
    utmSource: UtmSchema.optional(),
    utmMedium: UtmSchema.optional(),
    utmCampaign: UtmSchema.optional(),
    ...offsetField,
  }),
  z.object({ type: z.literal('route_viewed'), route: RouteKindSchema, ...offsetField }),
  z.object({ type: z.literal('play_started'), via: PlayViaSchema.optional(), ...offsetField }),
  z.object({
    type: z.literal('how_to_play_opened'),
    via: HowToPlayViaSchema.optional(),
    /** True only — a client that sends `false` is treated the same as omitting it. */
    reopen: z.literal(true).optional(),
    ...offsetField,
  }),
  z.object({
    type: z.literal('create_step'),
    step: CreateStepSchema,
    builder: BuilderDimensionSchema.optional(),
    ...offsetField,
  }),
  z.object({ type: z.literal('waitlist_step'), step: WaitlistStepSchema, ...offsetField }),
  z.object({ type: z.literal('invite_step'), step: InviteStepSchema, ...offsetField }),
  z.object({ type: z.literal('beta_welcome_step'), step: BetaWelcomeStepSchema, ...offsetField }),
  z.object({
    type: z.literal('studio_step'),
    step: StudioStepSchema,
    builder: BuilderDimensionSchema,
    detail: StudioStepDetailSchema.optional(),
    ...offsetField,
  }),
  z.object({ type: z.literal('editor_step'), step: EditorStepSchema, ...offsetField }),
  z.object({ type: z.literal('assist_step'), step: AssistStepSchema, ...offsetField }),
  z.object({
    type: z.literal('remix_step'),
    step: RemixStepSchema,
    via: RemixViaSchema.optional(),
    control: RemixControlSchema.optional(),
    ...offsetField,
  }),
  z.object({ type: z.literal('code_step'), step: CodeStepSchema, ...offsetField }),
  cliStepEventSchema(offsetField),
  z.object({
    type: z.literal('code_completion'),
    kind: CodeCompletionKindSchema,
    outcome: CodeCompletionOutcomeSchema,
    latencyMs: z.number().int().min(0).max(30_000),
    candidateCount: z.number().int().min(0).max(5_000).optional(),
    completionChars: z.number().int().min(0).max(4_000).optional(),
    ...offsetField,
  }),
]);

const RequestSchema = z.object({
  visitId: z.string().trim().uuid('visitId must be a uuid'),
  flushMsSinceStart: z.number().int().min(0).max(MAX_VISIT_MS),
  events: z.array(EventSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
});

export interface VisitTelemetryRoutesOptions {
  store: Store;
  now?: () => number;
}

export async function registerVisitTelemetryRoutes(
  app: FastifyInstance,
  options: VisitTelemetryRoutesOptions,
): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;

  const requestsByIp = new Map<string, number[]>();
  /** visitId -> lane counts. Capped and LRU-evicted — see bounded-map.ts. */
  const visitCounts = new Map<string, { coreCount: number; completionCount: number; lastSeen: number }>();

  app.post('/api/telemetry/visit', async (request, reply) => {
    const currentTime = now();

    const parsed = RequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    if (isVisitTelemetryRateLimited(requestsByIp, request.clientIp, currentTime)) {
      return reply.status(429).send({ error: 'too many telemetry requests' });
    }

    const visit =
      visitCounts.get(parsed.data.visitId) ??
      ({ coreCount: 0, completionCount: 0, lastSeen: currentTime } satisfies {
        coreCount: number;
        completionCount: number;
        lastSeen: number;
      });
    if (visit.coreCount >= MAX_EVENTS_PER_VISIT && visit.completionCount >= MAX_COMPLETION_EVENTS_PER_VISIT) {
      rememberBounded(visitCounts, parsed.data.visitId, { ...visit, lastSeen: currentTime }, MAX_TRACKED_VISITS);
      return reply.status(202).send({ accepted: 0 });
    }

    /**
     * Same anchoring as play telemetry: the flush's arrival is a real instant we
     * measured, and each event's age within the visit is a duration, so subtracting
     * dates the event without trusting the client's wall clock for anything.
     */
    const flushOffset = parsed.data.flushMsSinceStart;
    function eventTimeIso(msSinceStart: number): string {
      const backdateMs = Math.min(MAX_BACKDATE_MS, Math.max(0, flushOffset - msSinceStart));
      return new Date(currentTime - backdateMs).toISOString();
    }

    let coreCount = visit.coreCount;
    let completionCount = visit.completionCount;
    const acceptedInput = parsed.data.events.filter((event) => {
      if (event.type === 'code_completion') {
        if (completionCount >= MAX_COMPLETION_EVENTS_PER_VISIT) return false;
        completionCount += 1;
        return true;
      }
      if (coreCount >= MAX_EVENTS_PER_VISIT) return false;
      coreCount += 1;
      return true;
    });

    if (acceptedInput.length === 0) {
      rememberBounded(visitCounts, parsed.data.visitId, { ...visit, lastSeen: currentTime }, MAX_TRACKED_VISITS);
      return reply.status(202).send({ accepted: 0 });
    }

    const events: VisitEvent[] = acceptedInput.map((event) => {
      const base = {
        visitId: parsed.data.visitId,
        at: eventTimeIso(event.msSinceStart),
        msSinceStart: event.msSinceStart,
      };
      switch (event.type) {
        case 'visit_started':
          return {
            ...base,
            type: event.type,
            entry: event.entry,
            ...(event.referrer === undefined ? {} : { referrer: event.referrer }),
            ...(event.utmSource === undefined ? {} : { utmSource: event.utmSource }),
            ...(event.utmMedium === undefined ? {} : { utmMedium: event.utmMedium }),
            ...(event.utmCampaign === undefined ? {} : { utmCampaign: event.utmCampaign }),
          };
        case 'route_viewed':
          return { ...base, type: event.type, route: event.route };
        case 'create_step':
          return {
            ...base,
            type: event.type,
            step: event.step,
            ...(event.builder === undefined ? {} : { builder: event.builder }),
          };
        case 'waitlist_step':
          return { ...base, type: event.type, step: event.step };
        case 'invite_step':
          return { ...base, type: event.type, step: event.step };
        case 'beta_welcome_step':
          return { ...base, type: event.type, step: event.step };
        case 'studio_step':
          return {
            ...base,
            type: event.type,
            step: event.step,
            builder: event.builder,
            ...(event.detail === undefined ? {} : { detail: event.detail }),
          };
        case 'editor_step':
          return { ...base, type: event.type, step: event.step };
        case 'assist_step':
          return { ...base, type: event.type, step: event.step };
        case 'code_step':
          return { ...base, type: event.type, step: event.step };
        case 'cli_step':
          return toCliVisitEvent(base, event);
        case 'code_completion':
          return {
            ...base,
            type: event.type,
            kind: event.kind,
            outcome: event.outcome,
            latencyMs: event.latencyMs,
            ...(event.candidateCount === undefined ? {} : { candidateCount: event.candidateCount }),
            ...(event.completionChars === undefined ? {} : { completionChars: event.completionChars }),
          };
        case 'remix_step':
          return {
            ...base,
            type: event.type,
            step: event.step,
            ...(event.via === undefined ? {} : { via: event.via }),
            ...(event.control === undefined ? {} : { control: event.control }),
          };
        case 'how_to_play_opened':
          return {
            ...base,
            type: event.type,
            ...(event.via === undefined ? {} : { via: event.via }),
            ...(event.reopen === true ? { reopen: true } : {}),
          };
        case 'play_started':
          return { ...base, type: event.type, ...(event.via === undefined ? {} : { via: event.via }) };
        default:
          // Unreachable: every EventSchema member has its own case above.
          return event satisfies never;
      }
    });

    rememberBounded(
      visitCounts,
      parsed.data.visitId,
      { coreCount, completionCount, lastSeen: currentTime },
      MAX_TRACKED_VISITS,
    );

    // Back-dating means one flush can straddle midnight, so events go to the partition
    // their own timestamp names rather than all following the last one's.
    const byDate = new Map<string, VisitEvent[]>();
    events.forEach((event) => {
      const dateStr = event.at.slice(0, 10);
      const bucket = byDate.get(dateStr);
      if (bucket) bucket.push(event);
      else byDate.set(dateStr, [event]);
    });

    try {
      for (const [dateStr, dateEvents] of byDate) {
        await store.appendVisitEvents(dateStr, dateEvents);
      }
    } catch (error) {
      // Telemetry is never worth failing a visit over.
      request.log.error({ err: error }, 'failed to append visit events');
      return reply.status(202).send({ accepted: 0 });
    }

    return reply.status(202).send({ accepted: events.length });
  });
}
