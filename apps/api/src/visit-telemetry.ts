import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rememberBounded } from './bounded-map.js';
import type { Store, VisitEvent } from './store.js';

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
const MAX_REQUESTS_PER_WINDOW = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
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
const MAX_TRACKED_IPS = 20_000;

const RouteKindSchema = z.enum([
  'home',
  'play',
  'draft',
  'status',
  'join',
  'invite',
  'legal',
  'health',
  'studio',
  'game',
  'notFound',
]);
/**
 * Creation-funnel steps. A closed enum rather than a free string, for the same reason
 * every other field here is bounded: this reaches a grouping key, and the endpoint is
 * open to anyone who can reach the site.
 */
const CreateStepSchema = z.enum([
  'prompt_started',
  'spec_submitted',
  'signin_required',
  'qa_shown',
  'title_confirmed',
  'submission_created',
  'handoff_shown',
  'handoff_enter_studio',
]);
/**
 * Closed-beta waitlist funnel. Same closed-enum posture as create steps: the value
 * reaches a grouping key on an open endpoint.
 */
const WaitlistStepSchema = z.enum(['cta_clicked', 'joined']);
const InviteStepSchema = z.enum(['opened', 'accepted', 'unavailable']);
const BetaWelcomeStepSchema = z.enum(['shown', 'continued', 'dismissed']);
/**
 * Studio / self-build funnel (BY-08). Sibling to create steps — not ordered with them.
 * Reaches a grouping key; closed enum on an open endpoint.
 */
const StudioStepSchema = z.enum([
  'builder_chosen',
  'connect_copied',
  'connect_deeplink',
  'connect_dismissed',
  'connect_restored',
  'agent_signaled',
  'gate_verdict',
  'round_opened',
  // A creator took a working copy to their own IDE (docs/own-ide-checkout.md). Its
  // value is as the denominator for a question nothing else can answer: of the
  // creators who leave to work locally, how many come back and deliver.
  'workspace_checkout',
]);
/** Platform vs creator's own agent. Optional on create_step; required on studio_step. */
const BuilderDimensionSchema = z.enum(['platform', 'self']);
/**
 * Closed detail for studio steps that carry one. Optional so steps without a detail
 * (builder choice, first agent signal) stay valid.
 * `header` = creator-key copy (BY-27a); `cursor` / `vscode` = one-click install (BY-18c).
 */
const StudioStepDetailSchema = z.enum([
  'install',
  'kickoff',
  'header',
  'cursor',
  'vscode',
  'green',
  'red',
  'kit_outdated',
  'creator',
  'agent',
]);
/** EditorKit's revision funnel. No slug: the visit stream stays unjoinable. */
const EditorStepSchema = z.enum([
  'opened',
  'draft_saved',
  'previewed',
  'published',
  'v2_schema_loaded',
  'v2_content_loaded',
  'v2_controller_ready',
  'v2_controller_failed',
  'controller_loaded',
  'controller_failed',
  'tool_used',
  'undo_used',
  'selection_from_game',
]);
/** The NL tuning lane's outcomes — a dimension beside the editing funnel, not a rung in it. */
const AssistStepSchema = z.enum(['asked', 'applied', 'handoff', 'rejected']);
/**
 * The Code surface funnel (creator-code-editing-execution-plan.md CE-01). Reaches a
 * grouping key on an open endpoint like every other funnel here — and, same as the
 * editor funnel, never carries a file path or source text; those never leave the
 * client at all.
 */
const CodeStepSchema = z.enum([
  'offered',
  'opened',
  'file_opened',
  'edited',
  'typechecked',
  'previewed',
  'delivered',
  'published',
  'read_only_agent',
  'conflict_seen',
  'round_reopened',
]);
const CodeCompletionKindSchema = z.enum(['language_service', 'ghost_text']);
const CodeCompletionOutcomeSchema = z.enum(['shown', 'empty', 'failed']);
/** The player-side remix funnel — see visit-funnel's REMIX_STEPS for the order's meaning. */
const RemixStepSchema = z.enum([
  'offered',
  'opened',
  'no_lane',
  'typed',
  'wall_shown',
  'signed_in',
  'tuned',
  'painted',
  'asked',
  'applied',
  'broken',
  'undone',
  'handoff',
  'refused',
  'shared',
  'keep_clicked',
  'proposed',
]);
/** Which door led to the painter — recorded on `painted`, closed like every grouping key. */
const RemixViaSchema = z.enum(['redirect', 'menu', 'panel']);
/**
 * Which control opened the remix. Its own field rather than more members on
 * `via`: that one names what led a player to the painter, this one names the
 * button they pressed, and collapsing the two would make every stored row
 * ambiguous the first time a third door exists.
 */
const RemixControlSchema = z.enum(['bar', 'more', 'page']);
/**
 * Which chrome surface opened How to play. Optional so a tab still running the previous
 * client can record the open without `via` — the aggregate treats missing as unknown
 * rather than dropping the event. Closed enum: the value reaches a grouping key.
 */
const HowToPlayViaSchema = z.enum(['bar', 'more']);
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
  z.object({ type: z.literal('play_started'), ...offsetField }),
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

    if (isRateLimited(requestsByIp, request.ip, currentTime)) {
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
      rememberBounded(
        visitCounts,
        parsed.data.visitId,
        { ...visit, lastSeen: currentTime },
        MAX_TRACKED_VISITS,
      );
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
        default:
          return { ...base, type: 'play_started' };
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
