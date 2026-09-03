import {
  PLAY_VIAS,
  type AssistStep,
  type BetaWelcomeStep,
  type CliAdapter,
  type CliInstallChannel,
  type CliPlatformOs,
  type CliStep,
  type CliVerifyStage,
  type CodeCompletionKind,
  type CodeCompletionOutcome,
  type CodeStep,
  type CreateStep,
  type EditorStep,
  type HowToPlayVia,
  type InviteStep,
  type PlayVia,
  type RemixControl,
  type RemixPaintedVia,
  type RemixStep,
  type StudioStep,
  type StudioStepDetail,
  type VisitRouteKind,
  type WaitlistStep,
} from '@gamedevpl/contract';
import { NAVIGATE_EVENT, parsePathRoute } from './core/router.js';
import { routeKind } from './visitRouteKind.js';

export { routeKind } from './visitRouteKind.js';

export type {
  AssistStep,
  BetaWelcomeStep,
  CliAdapter,
  CliInstallChannel,
  CliPlatformOs,
  CliStep,
  CliVerifyStage,
  CodeCompletionKind,
  CodeCompletionOutcome,
  CodeStep,
  CreateStep,
  EditorStep,
  HowToPlayVia,
  InviteStep,
  PlayVia,
  RemixControl,
  RemixPaintedVia,
  RemixStep,
  StudioStep,
  StudioStepDetail,
  VisitRouteKind,
  WaitlistStep,
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Visit telemetry, browser half.
 *
 * Play telemetry ([telemetry.ts](./telemetry.ts)) answers "how did this game do". It
 * deliberately cannot answer "how did this visit go" — its session id is minted per
 * game open, so two plays in one sitting are two unrelated rows, and nothing at all is
 * recorded before a game opens. That leaves the first minute of every visit, the depth
 * of a sitting, and where visitors came from entirely dark.
 *
 * This is the other half, kept deliberately thin:
 *
 * - **A visit is a tab, not a person.** The id lives in `sessionStorage`, so it dies
 *   with the tab and never follows anyone between visits. Not a cookie, not
 *   localStorage — those would make it an identifier, which is exactly what play
 *   telemetry refuses to have and what this must not smuggle in through the back door.
 * - **No game identity here.** `play_started` counts plays; it does not say which game.
 *   Which game was played is play telemetry's business, and keeping the slug out means
 *   these two streams cannot be joined into a browsing history for one tab.
 * - **Acquisition is coarse by construction.** A referrer becomes a bare hostname or
 *   nothing; UTM values are lowercased, length-capped, and character-filtered. Full
 *   URLs and query strings are where personal data hides, so neither is ever sent.
 */

export type VisitEvent =
  | {
      type: 'visit_started';
      entry: VisitRouteKind;
      /** Bare hostname of the external referrer; absent means direct or internal. */
      referrer?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
    }
  | { type: 'route_viewed'; route: VisitRouteKind }
  // A published game began playing. Intentionally carries no slug.
  | { type: 'play_started'; via?: PlayVia }
  /**
   * The player opened the "How to play" card. No slug, for the same reason
   * `play_started` carries none: the visit stream must stay unjoinable with the play
   * stream. What this answers is how often players need the controls spelled out —
   * and, with `via`, whether they found the bar control or had to dig into More.
   *
   * Recorded only for published plays (same population as `play_started`). Every open
   * of the *current* theater card is kept: `reopen: true` marks a second-or-later open
   * of that card, so multi-game sittings that open each game once are not counted as
   * "the card did not answer". Distinct-visit rates are derived on the read side.
   */
  | { type: 'how_to_play_opened'; via: HowToPlayVia; reopen?: true }
  /**
   * A step of the creation funnel was reached. Carries no prompt text, ever.
   * Optional `builder` dimensions platform vs self-build once the creator has chosen.
   */
  | { type: 'create_step'; step: CreateStep; builder?: BuilderDimension }
  /** A step of the closed-beta waitlist funnel. Carries no identity, ever. */
  | { type: 'waitlist_step'; step: WaitlistStep }
  | { type: 'invite_step'; step: InviteStep }
  | { type: 'beta_welcome_step'; step: BetaWelcomeStep }
  /**
   * Studio / self-build funnel facts on the same visit stream as `create_step`.
   * Always carries `builder` so BYOCA reach-to-publish is measurable without a
   * parallel stream. No game slug, no uid — visit-scoped only.
   */
  | { type: 'studio_step'; step: StudioStep; builder: BuilderDimension; detail?: StudioStepDetail }
  | { type: 'editor_step'; step: EditorStep }
  | { type: 'assist_step'; step: AssistStep }
  | { type: 'remix_step'; step: RemixStep; via?: RemixPaintedVia; control?: RemixControl }
  | { type: 'code_step'; step: CodeStep }
  | {
      type: 'cli_step';
      step: CliStep;
      channel?: CliInstallChannel;
      os?: CliPlatformOs;
      adapter?: CliAdapter;
      stage?: CliVerifyStage;
    }
  | {
      type: 'code_completion';
      kind: CodeCompletionKind;
      outcome: CodeCompletionOutcome;
      latencyMs: number;
      candidateCount?: number;
      completionChars?: number;
    };

// Untrusted input from a URL — the runtime check, not just the type.
export function isPlayVia(value: unknown): value is PlayVia {
  return typeof value === 'string' && (PLAY_VIAS as readonly string[]).includes(value);
}

/** Who builds the round — closed enum; reaches a grouping key. */
export type BuilderDimension = 'platform' | 'self';

const FLUSH_AT = 5;
const MAX_BATCH = 25;
const MAX_EVENTS_PER_VISIT = 200;
const MAX_COMPLETION_EVENTS_PER_VISIT = 50;
const MAX_UTM_LENGTH = 40;
const MAX_REFERRER_LENGTH = 80;
/** Ceiling on a reported offset. Beyond this a visit is not a visit. */
const MAX_VISIT_MS = 24 * 60 * 60 * 1000;

const VISIT_ID_KEY = 'gdpl.visit.id';
const VISIT_START_KEY = 'gdpl.visit.startedAt';

export type WireVisitEvent = VisitEvent & { msSinceStart: number };

export type VisitTelemetrySend = (body: {
  visitId: string;
  flushMsSinceStart: number;
  events: WireVisitEvent[];
}) => void;

export const sendVisitTelemetry: VisitTelemetrySend = (body) => {
  void fetch(`${API_BASE}/api/telemetry/visit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    keepalive: true,
    body: JSON.stringify(body),
  }).catch(() => {
    /* telemetry is best-effort by design */
  });
};

/**
 * The external site a visit came from, reduced to a bare hostname.
 *
 * Same-host referrers are dropped rather than recorded: an internal navigation is not
 * an acquisition, and counting it would make every funnel look like it had a huge
 * "from gamedev.pl" channel. `www.` is stripped so one site groups as one row.
 * Anything unparseable disappears — a referrer is never worth a broken event.
 */
export function referrerDomain(referrer: string, currentHost: string): string | undefined {
  if (!referrer) return undefined;
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    return undefined;
  }
  if (!host) return undefined;
  const normalized = host.replace(/^www\./, '').toLowerCase();
  const currentNormalized = currentHost.replace(/^www\./, '').toLowerCase();
  if (!normalized || normalized === currentNormalized) return undefined;
  return normalized.slice(0, MAX_REFERRER_LENGTH);
}

/**
 * One UTM value, or nothing.
 *
 * Campaign parameters are attacker- and marketer-supplied strings that end up in a
 * grouping key, so they are filtered to a conservative alphabet rather than escaped
 * later: a value that cannot express punctuation cannot smuggle a URL, an email
 * address, or markup into an aggregate someone reads.
 */
export function sanitizeUtm(value: string | null): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().toLowerCase().slice(0, MAX_UTM_LENGTH);
  if (!cleaned) return undefined;
  return /^[a-z0-9._-]+$/.test(cleaned) ? cleaned : undefined;
}

/** The three UTM fields worth grouping by, read from a real query string. */
export function utmFields(
  search: string,
): Pick<Extract<VisitEvent, { type: 'visit_started' }>, 'utmSource' | 'utmMedium' | 'utmCampaign'> {
  const params = new URLSearchParams(search);
  const utmSource = sanitizeUtm(params.get('utm_source'));
  const utmMedium = sanitizeUtm(params.get('utm_medium'));
  const utmCampaign = sanitizeUtm(params.get('utm_campaign'));
  return {
    ...(utmSource === undefined ? {} : { utmSource }),
    ...(utmMedium === undefined ? {} : { utmMedium }),
    ...(utmCampaign === undefined ? {} : { utmCampaign }),
  };
}

/**
 * The current route's kind, read through the app's own router.
 *
 * Deliberately delegating to `parsePathRoute` rather than matching the path here:
 * routing has already changed shape once (hash fragments → real paths), and an
 * analytics module with its own private copy of the URL grammar is exactly the thing
 * that keeps reporting `home` for months after such a move without anyone noticing.
 */
export function currentRouteKind(): VisitRouteKind {
  return routeKind(parsePathRoute(window.location.pathname, window.location.hash).view);
}

/**
 * Reads (or mints) the visit identity for this tab.
 *
 * `startedAt` is stored beside the id because a reload resets `performance.now()` while
 * the visit continues — without it, refreshing the page would restart the clock and
 * "time from landing to first play" would be wrong for exactly the visitors who
 * hesitated. Elapsed time is then a difference between two readings of one clock, and
 * the server still anchors the absolute instant itself, so a wrong client clock can
 * misreport its own duration (bounded by a clamp) and nothing else.
 *
 * Storage that throws — Safari private mode, storage disabled — falls back to an
 * in-memory identity for this document. A visit measured slightly worse beats a page
 * that fails to load.
 */
export function readVisitIdentity(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  now: number,
): {
  visitId: string;
  startedAt: number;
  isNew: boolean;
} {
  const fresh = { visitId: crypto.randomUUID(), startedAt: now, isNew: true };
  if (!storage) return fresh;
  try {
    const existingId = storage.getItem(VISIT_ID_KEY);
    const existingStart = Number(storage.getItem(VISIT_START_KEY));
    if (existingId && Number.isFinite(existingStart) && existingStart > 0) {
      return { visitId: existingId, startedAt: existingStart, isNew: false };
    }
    storage.setItem(VISIT_ID_KEY, fresh.visitId);
    storage.setItem(VISIT_START_KEY, String(fresh.startedAt));
    return fresh;
  } catch {
    return fresh;
  }
}

/**
 * Batches one visit's events. Free of React and of the DOM so the caps can be tested
 * directly — a limit that only exists inside an effect is a limit nobody can prove.
 */
export class VisitSession {
  private queue: WireVisitEvent[] = [];
  private accepted = 0;
  private acceptedCompletionEvents = 0;
  private acceptedCoreEvents = 0;
  private closed = false;

  constructor(
    readonly visitId: string,
    private readonly startedAt: number,
    private readonly send: VisitTelemetrySend = sendVisitTelemetry,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  private elapsed(): number {
    return Math.min(MAX_VISIT_MS, Math.max(0, Math.round(this.clock() - this.startedAt)));
  }

  get count(): number {
    return this.accepted;
  }

  record(event: VisitEvent): boolean {
    if (this.closed) return false;
    const isCompletion = event.type === 'code_completion';
    const laneCount = isCompletion ? this.acceptedCompletionEvents : this.acceptedCoreEvents;
    const laneLimit = isCompletion ? MAX_COMPLETION_EVENTS_PER_VISIT : MAX_EVENTS_PER_VISIT;
    if (laneCount >= laneLimit) return false;
    this.queue.push({ ...event, msSinceStart: this.elapsed() });
    this.accepted += 1;
    if (isCompletion) this.acceptedCompletionEvents += 1;
    else this.acceptedCoreEvents += 1;
    if (this.queue.length >= FLUSH_AT) this.flush();
    return true;
  }

  flush(): void {
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, MAX_BATCH);
    this.send({ visitId: this.visitId, flushMsSinceStart: this.elapsed(), events });
  }

  close(): void {
    this.flush();
    this.closed = true;
  }
}

/**
 * The one live session for this document.
 *
 * A singleton so distant call sites — the game player, most importantly — can report a
 * visit-level fact without threading a session through their props. Absent tracking
 * (tests, a standalone render) every report is a silent no-op, which is what keeps this
 * out of the way of code that has nothing to do with measurement.
 */
let currentSession: VisitSession | null = null;

export function recordVisitEvent(event: VisitEvent): void {
  currentSession?.record(event);
}

/**
 * The current visit's id, or null when tracking is absent (tests, a standalone render, a
 * visitor who never started a session). Read by the bug-report link so a reporter can hand
 * us a key into the server-side record instead of their own details.
 */
export function currentVisitId(): string | null {
  return currentSession?.visitId ?? null;
}

/**
 * Steps already recorded for the live visit, so each is counted once.
 *
 * A funnel step means "this visit got this far", not "this happened again": a creator
 * who types, hesitates, retypes and submits twice is one visit that reached submit, and
 * counting every keystroke would make the top of the funnel enormous and meaningless.
 * Deduping in the recorder rather than at each call site means a new call site cannot
 * get it wrong.
 */
let recordedSteps = new Set<CreateStep>();

export function recordCreateStep(step: CreateStep, builder?: BuilderDimension): void {
  if (!currentSession || recordedSteps.has(step)) return;
  recordedSteps.add(step);
  currentSession.record({
    type: 'create_step',
    step,
    ...(builder ? { builder } : {}),
  });
}

let recordedWaitlistSteps = new Set<WaitlistStep>();

export function recordWaitlistStep(step: WaitlistStep): void {
  if (!currentSession || recordedWaitlistSteps.has(step)) return;
  recordedWaitlistSteps.add(step);
  currentSession.record({ type: 'waitlist_step', step });
}

let recordedBetaInviteSteps = new Set<InviteStep>();

export function recordBetaInviteStep(step: InviteStep): void {
  if (!currentSession || recordedBetaInviteSteps.has(step)) return;
  recordedBetaInviteSteps.add(step);
  currentSession.record({ type: 'invite_step', step });
}

let recordedBetaWelcomeSteps = new Set<BetaWelcomeStep>();

export function recordBetaWelcomeStep(step: BetaWelcomeStep): void {
  if (!currentSession || recordedBetaWelcomeSteps.has(step)) return;
  recordedBetaWelcomeSteps.add(step);
  currentSession.record({ type: 'beta_welcome_step', step });
}

/**
 * Studio steps already recorded for the live visit.
 *
 * Keyed by `step:builder` or `step:builder:detail` so connect install vs kickoff,
 * gate green vs red, and platform vs self each count once without silencing
 * unrelated steps.
 */
let recordedStudioSteps = new Set<string>();

function studioStepKey(step: StudioStep, builder: BuilderDimension, detail?: StudioStepDetail): string {
  return detail ? `${step}:${builder}:${detail}` : `${step}:${builder}`;
}

export function recordStudioStep(step: StudioStep, builder: BuilderDimension, detail?: StudioStepDetail): void {
  if (!currentSession) return;
  const key = studioStepKey(step, builder, detail);
  if (recordedStudioSteps.has(key)) return;
  recordedStudioSteps.add(key);
  currentSession.record({
    type: 'studio_step',
    step,
    builder,
    ...(detail ? { detail } : {}),
  });
}

/**
 * Editor rungs already recorded this visit.
 *
 * A rung means "this visit got this far", so painting fifty tiles is one
 * `draft_saved` — the same dedupe the create and waitlist funnels use.
 */
let recordedEditorSteps = new Set<string>();

export function recordEditorStep(step: EditorStep): void {
  if (!currentSession) return;
  if (recordedEditorSteps.has(step)) return;
  recordedEditorSteps.add(step);
  currentSession.record({ type: 'editor_step', step });
}

/**
 * Assist outcomes already recorded this visit. Deduped like every other step
 * vocabulary: a creator who asks five things and gets five patches is one
 * `asked` and one `applied`.
 */
let recordedAssistSteps = new Set<string>();

export function recordAssistStep(step: AssistStep): void {
  if (!currentSession) return;
  if (recordedAssistSteps.has(step)) return;
  recordedAssistSteps.add(step);
  currentSession.record({ type: 'assist_step', step });
}

/**
 * Code-surface steps already recorded for the live visit — same one-rung-per-visit
 * dedupe as every other funnel here, so a creator who edits fifty lines across ten
 * files is one `edited`, not fifty.
 */
let recordedCodeSteps = new Set<CodeStep>();

export function recordCodeStep(step: CodeStep): void {
  if (!currentSession || recordedCodeSteps.has(step)) return;
  recordedCodeSteps.add(step);
  currentSession.record({ type: 'code_step', step });
}

export type RecordCliStepInput = {
  step: CliStep;
  channel?: CliInstallChannel;
  os?: CliPlatformOs;
  adapter?: CliAdapter;
  stage?: CliVerifyStage;
};

let recordedCliSteps = new Set<string>();

function cliStepKey(input: RecordCliStepInput): string {
  return [input.step, input.channel, input.os, input.adapter, input.stage].filter(Boolean).join(':');
}

export function recordCliStep(input: RecordCliStepInput): void {
  if (!currentSession) return;
  const key = cliStepKey(input);
  if (recordedCliSteps.has(key)) return;
  recordedCliSteps.add(key);
  currentSession.record({
    type: 'cli_step',
    step: input.step,
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.os ? { os: input.os } : {}),
    ...(input.adapter ? { adapter: input.adapter } : {}),
    ...(input.stage ? { stage: input.stage } : {}),
  });
}

const MAX_COMPLETION_LATENCY_MS = 30_000;
const MAX_COMPLETION_CANDIDATES = 5_000;
const MAX_COMPLETION_CHARS = 4_000;

function boundedCompletionMetric(value: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.round(value))) : 0;
}

export function recordCodeCompletion(input: {
  kind: CodeCompletionKind;
  outcome: CodeCompletionOutcome;
  latencyMs: number;
  candidateCount?: number;
  completionChars?: number;
}): void {
  if (!currentSession) return;
  const latencyMs = boundedCompletionMetric(input.latencyMs, MAX_COMPLETION_LATENCY_MS);
  const candidateCount =
    input.candidateCount === undefined
      ? undefined
      : boundedCompletionMetric(input.candidateCount, MAX_COMPLETION_CANDIDATES);
  const completionChars =
    input.completionChars === undefined
      ? undefined
      : boundedCompletionMetric(input.completionChars, MAX_COMPLETION_CHARS);
  currentSession.record({
    type: 'code_completion',
    kind: input.kind,
    outcome: input.outcome,
    latencyMs,
    ...(candidateCount === undefined ? {} : { candidateCount }),
    ...(completionChars === undefined ? {} : { completionChars }),
  });
}

let recordedRemixSteps = new Set<string>();

export function recordRemixStep(step: RemixStep, options?: { via?: RemixPaintedVia; control?: RemixControl }): void {
  if (!currentSession) return;
  if (recordedRemixSteps.has(step)) return;
  recordedRemixSteps.add(step);
  // Dedupe means the via is the *first* door of the visit — which is the right
  // reading: the question is which door brought someone to the brush at all.
  // The same applies to `control`, and the offset the session stamps on the event
  // is therefore the time to the *first* open, which is the "when" worth having.
  currentSession.record({
    type: 'remix_step',
    step,
    ...(options?.via ? { via: options.via } : {}),
    ...(options?.control ? { control: options.control } : {}),
  });
}

/** Test seam: installs a session without touching the DOM. */
export function setVisitSessionForTesting(session: VisitSession | null): void {
  currentSession = session;
  // Otherwise one test's steps would silence the next test's identical steps.
  recordedSteps = new Set();
  recordedWaitlistSteps = new Set();
  recordedBetaInviteSteps = new Set();
  recordedBetaWelcomeSteps = new Set();
  recordedStudioSteps = new Set();
  recordedEditorSteps = new Set();
  recordedAssistSteps = new Set();
  recordedRemixSteps = new Set();
  recordedCodeSteps = new Set();
  recordedCliSteps = new Set();
}

export interface StartVisitTrackingOptions {
  send?: VisitTelemetrySend;
  clock?: () => number;
}

/**
 * Starts visit tracking for this document and returns a teardown.
 *
 * Mounted from the entry point rather than from a component: the first event has to be
 * the visit itself, and a component tree that renders a route has already decided what
 * the visit is by the time it mounts.
 */
export function startVisitTracking(options: StartVisitTrackingOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {};

  const clock = options.clock ?? (() => Date.now());
  let storage: Storage | null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Safari private mode and hardened settings throw on access, not on use.
    storage = null;
  }

  const identity = readVisitIdentity(storage, clock());
  const session = new VisitSession(identity.visitId, identity.startedAt, options.send, clock);
  currentSession = session;
  // A reload continues the visit but re-runs this module, so the funnel would silently
  // stop deduping across it if these were not cleared with the session that owns them.
  recordedSteps = new Set();
  recordedWaitlistSteps = new Set();
  recordedBetaInviteSteps = new Set();
  recordedBetaWelcomeSteps = new Set();
  recordedStudioSteps = new Set();

  if (identity.isNew) {
    const referrer = referrerDomain(document.referrer ?? '', window.location.hostname);
    session.record({
      type: 'visit_started',
      entry: currentRouteKind(),
      ...(referrer === undefined ? {} : { referrer }),
      ...utmFields(window.location.search),
    });
    // Sent immediately rather than batched: a visit nobody hears about is a hole in the
    // denominator of every ratio downstream, and a bounced tab runs no cleanup.
    session.flush();
  }

  let lastKind = currentRouteKind();
  function onNavigation() {
    const kind = currentRouteKind();
    // Movement within one kind (game to game, clause to clause) is not a funnel step;
    // how many games got played is `play_started`'s job, not this one's.
    if (kind === lastKind) return;
    lastKind = kind;
    session.record({ type: 'route_viewed', route: kind });
  }

  /**
   * Three signals, because no one of them sees every navigation:
   *
   * - `NAVIGATE_EVENT` — programmatic pushes, which the browser is silent about. The
   *   app announces them so nothing has to patch `history` to find out.
   * - `popstate` — back and forward.
   * - `hashchange` — fragment-only edits (a join credential lives in the fragment).
   *
   * The event's `detail.path` is deliberately not read: `currentRouteKind()` re-reads
   * `window.location`, which is the truth, and the event is dispatched after the URL
   * has already changed. That keeps this correct even for navigations that carry state
   * this module has never heard of — including the `/ay|/ai → /play` canonicalisation,
   * which is a `replaceState` and announces nothing at all.
   */
  window.addEventListener(NAVIGATE_EVENT, onNavigation);
  window.addEventListener('popstate', onNavigation);
  window.addEventListener('hashchange', onNavigation);

  function onHide() {
    if (document.visibilityState === 'hidden') session.flush();
  }
  document.addEventListener('visibilitychange', onHide);

  return () => {
    window.removeEventListener(NAVIGATE_EVENT, onNavigation);
    window.removeEventListener('popstate', onNavigation);
    window.removeEventListener('hashchange', onNavigation);
    document.removeEventListener('visibilitychange', onHide);
    session.close();
    if (currentSession === session) currentSession = null;
  };
}
