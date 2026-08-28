/**
 * What the player shell reports about a play session (docs/improvement-loop-plan.md IL-1).
 *
 * `game_opened` / `play_time` / `game_closed` are emitted by the app itself, so the
 * funnel never depends on a game cooperating. `error` and `alive` come from the bridge
 * injected into the game's iframe, and are the cheapest reliable answer to "is this
 * published game actually broken for real players". `progress` / `score` / `end` arrive
 * only from games that opt into the games-repo telemetry module, which does not exist
 * yet — the shapes are accepted now so adding it later needs no API change.
 *
 * Deliberately **not** attributed: no uid, no IP, no user agent. A session id is
 * generated per game-open and never persisted anywhere in the browser, so these rows
 * answer "how did this game do" and cannot answer "what did this person play".
 */
export type TelemetryEventType =
  | 'game_opened'
  | 'play_time'
  | 'game_closed'
  | 'error'
  | 'alive'
  | 'progress'
  | 'score'
  | 'end'
  /** How far an open got towards a shared P3 zone; `step` carries the rung. */
  | 'zone_link';

export interface TelemetryEvent {
  /**
   * Game identity: the games-repo slug.
   *
   * Not the submission's issue number. The catalog is built straight from the games
   * repo ([github-client.ts](./github-client.ts) `getCatalog`), so the slug is the only
   * identity every playable game has — most predate the submission flow and have no
   * `submissions/{jobId}` document at all. IL-2 can join to a submission at read
   * time via `getSubmissionBySlug` when it needs a creator to notify.
   */
  slug: string;
  /** Ephemeral per-open id from the shell. Never a uid. */
  sessionId: string;
  type: TelemetryEventType;
  /**
   * When the event happened, anchored server-side.
   *
   * Derived from the flush's arrival time minus the event's own age within the session,
   * so it is a real instant even though events are batched. Receipt time is the
   * fallback when a client sends no offsets. Never a client wall-clock reading.
   */
  at: string;
  /**
   * Milliseconds from session open to this event, from the browser's monotonic clock.
   * The trustworthy measure of *within-session* timing — ordering and drop-off depend
   * on it, since several events dated from one flush can share a rounded `at`.
   */
  msSinceOpen?: number;
  /** `play_time`: seconds of focused play this heartbeat covers. */
  seconds?: number;
  /** `alive`: animation frames observed since the previous tick. 0 means stalled. */
  frames?: number;
  /** `game_opened`: connected controller slots, when the game was opened as a party. */
  slots?: number;
  /** `error`: bounded, truncated message. Never a stack — that is a code-leak channel. */
  message?: string;
  /** `progress`: label from a bounded per-session set. */
  label?: string;
  /** `score`: the reported value, range-checked by the shell. */
  value?: number;
  /** `end`: how the session finished. */
  outcome?: 'won' | 'lost' | 'quit';
  /** `zone_link`: how far this open got towards a shared world. */
  step?: 'admitted' | 'joined' | 'lost';
  /**
   * `progress` / `end`: optional render backend from the game snapshot (B18).
   * Fixed vocabulary only — never free text.
   */
  gfxBackend?: 'canvas2d' | 'webgl' | 'webgl3d';
}

/**
 * A visit-level event: how a sitting went, never who had it.
 *
 * Separate from `TelemetryEvent` because the two answer different questions and must
 * not be joinable. A play event names a game and not a visit; a visit event names a
 * visit and never a game. Holding that line in the type is what stops "which games did
 * this tab play, in order" from becoming derivable later by someone adding one
 * innocuous-looking field.
 */
