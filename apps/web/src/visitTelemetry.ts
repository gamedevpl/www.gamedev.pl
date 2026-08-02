import { NAVIGATE_EVENT, parsePathRoute } from './router.js';

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

/** Where a visit is, coarsely. Route parameters (tokens, slugs) never travel. */
export type VisitRouteKind = 'home' | 'play' | 'draft' | 'status' | 'join' | 'legal' | 'health' | 'studio' | 'notFound';

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
  /** A published game began playing. Intentionally carries no slug. */
  | { type: 'play_started' }
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
  /**
   * Studio / self-build funnel facts on the same visit stream as `create_step`.
   * Always carries `builder` so BYOCA reach-to-publish is measurable without a
   * parallel stream. No game slug, no uid — visit-scoped only.
   */
  | { type: 'studio_step'; step: StudioStep; builder: BuilderDimension; detail?: StudioStepDetail }
  | { type: 'editor_step'; step: EditorStep };

/**
 * The creation funnel, in the order a creator meets it.
 *
 * `signin_required` is the one that matters most: it is the wall an anonymous visitor
 * hits after writing their idea, and the only place the drop-off between "wanted to
 * make a game" and "made an account" is visible at all. Everything before it happens
 * with no session, which is exactly why these live in the anonymous visit stream
 * rather than alongside the signed-in submission record.
 */
export type CreateStep =
  /** First keystroke in the prompt box — intent, before anything is committed. */
  | 'prompt_started'
  /** Pressed the button with real content. Wanting a game, not yet allowed one. */
  | 'spec_submitted'
  /** The sign-in wall appeared because there was no session. */
  | 'signin_required'
  /** The QA gate returned clarifying questions instead of building immediately. */
  | 'qa_shown'
  /**
   * The creator settled on a name and pressed create. The last step they control, and
   * the one the build waits on — a drop here is someone who wrote an idea, was shown
   * what it would be called, and walked away.
   */
  | 'title_confirmed'
  /** A submission actually reached the games repo. */
  | 'submission_created';

/**
 * The closed-beta waitlist funnel, in the order a visitor meets it.
 *
 * The Join CTA is visible before sign-in; `cta_clicked` is intent, and `joined` is the
 * successful write after an ID token arrives. Sign-in itself is not a rung here — the
 * drop between click and join *is* the sign-in wall, and inventing a middle step would
 * double-count it against the creation funnel's `signin_required`.
 */
export type WaitlistStep =
  /** Pressed Join the waitlist on the splash. */
  | 'cta_clicked'
  /** `POST /api/waitlist` succeeded for this visit. */
  | 'joined';

/**
 * Which chrome surface opened the How to play card.
 *
 * Closed enum: the value reaches a grouping key. `bar` is the theater-bar button;
 * `more` is the same control after it sheds into the overflow menu on a narrow viewport.
 * Deep-link vs arcade is *not* here — that is visit `entry`, already on `visit_started`.
 */
export type HowToPlayVia = 'bar' | 'more';

/** Who builds the round — closed enum; reaches a grouping key. */
export type BuilderDimension = 'platform' | 'self';

/**
 * Studio-side creator-funnel steps (BY-08). Sibling to `create_step`, not a rung of
 * that ordered funnel — these answer builder choice, connect friction, time to first
 * agent signal (`msSinceStart` on `agent_signaled`), and gate verdict per visit.
 */
export type StudioStep = 'builder_chosen' | 'connect_copied' | 'agent_signaled' | 'gate_verdict';

/**
 * Closed detail for studio steps that need one. `install` / `kickoff` are connect-card
 * copies; `green` / `red` / `kit_outdated` are gate verdicts. Absent on steps that
 * need none (builder choice, first agent signal).
 */
export type StudioStepDetail = 'install' | 'kickoff' | 'green' | 'red' | 'kit_outdated';

/**
 * The content-editor funnel (EditorKit): did a creator who *can* edit actually
 * open the editor, change something, try it, and ship it?
 *
 * This is the revision half of question 5 (creator return). Publishing a game
 * was already measurable; editing it was not, so a creator who came back to
 * retune their maps looked identical to one who opened the Studio and left.
 *
 * No slug, deliberately — the visit stream must stay unjoinable to the play
 * stream, so this answers "how far did this sitting get" and never "which game
 * did they edit".
 */
export type EditorStep = 'opened' | 'draft_saved' | 'previewed' | 'published';

const FLUSH_AT = 5;
const MAX_BATCH = 25;
/** A tab that exceeds this is looping, not browsing. */
const MAX_EVENTS_PER_VISIT = 200;
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
 * The route's kind, with every parameter discarded.
 *
 * Status and join routes carry capability tokens; play and draft carry a slug.
 * Reducing to the bare view name here is what guarantees none of them can reach the
 * wire, rather than relying on each call site to remember.
 */
export function routeKind(view: string): VisitRouteKind {
  switch (view) {
    case 'play':
    case 'draft':
    case 'join':
    case 'legal':
    case 'studio':
    case 'notFound':
      return view;
    // The console reports as `health`, the name it had when the funnel started
    // recording it. Renaming the bucket would split one surface's history in two.
    case 'admin':
      return 'health';
    // Contact shares the public-chrome posture of legal pages (reachable without a
    // session, outside the creator funnel). Folding it into `legal` keeps the
    // visit vocabulary stable without inventing a new funnel bucket for a form.
    case 'contact':
      return 'legal';
    default:
      return 'home';
  }
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
    if (this.closed || this.accepted >= MAX_EVENTS_PER_VISIT) return false;
    this.queue.push({ ...event, msSinceStart: this.elapsed() });
    this.accepted += 1;
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

/** Test seam: installs a session without touching the DOM. */
export function setVisitSessionForTesting(session: VisitSession | null): void {
  currentSession = session;
  // Otherwise one test's steps would silence the next test's identical steps.
  recordedSteps = new Set();
  recordedWaitlistSteps = new Set();
  recordedStudioSteps = new Set();
  recordedEditorSteps = new Set();
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