export interface VisitEvent {
  /** Per-tab uuid from `sessionStorage`. Dies with the tab; never a uid. */
  visitId: string;
  type:
    | 'visit_started'
    | 'route_viewed'
    | 'play_started'
    | 'how_to_play_opened'
    | 'create_step'
    | 'waitlist_step'
    | 'invite_step'
    | 'beta_welcome_step'
    | 'studio_step'
    | 'editor_step'
    | 'assist_step'
    | 'remix_step'
    | 'code_step'
    | 'code_completion'
    | 'cli_step';
  /** Server-anchored instant, derived like `TelemetryEvent.at`. */
  at: string;
  /** Milliseconds from visit start — the trustworthy measure of within-visit timing. */
  msSinceStart: number;
  /** `visit_started`: the route kind the visit landed on. Never its parameters. */
  entry?: string;
  /** `route_viewed`: the route kind now shown. Never its parameters. */
  route?: string;
  /**
   * `create_step` / `waitlist_step` / `studio_step` / `editor_step` /
   * `assist_step` / `remix_step` / `code_step`: which funnel step or outcome this
   * visit reached. `code_step` never carries a file path or source text — see its
   * type definition in the web client for the closed vocabulary.
   */
  step?: string;
  /**
   * `create_step` / `studio_step`: who builds the round (`platform` | `self`).
   * Optional on legacy create_step rows; required on studio_step. Never a game identity.
   */
  builder?: string;
  /**
   * `studio_step`: closed detail (`install` | `kickoff` | `header` | `cursor` | `vscode` |
   * `green` | `red` | `kit_outdated` | `creator` | `agent` for `round_opened`).
   * Never free text, never a game identity.
   */
  detail?: string;
  /**
   * `how_to_play_opened`: which chrome surface opened the card (`bar` | `more`).
   * `remix_step` with `step: 'painted'`: which door led to the painter
   * (`redirect` | `menu`). Absent on events recorded before the field existed;
   * never a game identity.
   */
  via?: string;
  /**
   * `remix_step` with `step: 'offered'` or `'opened'`: which control it was —
   * `page` (the preview-first game page), `bar` (the chrome bar), or `more` (the
   * overflow menu it sheds into on narrow screens).
   *
   * Its own field rather than a new meaning for `via` (what led someone to the
   * painter) or `entry` (the route a visit landed on) — both already mean
   * something, and a field with two meanings makes every historical row
   * ambiguous. Absent on events recorded before it existed; never a game identity.
   */
  control?: string;
  kind?: string;
  outcome?: string;
  latencyMs?: number;
  candidateCount?: number;
  completionChars?: number;
  /**
   * `how_to_play_opened`: true when this open is a second-or-later open of the *same*
   * theater card (same published play). Absent means first open — or a legacy event
   * recorded before the field existed. Never a game identity.
   */
  reopen?: boolean;
  /** `visit_started`: bare hostname of an external referrer. Never a full URL. */
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  channel?: string;
  os?: string;
  adapter?: string;
  stage?: string;
}

/**
 * How long a raw play event is kept. Aggregates outlive it; the rows themselves do not.
 *
 * Ninety days is the promise docs/improvement-loop-plan.md makes, and until this
 * constant existed it was a promise nothing enforced — the collection simply grew.
 */
export const TELEMETRY_RETENTION_DAYS = 90;

/**
 * The Firestore field a TTL policy watches, and the collection group it lives in.
 *
 * Exported because the policy is applied out-of-band with `gcloud firestore fields
 * ttls update`, and a policy naming a different field or group than the writer uses is
 * a silent no-op — nothing deletes, and nobody notices until a privacy question is
 * asked. Keeping both names in one place means the deploy note and the code cannot
 * drift apart quietly.
 */
export const TELEMETRY_TTL_FIELD = 'expiresAt';

/**
 * Telemetry's own collection group, deliberately *not* `events`.
 *
 * A TTL policy is scoped to a collection group, not to a path, so sharing the name
 * `events` with `submissions/{n}/events` would put one retention rule over both
 * ephemeral play data and durable build history. They have opposite lifetimes, so they
 * get separate groups.
 */
export const TELEMETRY_COLLECTION = 'playEvents';

/**
 * Visit telemetry's collection group, separate from `playEvents` for the same reason
 * that one is separate from `events`: a TTL policy is scoped to a group.
 *
 * Its policy is live (created 2026-07-26) and [setup-gcp.sh](../../../infra/setup-gcp.sh)
 * step 6/6 now provisions every group in one loop rather than naming `playEvents` alone.
 *
 * ⚠️ **Adding a third stream? Add its group to that loop in the same change.** A group
 * without a policy still writes `expiresAt` — nothing errors, nothing expires, and the
 * retention promise quietly stops covering it. That is exactly how this one shipped
 * uncovered for a day.
 */
export const VISIT_COLLECTION = 'visitEvents';

/**
 * When a play event becomes deletable: its own event time plus the retention window.
 *
 * Anchored to `at` rather than to write time on purpose. `at` can be back-dated by up
 * to six hours for a late flush, and retention is a promise about how long we keep data
 * describing a play — not about how long after we happened to receive it.
 */
export function telemetryExpiresAt(at: string): Date {
  const eventTime = Date.parse(at);
  // An unparseable timestamp must not become an immortal row: fall back to now, which
  // is never later than the event it stands in for.
  const anchor = Number.isFinite(eventTime) ? eventTime : Date.now();
  return new Date(anchor + TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
