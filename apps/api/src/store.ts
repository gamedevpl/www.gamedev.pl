import { createHash, randomUUID } from 'node:crypto';
import { Firestore, type DocumentData } from '@google-cloud/firestore';
import type { BuildEvent, SubmissionStatus } from './submission-status.js';

/**
 * Uid namespace for automation accounts (docs/agent-access-tokens.md).
 *
 * Alongside `g:` (Google) and `dev:` (local sign-in). Keeping bots in their own
 * namespace is what lets product measurement tell them apart from people — the creator
 * metrics exclude them by this prefix — and it is why minting a token cannot
 * accidentally call a mistyped `g:` account into existence.
 */
export const BOT_UID_PREFIX = 'bot:';

export interface User {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  createdAt: string;
  lastLoginAt: string;
  tier: 'standard' | 'trusted' | 'blocked';
  /** Preferred locale for outbound email (defaults to 'en' when unset). */
  locale?: string;
  /** Global one-click email kill switch — set by the unsubscribe endpoint. */
  emailUnsubscribedAt?: string | null;
  /**
   * Recent days (`yyyy-mm-dd`) on which this account made an authenticated request,
   * newest first and capped at `ACTIVE_DAYS_KEPT`.
   *
   * A list rather than a `lastSeenAt` instant because the question is "did this creator
   * come back within 7 days of publishing", and a single latest-seen timestamp cannot
   * answer it: someone who returned on day 2 and again on day 30 looks identical to
   * someone who only ever returned on day 30. Days rather than timestamps keeps it to
   * one write per account per day instead of one per request.
   */
  activeDays?: string[];
}

/** How much return history a user document carries. Two weeks covers a D7 question. */
export const ACTIVE_DAYS_KEPT = 14;

/**
 * Adds `dateStr` to a user's activity list, newest first, or returns null when it is
 * already the most recent entry.
 *
 * Returning null is what makes this cheap: the caller skips the write entirely, so a
 * creator refreshing all afternoon costs one write, not hundreds.
 */
export function withActiveDay(existing: string[] | undefined, dateStr: string): string[] | null {
  const days = existing ?? [];
  if (days[0] === dateStr) return null;
  return [dateStr, ...days.filter((day) => day !== dateStr)].slice(0, ACTIVE_DAYS_KEPT);
}

export interface SubmissionRecord {
  issueNumber: number;
  ownerUid: string;
  createdAt: string;
  title: string;
  /**
   * Game directory on the agent's branch, learned the first time a status poll sees
   * one. It is what makes an in-progress game addressable by slug (like a published
   * game) instead of only by its capability-granting status token.
   */
  slug?: string;
  /**
   * When we first observed the game published. Together with createdAt it is the
   * only record of how long a build actually took, which is what lets the status
   * page answer "how long will this take?" with a real number instead of a shrug.
   */
  publishedAt?: string;
  /**
   * Set when the creator abandoned the build. A terminal state of its own: the
   * issue and any open PR are closed, and the status page stops deriving from
   * GitHub entirely (an abandoned build must not read as "needs a tweak").
   */
  abandonedAt?: string;
  /**
   * How many clarifying questions the creator actually answered before this was
   * submitted — 0 when they skipped the QA panel or it had nothing to ask.
   *
   * Derived from the concept that reached the agent rather than reported by the
   * client, so it measures what the build was really given. It is what lets
   * "does answering questions produce a better game?" be asked at all: join it
   * to the slug's play telemetry (question 6) once enough clarified games exist.
   */
  clarificationCount?: number;
  /**
   * The status we last emitted a notification for. Drives transition detection
   * (only notify when the mapped event changes) and lets the sweep stop scanning
   * a submission once it reaches a terminal, already-notified state.
   */
  lastNotifiedStatus?: SubmissionStatus;
  /**
   * The last status actually derived from GitHub, recorded on every derivation.
   *
   * Distinct from `lastNotifiedStatus`, which only moves when a *notification* is
   * emitted — `queued` and `publishing` map to no event at all, and `in_review`
   * shares one with `building`, so a submission can sit at `lastNotifiedStatus:
   * 'building'` while it is really being play-tested. Fine for deciding whether to
   * ping someone; wrong for showing them what their game is doing.
   */
  lastStatus?: SubmissionStatus;
  /**
   * The language the creator submitted in. Told to the agent over the build channel
   * so it can write its progress updates in that language directly — which beats
   * machine-translating them afterwards, and costs us nothing.
   */
  locale?: string;
}

/**
 * A change request from the creator, queued for the agent to collect over the build
 * channel (docs/agent-live-channel-plan.md §4). The PR comment remains the durable
 * record and the thing that *wakes* a stopped agent; this queue is the fast path for
 * one that is already working.
 */
export interface CreatorMessage {
  id: string;
  text: string;
  createdAt: string;
  /** Set once an agent has collected it. Undelivered messages are re-served. */
  deliveredAt?: string | null;
}

/**
 * A screenshot the agent pushed over the build channel rather than committing.
 *
 * Committed media only exists once the agent has run capture and pushed, which is
 * late in a build; this is the path that can put a picture on the creator's screen
 * in the first minutes. Bytes live here as base64 because a pixel-art PNG at these
 * sizes is tens of kilobytes — comfortably inside a Firestore document, and not
 * worth a bucket, its IAM, and a retention job.
 */
export interface BuildShot {
  id: string;
  /** base64-encoded PNG. */
  data: string;
  /** Agent-authored caption in English, already sanitized. */
  label?: string;
  /** The same caption in `locale`, authored rather than machine translated. */
  labelLocalized?: string;
  locale?: string;
  createdAt: string;
}

/** A shot without its bytes — what a listing needs. */
export type BuildShotSummary = Omit<BuildShot, 'data'>;

/**
 * A playable build of the game as it stood at some moment, pushed before any commit.
 *
 * A screenshot answers "what does it look like"; this answers "does it play", which is
 * the only question a creator can really judge a game by. It is the same self-contained
 * offline HTML the site serves for a published game — one file, no assets, capped by the
 * games repo's own bundle budget — so whatever plays a published game plays this.
 *
 * Bytes live here as base64 for the same reason shots do: an assembled bundle is a couple
 * of hundred kilobytes, which sits inside a Firestore document with room to spare, and a
 * preview that is obsolete within minutes is not worth a bucket and a retention job.
 *
 * This is unreviewed agent output. It has passed a build and a smoke run and nothing
 * else — no gate, no review, no merge. Whatever serves it must treat it as hostile.
 */
export interface BuildPreview {
  id: string;
  /** base64-encoded self-contained HTML document. */
  data: string;
  /** The game's slug, for a title the creator recognizes. */
  slug?: string;
  /** Agent-authored caption in English, already sanitized. */
  label?: string;
  /** The same caption in `locale`, authored rather than machine translated. */
  labelLocalized?: string;
  locale?: string;
  createdAt: string;
}

/** A preview without its bytes — what a listing needs. */
export type BuildPreviewSummary = Omit<BuildPreview, 'data'>;

export interface UsageCounters {
  submissions: number;
  previews: number;
  mocks: number;
  refines: number;
  feedback: number;
  playerFeedback: number;
  /** Creator-requested improvements on already-published games (studio control panel). */
  improvements: number;
}

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
  'game_opened' | 'play_time' | 'game_closed' | 'error' | 'alive' | 'progress' | 'score' | 'end';

export interface TelemetryEvent {
  /**
   * Game identity: the games-repo slug.
   *
   * Not the submission's issue number. The catalog is built straight from the games
   * repo ([github-client.ts](./github-client.ts) `getCatalog`), so the slug is the only
   * identity every playable game has — most predate the submission flow and have no
   * `submissions/{issueNumber}` document at all. IL-2 can join to a submission at read
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
  type: 'visit_started' | 'route_viewed' | 'play_started' | 'create_step';
  /** Server-anchored instant, derived like `TelemetryEvent.at`. */
  at: string;
  /** Milliseconds from visit start — the trustworthy measure of within-visit timing. */
  msSinceStart: number;
  /** `visit_started`: the route kind the visit landed on. Never its parameters. */
  entry?: string;
  /** `route_viewed`: the route kind now shown. Never its parameters. */
  route?: string;
  /** `create_step`: which step of the creation funnel this visit reached. */
  step?: string;
  /** `visit_started`: bare hostname of an external referrer. Never a full URL. */
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
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

// Transactional creator events (docs/notifications-plan.md). Deliberately minimal —
// queued/in_review are not notified. New types must pass the "would the user thank
// us?" test before being added.
export type NotificationType = 'submission.building' | 'submission.published' | 'submission.needs_changes';

export interface StoredNotification {
  /** Deterministic id (e.g. `sub-142-published`) so emission is idempotent. */
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  /** Set once a notification email has been sent, so retries don't re-send. */
  emailedAt: string | null;
  /**
   * i18n key + params rather than rendered text, so a language switch re-renders
   * old notifications correctly. The client calls t(titleKey, params).
   */
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  /** In-app destination, e.g. `/status/<token>` or `/play/<slug>`. */
  link: string;
}

// A browser Web Push subscription (docs/notifications-plan.md M2), stored verbatim
// as the client serialized it. Keyed by a hash of the endpoint so re-subscribing
// the same browser overwrites rather than duplicates.
export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

/**
 * A game's thumbs up/down (docs/improvement-loop-plan.md, signal source #2).
 *
 * Keyed by uid so a repeat vote is a revision, not a second ballot — the plan calls
 * this "low-risk but gameable"; dedupe by uid closes the cheap version of gaming it
 * (spamming one account), not the expensive one (many accounts), which nothing short
 * of identity verification closes and which this feature does not attempt.
 */
export type VoteValue = 'up' | 'down';

export interface GameVoteCounts {
  up: number;
  down: number;
}

/**
 * Free-text feedback from someone who played the game (docs/improvement-loop-plan.md,
 * signal source #1).
 *
 * Keyed by **slug**, not by the submission that built the game — `games/{slug}/playerFeedback/{id}`,
 * matching `games/{slug}/votes/{uid}`. The plan originally put this under
 * `submissions/{issueNumber}/playerFeedback/{id}` on the theory that a takedown removes it
 * with the submission; that repeats the exact mistake telemetry and votes both made and
 * corrected, since most published games (the ones with real play, i.e. real feedback) have
 * no submission document at all. Corrected here in the same change, like the votes move.
 *
 * Only accepted (post-moderation) text is ever written — a rejected submission is never
 * persisted in any form, so there is nothing here to review or reverse. No `expiresAt`:
 * unlike raw play/visit events, this is moderated, low-volume, uid-attributed content
 * meant to be read repeatedly (feedback-theme extraction, IL-2), so it follows the votes
 * precedent rather than the telemetry 90-day TTL.
 */
export interface PlayerFeedbackRecord {
  id: string;
  uid: string;
  text: string;
  createdAt: string;
}

/**
 * Attacker-controlled strings, quarantined in their own object on purpose.
 *
 * Everything else on a scorecard is a number this service computed. These two are
 * strings a *game* chose to emit from inside the sandbox — bounded in length and count,
 * arbitrary in content. They are safe to render to a human (React escapes them) and
 * unsafe to interpolate into a coding agent's instructions, which is exactly what IL-3
 * will want to do.
 *
 * A comment saying so has to be read to work; a field named `untrusted` has to be typed
 * out to be ignored. That is the whole reason this is a nested object rather than two
 * more fields alongside the numbers — destructuring the scorecard for a prompt cannot
 * pick these up by accident.
 */
export interface ScorecardUntrusted {
  /** Most frequent distinct error messages, worst first. */
  errorSamples: Array<{ message: string; count: number }>;
  /** Landmarks reached, most-reached first — the drop-off curve, when a game emits any. */
  progressLabels: Array<{ label: string; sessions: number }>;
  /**
   * Recurring themes distilled from written feedback, most-supported first.
   *
   * Empty when a game had too few notes to summarize, when extraction is switched off, or
   * when it failed — all three are an absence of evidence and must render as one. Belongs
   * here rather than beside `feedback.count` because a summary of player-written text
   * inherits that text's taint: safe to show an operator, never safe to hand an agent as
   * instruction. Optional because scorecards written before this existed do not have it.
   */
  feedbackThemes?: Array<{ theme: string; count: number }>;
}

/**
 * One game's rolling aggregate — the doc IL-3 reads instead of raw events.
 *
 * Stored at `games/{slug}/scorecard/current`. Deliberately carries **no player
 * identity**: it is built from play telemetry (which has none by construction) plus
 * vote and feedback *counts*, never the uids behind them and never feedback text.
 *
 * No `expiresAt` and no TTL policy. That is not an oversight — the retention promise is
 * about raw play rows, and an aggregate is what is supposed to outlive them. Adding this
 * collection group to the TTL loop in infra/setup-gcp.sh would delete the summaries and
 * keep nothing.
 *
 * **`null` means "no evidence", `0` means "measured zero".** The distinction is
 * load-bearing: a game that emits no endings and a game nobody finishes produce
 * identical event streams, so anything derived only from endings is null when there were
 * none. Renderers show `—` for null and must never coerce it to `0%`.
 */
export interface Scorecard {
  slug: string;
  /** When this doc was computed, so a stale sweep is visible rather than silent. */
  computedAt: string;
  /**
   * The window actually measured — the partitions read, not the ones requested, and
   * whether any read cap bit. A consumer that ignores `truncated` is reading floors as
   * if they were totals.
   */
  window: { days: string[]; truncated: boolean };
  sessions: {
    count: number;
    /** Sessions that opened but never accrued focused play time. */
    bounces: number;
    closes: number;
    medianPlaySeconds: number;
    totalPlaySeconds: number;
  };
  health: {
    errors: number;
    aliveTicks: number;
    stalledTicks: number;
    stallRate: number;
    /** Null when no trusted liveness tick was observed. */
    medianFps: number | null;
    resumeTicksIgnored: number;
  };
  depth: {
    outcomes: { won: number; lost: number; quit: number };
    sessionsWithEnding: number;
    /** Null when the game reported no endings at all — not the same as "nobody finished". */
    finishRate: number | null;
    /** Null when no round was decided. Quits are excluded, not counted as losses. */
    winRate: number | null;
    /** Null when nothing scored. */
    medianBestScore: number | null;
  };
  votes: { up: number; down: number };
  /** Count only. The text itself never reaches this doc; themes are a later IL-2 step. */
  feedback: { count: number };
  untrusted: ScorecardUntrusted;
}

export type WaitlistStatus = 'pending' | 'approved' | 'rejected';

export interface WaitlistEntry {
  uid: string;
  email?: string;
  name?: string;
  requestedAt: string;
  locale?: string;
  status: WaitlistStatus;
}

/**
 * A personal access token issued to a user account (docs/agent-access-tokens.md).
 *
 * Stored in its own top-level collection rather than on the user document, for one
 * blunt reason: `User` objects are returned to clients by `/api/auth/me` and the
 * sign-in routes, and a credential record that rides along on the user is one
 * forgotten `delete` away from being served to a browser. Keeping it in a separate
 * collection means that can never happen, and it makes the lookup a point read on
 * the token id rather than a scan.
 *
 * `secretHash` is `sha256` of the secret half — the token itself is never stored, so
 * an operator who can read this collection still cannot authenticate as anyone.
 */
export interface AccessTokenRecord {
  tokenId: string;
  uid: string;
  secretHash: string;
  /** Operator-supplied label, so a list of tokens is readable a month later. */
  name: string;
  createdAt: string;
  /** Who minted it — an admin uid. Kept so issuance is attributable after the fact. */
  createdByUid: string;
  /** Expiry is mandatory: a credential for automation should not outlive its purpose. */
  expiresAt: string;
  /**
   * Best-effort last-use stamp, written at most once a day (like `User.activeDays`)
   * so a busy agent costs one write rather than one per request. Its job is answering
   * "is this token still in use?" before revoking it, which a day's resolution covers.
   */
  lastUsedAt?: string;
}

export interface Store {
  getUser(uid: string): Promise<User | null>;
  upsertUser(userData: Partial<User> & { uid: string }): Promise<User>;
  /** Set (or clear, with null) the global email-unsubscribe timestamp for a user. */
  setEmailUnsubscribed(uid: string, at: string | null): Promise<void>;
  createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord>;
  getSubmission(issueNumber: number): Promise<SubmissionRecord | null>;
  setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void>;
  /** Records the status last derived from GitHub, whether or not it notified anyone. */
  setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void>;
  /** Records the game directory a submission is building, once it is known. */
  setSubmissionSlug(issueNumber: number, slug: string): Promise<void>;
  /** Stamps the moment a submission was first seen published (for build-time stats). */
  setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void>;
  /** Marks a submission abandoned by its creator. */
  setSubmissionAbandoned(issueNumber: number, at: string): Promise<void>;
  /** Records the creator's language, so the agent can report progress in it. */
  setSubmissionLocale(issueNumber: number, locale: string): Promise<void>;
  /** Records how many QA answers reached the agent with this submission. */
  setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void>;
  /** Appends an agent progress event. Returns it with its assigned id and timestamp. */
  appendBuildEvent(
    issueNumber: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildEvent>;
  /** Agent progress events for a build, newest first. */
  listBuildEvents(issueNumber: number, opts?: { limit?: number }): Promise<BuildEvent[]>;
  /** How many events a build has recorded — the cap that bounds a runaway agent. */
  countBuildEvents(issueNumber: number): Promise<number>;
  /** Stores a screenshot the agent pushed straight to us, before any commit. */
  appendBuildShot(
    issueNumber: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot>;
  /** A build's pushed screenshots, newest first. Bytes are omitted unless asked for. */
  listBuildShots(issueNumber: number, opts?: { limit?: number }): Promise<BuildShotSummary[]>;
  /** One pushed screenshot, bytes included — the read behind serving it. */
  getBuildShot(issueNumber: number, id: string): Promise<BuildShot | null>;
  /** How many screenshots a build has pushed — the cap that bounds a runaway agent. */
  countBuildShots(issueNumber: number): Promise<number>;

  appendBuildPreview(
    issueNumber: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview>;

  listBuildPreviews(issueNumber: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]>;

  getBuildPreview(issueNumber: number, id: string): Promise<BuildPreview | null>;

  countBuildPreviews(issueNumber: number): Promise<number>;

  /** Drops all but the newest `keep` previews, returning how many were removed. */
  pruneBuildPreviews(issueNumber: number, keep: number): Promise<number>;
  /** Queues a creator change request for the agent to collect. */
  appendCreatorMessage(issueNumber: number, text: string): Promise<CreatorMessage>;
  /** Undelivered creator messages, oldest first — the agent's inbox. */
  listPendingCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]>;
  /** Marks messages collected, so the agent is not handed the same request twice. */
  markCreatorMessagesDelivered(issueNumber: number, ids: string[]): Promise<void>;
  /**
   * Appends validated play-session events. Date-partitioned so a TTL policy can
   * expire a whole day at once and the aggregation job reads one partition rather
   * than fanning out across every submission.
   */
  appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void>;
  /** One day's events for a game — the read the aggregation job (IL-2) will use. */
  listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]>;
  /** Appends visit-level events to one day's partition. */
  appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void>;
  /** One day's visit events — funnel, depth, and acquisition reads. */
  listVisitEvents(dateStr: string, opts?: { visitId?: string; limit?: number }): Promise<VisitEvent[]>;
  /** Today's usage counters for a user, without incrementing anything. */
  getUsage(uid: string, dateStr: string): Promise<UsageCounters>;
  /** Most recently published submissions, newest first — the build-time sample. */
  listRecentlyPublished(limit: number): Promise<SubmissionRecord[]>;
  /**
   * Resolves a slug back to its submission — the lookup behind shareable draft
   * links. Returns null for a slug no submission has claimed.
   */
  getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null>;
  /**
   * Submissions the sweep should still check: those not yet in a terminal,
   * already-notified state (published / needs_changes recorded as last-notified).
   */
  listActiveSubmissions(): Promise<SubmissionRecord[]>;
  /**
   * Every submission a creator owns, newest first. Backs the "my games" rail, so a
   * creator finds their work-in-progress without having saved the tracking link
   * (and on a device that never had it in localStorage).
   */
  listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]>;
  checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }>;
  upsertWaitlistEntry(entry: { uid: string; email?: string; name?: string; locale?: string }): Promise<WaitlistEntry>;
  getWaitlistEntry(uid: string): Promise<WaitlistEntry | null>;
  isWaitlistApproved(uid: string, email?: string): Promise<boolean>;
  setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null>;
  /**
   * Idempotent by notification id: a second emit for the same id is a no-op and
   * returns `created: false` (a crashed/re-run sweep can safely re-emit).
   */
  createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }>;
  listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]>;
  markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void>;
  /** Delete notifications by id, or all of them ('all') — the bell's dismiss/clear. */
  deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void>;
  /** Stamp emailedAt after a successful send so retries don't re-send. */
  markNotificationEmailed(uid: string, id: string, at?: string): Promise<void>;
  /** Upsert a browser push subscription (idempotent by endpoint). */
  savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void>;
  /** All push subscriptions for a user — the push fan-out sends to each. */
  listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]>;
  /** Remove a subscription (client unsubscribe, or pruning a dead endpoint). */
  deletePushSubscription(uid: string, endpoint: string): Promise<void>;
  /** A user's current vote on a game, or null if they have not voted. */
  getVote(slug: string, uid: string): Promise<VoteValue | null>;
  /**
   * Casts or changes a vote. Repeating the same value is a no-op; voting the other way
   * flips it. Returns the game's updated aggregate counts.
   */
  castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts>;
  /** Removes a user's vote. Returns the game's updated aggregate counts. */
  clearVote(slug: string, uid: string): Promise<GameVoteCounts>;
  /** A game's aggregate vote counts — the public read, no uid involved. */
  getVoteCounts(slug: string): Promise<GameVoteCounts>;
  /** Appends one already-moderated, already-sanitized feedback row. Returns it with its id. */
  addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord>;
  /**
   * A game's feedback, newest first.
   *
   * `limit` bounds the read for the scorecard sweep's theme extraction, so one game with
   * thousands of notes cannot dominate a nightly job. Unbounded without it, because the
   * erase preview needs every row it is about to delete.
   */
  listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]>;
  /**
   * How many feedback rows a game has, without reading them.
   *
   * A count rather than a length: the scorecard sweep needs this for every game it
   * touches, and `listPlayerFeedback().length` would bill one document read per row per
   * night. Firestore's aggregate query is billed per index scan instead, so a game with
   * a thousand notes costs about the same as one with three.
   */
  countPlayerFeedback(slug: string): Promise<number>;
  /** Overwrites a game's current scorecard (docs/improvement-loop-plan.md IL-2). */
  putScorecard(slug: string, scorecard: Scorecard): Promise<void>;
  /** A game's current scorecard, or null before the first sweep has run for it. */
  getScorecard(slug: string): Promise<Scorecard | null>;
  /**
   * Every game's current scorecard, newest computation first.
   *
   * Exists so the sweep's output is *readable*. Writing an aggregate nobody can look at
   * is the same shape of mistake as a silently-dropping branch: the first sign it had
   * been producing nonsense would be an agent acting on the nonsense. Bounded, because
   * this is one query behind an operator page rather than a paginated surface.
   */
  listScorecards(opts?: { limit?: number }): Promise<Scorecard[]>;
  /**
   * Every slug that has a `games/{slug}` entry — including games whose document does
   * not exist but which have subcollections (votes, feedback, scorecard).
   *
   * Exists for the erase path. A vote's uid is its *document id* and not a field, so
   * unlike feedback there is no query that finds one user's votes across games; the only
   * way is to look under each game. Bounded by the catalog, so a walk is affordable.
   */
  listGameSlugs(): Promise<string[]>;
  /**
   * Deletes every feedback row a user wrote, across all games. Returns how many.
   *
   * Feedback *is* findable by uid because the row carries it as a field, which is the
   * asymmetry with votes above.
   */
  deletePlayerFeedbackByUid(uid: string): Promise<number>;
  /**
   * How many feedback rows a user wrote, across all games — the dry run for the delete
   * above.
   *
   * Deliberately the *same* predicate as `deletePlayerFeedbackByUid`, differing only in
   * `.count()` versus `.get()`. A preview of a destructive operation that finds its rows
   * by a different route than the deletion does is a preview that can quietly disagree
   * with what follows, and the direction it disagrees in — under-reporting — is the one
   * an operator would not catch.
   */
  countPlayerFeedbackByUid(uid: string): Promise<number>;
  /** Persist a newly minted personal access token. */
  createAccessToken(record: AccessTokenRecord): Promise<void>;
  /** Point lookup by token id — the hot path on every bearer-authenticated request. */
  getAccessToken(tokenId: string): Promise<AccessTokenRecord | null>;
  /** Every token issued to a user, newest first. Never includes secrets (only hashes). */
  listAccessTokens(uid: string): Promise<AccessTokenRecord[]>;
  /** Revoke by id. Returns false when the token did not exist. */
  deleteAccessToken(tokenId: string): Promise<boolean>;
  /** Best-effort last-use stamp; callers must not let a failure fail the request. */
  touchAccessToken(tokenId: string, at: string): Promise<void>;
}

// Stable doc id for a subscription: a hash of its endpoint URL. Endpoints are long
// and contain characters illegal in Firestore doc ids, and hashing gives idempotent
// re-subscribes for free.
export function pushSubscriptionId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

/**
 * Drop keys whose value is `undefined` before a Firestore write.
 *
 * Firestore rejects `undefined` outright ("Cannot use 'undefined' as a Firestore
 * value") rather than treating it as an absent field, which collides head-on with the
 * TypeScript optional fields (`email?`, `name?`, `picture?`, `locale?`) that this
 * codebase builds records from. The mismatch is invisible in tests because
 * `InMemoryStore` stores whatever it is handed, so it only ever surfaces as a 500 in
 * production — which is exactly how it surfaced: the first `bot:` account (no email, no
 * picture) could not be created, and the waitlist has the same latent fault for anyone
 * whose Google email is unverified, since `auth.ts` deliberately passes `undefined`
 * there rather than store an unverified claim.
 *
 * Applied at the write boundary rather than at each call site so a record can be built
 * naturally, with optional fields left off.
 */
export function stripUndefined<T extends object>(value: T): T {
  // `T extends object`, not `Record<string, unknown>`: interfaces (`User`,
  // `WaitlistEntry`) have no implicit index signature, so the stricter bound rejects
  // every real caller.
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

/**
 * Presentation order for scorecards: newest computation first, slug as the tie-break.
 *
 * The tie-break is the load-bearing half, not a nicety. A sweep stamps **one**
 * `computedAt` onto every game it writes, so equal timestamps are not an edge case —
 * they are every row. Ordering on the timestamp alone leaves the result order undefined
 * (Firestore guarantees nothing among equal values), which would make the operator table
 * reshuffle between reads and, past the read limit, change *which* games appear at all.
 *
 * Shared by both stores so the in-memory one used by tests cannot quietly disagree with
 * the Firestore one used in production — that divergence is what makes an ordering bug
 * invisible until it is in front of a person.
 */
export function compareScorecards(a: Scorecard, b: Scorecard): number {
  return b.computedAt.localeCompare(a.computedAt) || a.slug.localeCompare(b.slug);
}

/** A zeroed counter set — the shape every usage read falls back to. */
function emptyUsageCounters(): UsageCounters {
  return {
    submissions: 0,
    previews: 0,
    mocks: 0,
    refines: 0,
    feedback: 0,
    playerFeedback: 0,
    improvements: 0,
  };
}

/** Newest first, with the id as a stable tie-break for same-millisecond events. */
function byNewestFirst(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

export class InMemoryStore implements Store {
  private users = new Map<string, User>();
  private submissions = new Map<number, SubmissionRecord>();
  private buildEvents = new Map<number, BuildEvent[]>();
  private buildShots = new Map<number, BuildShot[]>();
  private buildPreviews = new Map<number, BuildPreview[]>();
  private creatorMessages = new Map<number, CreatorMessage[]>();
  private usage = new Map<string, UsageCounters>();
  private waitlist = new Map<string, WaitlistEntry>();
  // yyyymmdd -> events recorded that day
  private telemetry = new Map<string, TelemetryEvent[]>();
  // yyyymmdd -> visit events recorded that day
  private visits = new Map<string, VisitEvent[]>();
  // uid -> (notificationId -> notification)
  private notifications = new Map<string, Map<string, StoredNotification>>();
  // uid -> (endpoint-hash -> subscription)
  private pushSubs = new Map<string, Map<string, PushSubscriptionRecord>>();
  // slug -> (uid -> value)
  private votes = new Map<string, Map<string, VoteValue>>();
  // slug -> feedback rows, newest last (reversed on read)
  private playerFeedback = new Map<string, PlayerFeedbackRecord[]>();
  // slug -> current scorecard
  private scorecards = new Map<string, Scorecard>();
  // tokenId -> personal access token record
  private accessTokens = new Map<string, AccessTokenRecord>();

  async getUser(uid: string): Promise<User | null> {
    const user = this.users.get(uid);
    return user ? { ...user } : null;
  }

  async upsertUser(userData: Partial<User> & { uid: string }): Promise<User> {
    const now = new Date().toISOString();
    const existing = this.users.get(userData.uid);

    const updated: User = {
      uid: userData.uid,
      email: userData.email ?? existing?.email,
      name: userData.name ?? existing?.name,
      picture: userData.picture ?? existing?.picture,
      createdAt: existing?.createdAt ?? now,
      lastLoginAt: now,
      tier: userData.tier ?? existing?.tier ?? 'standard',
      // Preserve email prefs across logins — a re-login must not resubscribe.
      locale: userData.locale ?? existing?.locale,
      emailUnsubscribedAt: existing?.emailUnsubscribedAt ?? null,
      // Carried explicitly. Omitting it silently discarded every write from the
      // activity hook in `auth.ts`, whose only purpose is to persist this field.
      activeDays: userData.activeDays ?? existing?.activeDays,
    };

    this.users.set(userData.uid, updated);
    return { ...updated };
  }

  async setEmailUnsubscribed(uid: string, at: string | null): Promise<void> {
    const existing = this.users.get(uid);
    if (existing) this.users.set(uid, { ...existing, emailUnsubscribedAt: at });
  }

  async createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    const record: SubmissionRecord = {
      issueNumber,
      ownerUid,
      createdAt: new Date().toISOString(),
      title,
    };
    this.submissions.set(issueNumber, record);
    return { ...record };
  }

  async getSubmission(issueNumber: number): Promise<SubmissionRecord | null> {
    const sub = this.submissions.get(issueNumber);
    return sub ? { ...sub } : null;
  }

  async setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, lastNotifiedStatus: status });
  }

  async setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, lastStatus: status });
  }

  async setSubmissionSlug(issueNumber: number, slug: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, slug });
  }

  async getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    const match = Array.from(this.submissions.values()).find((s) => s.slug === slug);
    return match ? { ...match } : null;
  }

  async setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub && !sub.publishedAt) this.submissions.set(issueNumber, { ...sub, publishedAt: at });
  }

  async setSubmissionAbandoned(issueNumber: number, at: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, abandonedAt: at });
  }

  async setSubmissionLocale(issueNumber: number, locale: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, locale });
  }

  async setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, clarificationCount: count });
  }

  async appendBuildEvent(
    issueNumber: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildEvent> {
    const record: BuildEvent = { ...event, id: randomUUID(), createdAt: event.createdAt ?? new Date().toISOString() };
    const existing = this.buildEvents.get(issueNumber) ?? [];
    existing.push(record);
    this.buildEvents.set(issueNumber, existing);
    return { ...record };
  }

  async listBuildEvents(issueNumber: number, opts?: { limit?: number }): Promise<BuildEvent[]> {
    return [...(this.buildEvents.get(issueNumber) ?? [])]
      .sort(byNewestFirst)
      .slice(0, opts?.limit ?? 20)
      .map((event) => ({ ...event }));
  }

  async countBuildEvents(issueNumber: number): Promise<number> {
    return this.buildEvents.get(issueNumber)?.length ?? 0;
  }

  async appendBuildShot(
    issueNumber: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot> {
    const record: BuildShot = { ...shot, id: randomUUID(), createdAt: shot.createdAt ?? new Date().toISOString() };
    const existing = this.buildShots.get(issueNumber) ?? [];
    existing.push(record);
    this.buildShots.set(issueNumber, existing);
    return { ...record };
  }

  async listBuildShots(issueNumber: number, opts?: { limit?: number }): Promise<BuildShotSummary[]> {
    return [...(this.buildShots.get(issueNumber) ?? [])]
      .sort(byNewestFirst)
      .slice(0, opts?.limit ?? 12)
      .map(({ data: _data, ...summary }) => ({ ...summary }));
  }

  async getBuildShot(issueNumber: number, id: string): Promise<BuildShot | null> {
    const found = this.buildShots.get(issueNumber)?.find((shot) => shot.id === id);
    return found ? { ...found } : null;
  }

  async countBuildShots(issueNumber: number): Promise<number> {
    return this.buildShots.get(issueNumber)?.length ?? 0;
  }

  async appendBuildPreview(
    issueNumber: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview> {
    const record: BuildPreview = {
      ...preview,
      id: randomUUID(),
      createdAt: preview.createdAt ?? new Date().toISOString(),
    };
    const existing = this.buildPreviews.get(issueNumber) ?? [];
    existing.push(record);
    this.buildPreviews.set(issueNumber, existing);
    return { ...record };
  }

  async listBuildPreviews(issueNumber: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]> {
    return [...(this.buildPreviews.get(issueNumber) ?? [])]
      .sort(byNewestFirst)
      .slice(0, opts?.limit ?? 4)
      .map(({ data: _data, ...summary }) => ({ ...summary }));
  }

  async getBuildPreview(issueNumber: number, id: string): Promise<BuildPreview | null> {
    const found = this.buildPreviews.get(issueNumber)?.find((preview) => preview.id === id);
    return found ? { ...found } : null;
  }

  async countBuildPreviews(issueNumber: number): Promise<number> {
    return this.buildPreviews.get(issueNumber)?.length ?? 0;
  }

  async pruneBuildPreviews(issueNumber: number, keep: number): Promise<number> {
    const existing = this.buildPreviews.get(issueNumber) ?? [];
    if (existing.length <= keep) return 0;
    const kept = [...existing].sort(byNewestFirst).slice(0, keep);
    this.buildPreviews.set(issueNumber, kept);
    return existing.length - kept.length;
  }

  async appendCreatorMessage(issueNumber: number, text: string): Promise<CreatorMessage> {
    const record: CreatorMessage = {
      id: randomUUID(),
      text,
      createdAt: new Date().toISOString(),
      deliveredAt: null,
    };
    const existing = this.creatorMessages.get(issueNumber) ?? [];
    existing.push(record);
    this.creatorMessages.set(issueNumber, existing);
    return { ...record };
  }

  async listPendingCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    return (this.creatorMessages.get(issueNumber) ?? [])
      .filter((message) => !message.deliveredAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, opts?.limit ?? 10)
      .map((message) => ({ ...message }));
  }

  async markCreatorMessagesDelivered(issueNumber: number, ids: string[]): Promise<void> {
    const existing = this.creatorMessages.get(issueNumber);
    if (!existing || ids.length === 0) return;
    const at = new Date().toISOString();
    const targets = new Set(ids);
    this.creatorMessages.set(
      issueNumber,
      existing.map((message) =>
        targets.has(message.id) && !message.deliveredAt ? { ...message, deliveredAt: at } : message,
      ),
    );
  }

  async appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void> {
    const existing = this.telemetry.get(dateStr) ?? [];
    existing.push(...events.map((event) => ({ ...event })));
    this.telemetry.set(dateStr, existing);
  }

  async listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    return (this.telemetry.get(dateStr) ?? [])
      .filter((event) => opts?.slug === undefined || event.slug === opts.slug)
      .slice(0, opts?.limit ?? 1000)
      .map((event) => ({ ...event }));
  }

  async appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void> {
    const existing = this.visits.get(dateStr) ?? [];
    existing.push(...events.map((event) => ({ ...event })));
    this.visits.set(dateStr, existing);
  }

  async listVisitEvents(dateStr: string, opts?: { visitId?: string; limit?: number }): Promise<VisitEvent[]> {
    return (this.visits.get(dateStr) ?? [])
      .filter((event) => opts?.visitId === undefined || event.visitId === opts.visitId)
      .slice(0, opts?.limit ?? 1000)
      .map((event) => ({ ...event }));
  }

  async getUsage(uid: string, dateStr: string): Promise<UsageCounters> {
    return { ...(this.usage.get(`${uid}:${dateStr}`) ?? emptyUsageCounters()) };
  }

  async listRecentlyPublished(limit: number): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.publishedAt)
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  async listActiveSubmissions(): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => !s.abandonedAt && s.lastNotifiedStatus !== 'published' && s.lastNotifiedStatus !== 'needs_changes')
      .map((s) => ({ ...s }));
  }

  async listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.ownerUid === ownerUid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, opts?.limit ?? 20)
      .map((s) => ({ ...s }));
  }

  async checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }> {
    const user = await this.getUser(uid);
    const tier = user?.tier ?? 'standard';

    if (tier === 'blocked') {
      return { allowed: false, current: Infinity, tier };
    }

    if (tier === 'trusted') {
      return { allowed: true, current: 0, tier };
    }

    const key = `${uid}:${dateStr}`;
    const currentCounters: UsageCounters = this.usage.get(key) ?? emptyUsageCounters();
    const currentVal = currentCounters[action] ?? 0;

    if (currentVal >= limit) {
      return { allowed: false, current: currentVal, tier };
    }

    const newCounters: UsageCounters = {
      ...currentCounters,
      [action]: currentVal + 1,
    };
    this.usage.set(key, newCounters);

    return { allowed: true, current: newCounters[action], tier };
  }

  async upsertWaitlistEntry(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const now = new Date().toISOString();
    const existing = this.waitlist.get(entry.uid);

    const updated: WaitlistEntry = {
      uid: entry.uid,
      email: entry.email ?? existing?.email,
      name: entry.name ?? existing?.name,
      requestedAt: now,
      locale: entry.locale ?? existing?.locale,
      status: existing?.status ?? 'pending',
    };

    this.waitlist.set(entry.uid, updated);
    return { ...updated };
  }

  async getWaitlistEntry(uid: string): Promise<WaitlistEntry | null> {
    const entry = this.waitlist.get(uid);
    return entry ? { ...entry } : null;
  }

  async isWaitlistApproved(uid: string, email?: string): Promise<boolean> {
    const byUid = this.waitlist.get(uid);
    if (byUid?.status === 'approved') return true;
    if (email) {
      const emailLower = email.toLowerCase();
      for (const entry of this.waitlist.values()) {
        if (entry.email?.toLowerCase() === emailLower && entry.status === 'approved') {
          return true;
        }
      }
    }
    return false;
  }

  async setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
    const existing = this.waitlist.get(uid);
    if (!existing) return null;
    const updated: WaitlistEntry = { ...existing, status };
    this.waitlist.set(uid, updated);
    return { ...updated };
  }

  async createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }> {
    const forUser = this.notifications.get(uid) ?? new Map<string, StoredNotification>();
    const existing = forUser.get(notification.id);
    if (existing) {
      return { created: false, notification: { ...existing } };
    }
    const record: StoredNotification = {
      id: notification.id,
      type: notification.type,
      createdAt: notification.createdAt ?? new Date().toISOString(),
      readAt: null,
      emailedAt: null,
      titleKey: notification.titleKey,
      bodyKey: notification.bodyKey,
      params: { ...notification.params },
      link: notification.link,
    };
    forUser.set(record.id, record);
    this.notifications.set(uid, forUser);
    return { created: true, notification: { ...record } };
  }

  async listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]> {
    const forUser = this.notifications.get(uid);
    if (!forUser) return [];
    const sorted = Array.from(forUser.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limited = opts?.limit ? sorted.slice(0, opts.limit) : sorted;
    return limited.map((n) => ({ ...n }));
  }

  async markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void> {
    const forUser = this.notifications.get(uid);
    if (!forUser) return;
    const now = new Date().toISOString();
    const targets = ids === 'all' ? Array.from(forUser.keys()) : ids;
    for (const id of targets) {
      const n = forUser.get(id);
      if (n && n.readAt === null) forUser.set(id, { ...n, readAt: now });
    }
  }

  async deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void> {
    const forUser = this.notifications.get(uid);
    if (!forUser) return;
    if (ids === 'all') {
      forUser.clear();
      return;
    }
    for (const id of ids) forUser.delete(id);
  }

  async markNotificationEmailed(uid: string, id: string, at?: string): Promise<void> {
    const forUser = this.notifications.get(uid);
    const n = forUser?.get(id);
    if (n) forUser!.set(id, { ...n, emailedAt: at ?? new Date().toISOString() });
  }

  async savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void> {
    const forUser = this.pushSubs.get(uid) ?? new Map<string, PushSubscriptionRecord>();
    forUser.set(pushSubscriptionId(subscription.endpoint), {
      endpoint: subscription.endpoint,
      keys: { ...subscription.keys },
      createdAt: new Date().toISOString(),
    });
    this.pushSubs.set(uid, forUser);
  }

  async listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]> {
    const forUser = this.pushSubs.get(uid);
    return forUser ? Array.from(forUser.values()).map((s) => ({ ...s, keys: { ...s.keys } })) : [];
  }

  async deletePushSubscription(uid: string, endpoint: string): Promise<void> {
    this.pushSubs.get(uid)?.delete(pushSubscriptionId(endpoint));
  }

  private voteCounts(slug: string): GameVoteCounts {
    const counts: GameVoteCounts = { up: 0, down: 0 };
    for (const value of this.votes.get(slug)?.values() ?? []) counts[value] += 1;
    return counts;
  }

  async getVote(slug: string, uid: string): Promise<VoteValue | null> {
    return this.votes.get(slug)?.get(uid) ?? null;
  }

  async castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts> {
    const forGame = this.votes.get(slug) ?? new Map<string, VoteValue>();
    forGame.set(uid, value);
    this.votes.set(slug, forGame);
    return this.voteCounts(slug);
  }

  async clearVote(slug: string, uid: string): Promise<GameVoteCounts> {
    this.votes.get(slug)?.delete(uid);
    return this.voteCounts(slug);
  }

  async getVoteCounts(slug: string): Promise<GameVoteCounts> {
    return this.voteCounts(slug);
  }

  async addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord> {
    const record: PlayerFeedbackRecord = { id: randomUUID(), uid, text, createdAt: new Date().toISOString() };
    const forGame = this.playerFeedback.get(slug) ?? [];
    forGame.push(record);
    this.playerFeedback.set(slug, forGame);
    return record;
  }

  async listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]> {
    const newestFirst = [...(this.playerFeedback.get(slug) ?? [])].reverse();
    return opts?.limit === undefined ? newestFirst : newestFirst.slice(0, opts.limit);
  }

  async countPlayerFeedback(slug: string): Promise<number> {
    return this.playerFeedback.get(slug)?.length ?? 0;
  }

  async putScorecard(slug: string, scorecard: Scorecard): Promise<void> {
    this.scorecards.set(slug, structuredClone(scorecard));
  }

  async getScorecard(slug: string): Promise<Scorecard | null> {
    const found = this.scorecards.get(slug);
    return found ? structuredClone(found) : null;
  }

  async listScorecards(opts?: { limit?: number }): Promise<Scorecard[]> {
    return [...this.scorecards.values()]
      .map((card) => structuredClone(card))
      .sort(compareScorecards)
      .slice(0, opts?.limit ?? 200);
  }

  async listGameSlugs(): Promise<string[]> {
    // Union of every slug this store knows anything about, mirroring Firestore's
    // `listDocuments()`, which also returns a game whose document never existed but
    // whose subcollections do.
    return [...new Set([...this.votes.keys(), ...this.playerFeedback.keys(), ...this.scorecards.keys()])].sort();
  }

  async deletePlayerFeedbackByUid(uid: string): Promise<number> {
    let deleted = 0;
    for (const [slug, rows] of this.playerFeedback) {
      const kept = rows.filter((row) => row.uid !== uid);
      deleted += rows.length - kept.length;
      this.playerFeedback.set(slug, kept);
    }
    return deleted;
  }

  async countPlayerFeedbackByUid(uid: string): Promise<number> {
    let total = 0;
    for (const rows of this.playerFeedback.values()) {
      total += rows.filter((row) => row.uid === uid).length;
    }
    return total;
  }

  async createAccessToken(record: AccessTokenRecord): Promise<void> {
    this.accessTokens.set(record.tokenId, { ...record });
  }

  async getAccessToken(tokenId: string): Promise<AccessTokenRecord | null> {
    const record = this.accessTokens.get(tokenId);
    return record ? { ...record } : null;
  }

  async listAccessTokens(uid: string): Promise<AccessTokenRecord[]> {
    return Array.from(this.accessTokens.values())
      .filter((record) => record.uid === uid)
      .map((record) => ({ ...record }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteAccessToken(tokenId: string): Promise<boolean> {
    return this.accessTokens.delete(tokenId);
  }

  async touchAccessToken(tokenId: string, at: string): Promise<void> {
    const record = this.accessTokens.get(tokenId);
    if (record) this.accessTokens.set(tokenId, { ...record, lastUsedAt: at });
  }

  // Test/inspection only — not part of the Store interface. Production code never
  // reads the waitlist back (v1 promotion is manual, via the Firestore console).
  waitlistEntries(): WaitlistEntry[] {
    return Array.from(this.waitlist.values());
  }
}

export class FirestoreStore implements Store {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? new Firestore();
  }

  async getUser(uid: string): Promise<User | null> {
    const docRef = this.db.collection('users').doc(uid);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return snap.data() as User;
  }

  async upsertUser(userData: Partial<User> & { uid: string }): Promise<User> {
    const now = new Date().toISOString();
    const docRef = this.db.collection('users').doc(userData.uid);

    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      let user: User;

      if (!snap.exists) {
        user = {
          uid: userData.uid,
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          createdAt: now,
          lastLoginAt: now,
          tier: userData.tier ?? 'standard',
          locale: userData.locale,
          activeDays: userData.activeDays,
        };
      } else {
        const existing = snap.data() as User;
        user = {
          ...existing,
          email: userData.email ?? existing.email,
          name: userData.name ?? existing.name,
          picture: userData.picture ?? existing.picture,
          lastLoginAt: now,
          tier: userData.tier ?? existing.tier,
          // `...existing` carries the *stored* value, so an incoming update to either of
          // these was dropped on the floor for every account that already existed —
          // which, for `activeDays`, is every account the activity hook ever touched.
          locale: userData.locale ?? existing.locale,
          activeDays: userData.activeDays ?? existing.activeDays,
        };
      }

      transaction.set(docRef, stripUndefined(user), { merge: true });
      return user;
    });
  }

  async setEmailUnsubscribed(uid: string, at: string | null): Promise<void> {
    await this.db.collection('users').doc(uid).set({ emailUnsubscribedAt: at }, { merge: true });
  }

  async createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    const record: SubmissionRecord = {
      issueNumber,
      ownerUid,
      createdAt: new Date().toISOString(),
      title,
    };
    await this.db.collection('submissions').doc(String(issueNumber)).set(record);
    return record;
  }

  async getSubmission(issueNumber: number): Promise<SubmissionRecord | null> {
    const snap = await this.db.collection('submissions').doc(String(issueNumber)).get();
    if (!snap.exists) return null;
    return snap.data() as SubmissionRecord;
  }

  async setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set({ lastNotifiedStatus: status }, { merge: true });
  }

  async setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ lastStatus: status }, { merge: true });
  }

  async setSubmissionSlug(issueNumber: number, slug: string): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ slug }, { merge: true });
  }

  async setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void> {
    const ref = this.db.collection('submissions').doc(String(issueNumber));
    const snap = await ref.get();
    // First observation wins: a later re-derivation must not move the timestamp.
    if ((snap.data() as SubmissionRecord | undefined)?.publishedAt) return;
    await ref.set({ publishedAt: at }, { merge: true });
  }

  async setSubmissionAbandoned(issueNumber: number, at: string): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ abandonedAt: at }, { merge: true });
  }

  async setSubmissionLocale(issueNumber: number, locale: string): Promise<void> {
    await this.db.collection('submissions').doc(String(issueNumber)).set({ locale }, { merge: true });
  }

  async setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void> {
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set({ clarificationCount: count }, { merge: true });
  }

  private eventsCollection(issueNumber: number) {
    return this.db.collection('submissions').doc(String(issueNumber)).collection('events');
  }

  private messagesCollection(issueNumber: number) {
    return this.db.collection('submissions').doc(String(issueNumber)).collection('messages');
  }

  private shotsCollection(issueNumber: number) {
    return this.db.collection('submissions').doc(String(issueNumber)).collection('shots');
  }

  private previewsCollection(issueNumber: number) {
    return this.db.collection('submissions').doc(String(issueNumber)).collection('previews');
  }

  async appendBuildEvent(
    issueNumber: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildEvent> {
    const record: BuildEvent = { ...event, id: randomUUID(), createdAt: event.createdAt ?? new Date().toISOString() };
    // Firestore rejects undefined values; optional fields are simply absent instead.
    const document = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
    await this.eventsCollection(issueNumber).doc(record.id).set(document);
    return record;
  }

  async listBuildEvents(issueNumber: number, opts?: { limit?: number }): Promise<BuildEvent[]> {
    const snap = await this.eventsCollection(issueNumber)
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 20)
      .get();
    return snap.docs.map((doc) => doc.data() as BuildEvent).sort(byNewestFirst);
  }

  async countBuildEvents(issueNumber: number): Promise<number> {
    const snap = await this.eventsCollection(issueNumber).count().get();
    return snap.data().count;
  }

  async appendBuildShot(
    issueNumber: number,
    shot: Omit<BuildShot, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildShot> {
    const record: BuildShot = { ...shot, id: randomUUID(), createdAt: shot.createdAt ?? new Date().toISOString() };
    const document = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
    await this.shotsCollection(issueNumber).doc(record.id).set(document);
    return record;
  }

  async listBuildShots(issueNumber: number, opts?: { limit?: number }): Promise<BuildShotSummary[]> {
    // `select()` keeps the bytes on the server: a listing rides the status response,
    // which is polled every few seconds, and the images themselves are fetched once
    // each by the browser and then cached.
    const snap = await this.shotsCollection(issueNumber)
      .select('id', 'label', 'labelLocalized', 'locale', 'createdAt')
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 12)
      .get();
    return snap.docs.map((doc) => doc.data() as BuildShotSummary).sort(byNewestFirst);
  }

  async getBuildShot(issueNumber: number, id: string): Promise<BuildShot | null> {
    const doc = await this.shotsCollection(issueNumber).doc(id).get();
    return doc.exists ? (doc.data() as BuildShot) : null;
  }

  async countBuildShots(issueNumber: number): Promise<number> {
    const snap = await this.shotsCollection(issueNumber).count().get();
    return snap.data().count;
  }

  async appendBuildPreview(
    issueNumber: number,
    preview: Omit<BuildPreview, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<BuildPreview> {
    const record: BuildPreview = {
      ...preview,
      id: randomUUID(),
      createdAt: preview.createdAt ?? new Date().toISOString(),
    };
    const document = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
    await this.previewsCollection(issueNumber).doc(record.id).set(document);
    return record;
  }

  async listBuildPreviews(issueNumber: number, opts?: { limit?: number }): Promise<BuildPreviewSummary[]> {
    // `select()` matters far more here than it does for shots: a preview document is a
    // couple of hundred kilobytes, and this listing rides a status response the creator's
    // browser polls every few seconds. The bytes are fetched once, by the iframe.
    const snap = await this.previewsCollection(issueNumber)
      .select('id', 'slug', 'label', 'labelLocalized', 'locale', 'createdAt')
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 4)
      .get();
    return snap.docs.map((doc) => doc.data() as BuildPreviewSummary).sort(byNewestFirst);
  }

  async getBuildPreview(issueNumber: number, id: string): Promise<BuildPreview | null> {
    const doc = await this.previewsCollection(issueNumber).doc(id).get();
    return doc.exists ? (doc.data() as BuildPreview) : null;
  }

  async countBuildPreviews(issueNumber: number): Promise<number> {
    const snap = await this.previewsCollection(issueNumber).count().get();
    return snap.data().count;
  }

  async pruneBuildPreviews(issueNumber: number, keep: number): Promise<number> {
    // Previews are heavy and each one obsoletes the last, so the collection is trimmed on
    // write rather than left to a retention job. Ids only — pulling the documents to
    // decide which to drop would fetch the very bytes this is trying not to keep.
    const snap = await this.previewsCollection(issueNumber).select('createdAt').orderBy('createdAt', 'desc').get();
    const stale = snap.docs.slice(keep);
    if (!stale.length) return 0;
    // Chunked, because a Firestore batch takes at most 500 operations. Steady state is
    // one deletion per push, so this never matters — until pruning falls behind (a spell
    // of write errors while the watcher keeps pushing), at which point a single batch
    // would start failing permanently and previews would grow without bound. The cheap
    // loop is what stops a transient fault from becoming a permanent one.
    const BATCH_LIMIT = 500;
    for (let start = 0; start < stale.length; start += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const doc of stale.slice(start, start + BATCH_LIMIT)) batch.delete(doc.ref);
      await batch.commit();
    }
    return stale.length;
  }

  async appendCreatorMessage(issueNumber: number, text: string): Promise<CreatorMessage> {
    const record: CreatorMessage = {
      id: randomUUID(),
      text,
      createdAt: new Date().toISOString(),
      deliveredAt: null,
    };
    await this.messagesCollection(issueNumber).doc(record.id).set(record);
    return record;
  }

  async listPendingCreatorMessages(issueNumber: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    // Equality on deliveredAt plus an ordered range would need a composite index;
    // the message count per build is tiny, so order and filter here instead.
    const snap = await this.messagesCollection(issueNumber).where('deliveredAt', '==', null).get();
    return snap.docs
      .map((doc) => doc.data() as CreatorMessage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, opts?.limit ?? 10);
  }

  async markCreatorMessagesDelivered(issueNumber: number, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const at = new Date().toISOString();
    const collection = this.messagesCollection(issueNumber);
    const batch = this.db.batch();
    ids.forEach((id) => batch.set(collection.doc(id), { deliveredAt: at }, { merge: true }));
    await batch.commit();
  }

  private telemetryCollection(dateStr: string) {
    return this.db.collection('telemetry').doc(dateStr).collection(TELEMETRY_COLLECTION);
  }

  private visitCollection(dateStr: string) {
    return this.db.collection('telemetry').doc(dateStr).collection(VISIT_COLLECTION);
  }

  async appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void> {
    if (events.length === 0) return;
    const collection = this.visitCollection(dateStr);
    const batch = this.db.batch();
    events.forEach((event) =>
      batch.set(collection.doc(randomUUID()), { ...event, [TELEMETRY_TTL_FIELD]: telemetryExpiresAt(event.at) }),
    );
    await batch.commit();
  }

  async listVisitEvents(dateStr: string, opts?: { visitId?: string; limit?: number }): Promise<VisitEvent[]> {
    const base = this.visitCollection(dateStr);
    const query = opts?.visitId === undefined ? base : base.where('visitId', '==', opts.visitId);
    const snap = await query.limit(opts?.limit ?? 1000).get();
    return snap.docs.map((doc) => {
      const event = doc.data();
      delete event[TELEMETRY_TTL_FIELD];
      return event as VisitEvent;
    });
  }

  async appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;
    // One batch per flush: a play session sends a handful of events at a time, well
    // inside Firestore's 500-write batch limit (the route caps a request long before).
    const collection = this.telemetryCollection(dateStr);
    const batch = this.db.batch();
    events.forEach((event) =>
      // `expiresAt` is written as a Date so the driver stores a real Timestamp: a TTL
      // policy ignores a field of any other type, which would leave the row forever.
      batch.set(collection.doc(randomUUID()), { ...event, [TELEMETRY_TTL_FIELD]: telemetryExpiresAt(event.at) }),
    );
    await batch.commit();
  }

  async listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    // Equality-only filter plus a limit, so no composite index is needed.
    const base = this.telemetryCollection(dateStr);
    const query = opts?.slug === undefined ? base : base.where('slug', '==', opts.slug);
    const snap = await query.limit(opts?.limit ?? 1000).get();
    return snap.docs.map((doc) => {
      // Retention plumbing stays out of the domain object, so a reader cannot mistake
      // it for signal and the privacy field-allowlist stays exactly the event's fields.
      // `data()` hands back a fresh object per call, so dropping the field is local.
      const event = doc.data();
      delete event[TELEMETRY_TTL_FIELD];
      return event as TelemetryEvent;
    });
  }

  async getUsage(uid: string, dateStr: string): Promise<UsageCounters> {
    const snap = await this.db.collection('usage').doc(uid).collection('counters').doc(dateStr).get();
    return { ...emptyUsageCounters(), ...(snap.data() as Partial<UsageCounters> | undefined) };
  }

  async listRecentlyPublished(limit: number): Promise<SubmissionRecord[]> {
    // orderBy on a single field uses Firestore's automatic index, and documents
    // without publishedAt are excluded by definition — exactly the sample we want.
    const snap = await this.db.collection('submissions').orderBy('publishedAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => d.data() as SubmissionRecord);
  }

  async getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    // Equality-only query — no composite index needed. A slug is unique per game
    // directory, but if two submissions ever raced onto one, the newest wins.
    const snap = await this.db.collection('submissions').where('slug', '==', slug).get();
    const records = snap.docs.map((d) => d.data() as SubmissionRecord);
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return records[0] ?? null;
  }

  async listActiveSubmissions(): Promise<SubmissionRecord[]> {
    // 'in' with the non-terminal set would need a composite index and misses docs
    // with no lastNotifiedStatus yet; filtering client-side is simpler and the
    // active set is small (open submissions only).
    const snap = await this.db.collection('submissions').get();
    return snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .filter(
        (s) => !s.abandonedAt && s.lastNotifiedStatus !== 'published' && s.lastNotifiedStatus !== 'needs_changes',
      );
  }

  async listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]> {
    // Equality-only query (no orderBy) so Firestore needs no composite index; a
    // creator's submission count is small, so sorting here is cheap.
    const snap = await this.db.collection('submissions').where('ownerUid', '==', ownerUid).get();
    return snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, opts?.limit ?? 20);
  }

  async checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }> {
    const userRef = this.db.collection('users').doc(uid);
    const counterRef = this.db.collection('usage').doc(uid).collection('counters').doc(dateStr);

    return await this.db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const user = userSnap.exists ? (userSnap.data() as User) : null;
      const tier = user?.tier ?? 'standard';

      if (tier === 'blocked') {
        return { allowed: false, current: Infinity, tier };
      }

      if (tier === 'trusted') {
        return { allowed: true, current: 0, tier };
      }

      const counterSnap = await transaction.get(counterRef);
      const data = counterSnap.exists ? counterSnap.data() : {};
      const currentVal = (data?.[action] as number) ?? 0;

      if (currentVal >= limit) {
        return { allowed: false, current: currentVal, tier };
      }

      const nextVal = currentVal + 1;
      transaction.set(counterRef, { [action]: nextVal }, { merge: true });

      return { allowed: true, current: nextVal, tier };
    });
  }

  async upsertWaitlistEntry(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const now = new Date().toISOString();
    const docRef = this.db.collection('waitlist').doc(entry.uid);
    const snap = await docRef.get();
    const existing = snap.exists ? (snap.data() as WaitlistEntry) : null;

    const record: WaitlistEntry = {
      uid: entry.uid,
      email: entry.email,
      name: entry.name,
      requestedAt: now,
      locale: entry.locale,
      status: existing?.status ?? 'pending',
    };
    await docRef.set(stripUndefined(record), { merge: true });
    return record;
  }

  async getWaitlistEntry(uid: string): Promise<WaitlistEntry | null> {
    const snap = await this.db.collection('waitlist').doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() as WaitlistEntry;
  }

  async isWaitlistApproved(uid: string, email?: string): Promise<boolean> {
    const uidSnap = await this.db.collection('waitlist').doc(uid).get();
    if (uidSnap.exists && (uidSnap.data() as WaitlistEntry).status === 'approved') {
      return true;
    }
    if (email) {
      const emailLower = email.toLowerCase();
      const emailQuery = await this.db
        .collection('waitlist')
        .where('email', '==', emailLower)
        .where('status', '==', 'approved')
        .limit(1)
        .get();
      if (!emailQuery.empty) return true;
    }
    return false;
  }

  async setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
    const docRef = this.db.collection('waitlist').doc(uid);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    await docRef.update({ status });
    const updatedSnap = await docRef.get();
    return updatedSnap.data() as WaitlistEntry;
  }

  private notificationRef(uid: string, id: string) {
    return this.db.collection('users').doc(uid).collection('notifications').doc(id);
  }

  async createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }> {
    const docRef = this.notificationRef(uid, notification.id);
    return await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (snap.exists) {
        return { created: false, notification: snap.data() as StoredNotification };
      }
      const record: StoredNotification = {
        id: notification.id,
        type: notification.type,
        createdAt: notification.createdAt ?? new Date().toISOString(),
        readAt: null,
        emailedAt: null,
        titleKey: notification.titleKey,
        bodyKey: notification.bodyKey,
        params: notification.params,
        link: notification.link,
      };
      tx.set(docRef, record);
      return { created: true, notification: record };
    });
  }

  async listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]> {
    const query = this.db
      .collection('users')
      .doc(uid)
      .collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 20);
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as StoredNotification);
  }

  async markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void> {
    const now = new Date().toISOString();
    const col = this.db.collection('users').doc(uid).collection('notifications');
    if (ids === 'all') {
      const unread = await col.where('readAt', '==', null).get();
      const batch = this.db.batch();
      unread.docs.forEach((d) => batch.update(d.ref, { readAt: now }));
      await batch.commit();
      return;
    }
    const batch = this.db.batch();
    ids.forEach((id) => batch.set(col.doc(id), { readAt: now }, { merge: true }));
    await batch.commit();
  }

  async deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void> {
    const col = this.db.collection('users').doc(uid).collection('notifications');
    if (ids === 'all') {
      const snap = await col.get();
      if (snap.empty) return;
      const batch = this.db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return;
    }
    if (ids.length === 0) return;
    const batch = this.db.batch();
    ids.forEach((id) => batch.delete(col.doc(id)));
    await batch.commit();
  }

  async markNotificationEmailed(uid: string, id: string, at?: string): Promise<void> {
    await this.notificationRef(uid, id).set({ emailedAt: at ?? new Date().toISOString() }, { merge: true });
  }

  private pushSubRef(uid: string, endpoint: string) {
    return this.db.collection('users').doc(uid).collection('pushSubscriptions').doc(pushSubscriptionId(endpoint));
  }

  async savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void> {
    const record: PushSubscriptionRecord = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      createdAt: new Date().toISOString(),
    };
    await this.pushSubRef(uid, subscription.endpoint).set(record);
  }

  async listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]> {
    const snap = await this.db.collection('users').doc(uid).collection('pushSubscriptions').get();
    return snap.docs.map((d) => d.data() as PushSubscriptionRecord);
  }

  async deletePushSubscription(uid: string, endpoint: string): Promise<void> {
    await this.pushSubRef(uid, endpoint).delete();
  }

  private gameRef(slug: string) {
    return this.db.collection('games').doc(slug);
  }

  private voteRef(slug: string, uid: string) {
    return this.gameRef(slug).collection('votes').doc(uid);
  }

  private feedbackCollection(slug: string) {
    return this.gameRef(slug).collection('playerFeedback');
  }

  private static readVoteCounts(data: DocumentData | undefined): GameVoteCounts {
    return { up: (data?.votesUp as number | undefined) ?? 0, down: (data?.votesDown as number | undefined) ?? 0 };
  }

  async getVote(slug: string, uid: string): Promise<VoteValue | null> {
    const snap = await this.voteRef(slug, uid).get();
    return snap.exists ? ((snap.data()?.value as VoteValue | undefined) ?? null) : null;
  }

  async castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts> {
    const gameRef = this.gameRef(slug);
    const voteRef = this.voteRef(slug, uid);
    return await this.db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const voteSnap = await transaction.get(voteRef);
      const counts = FirestoreStore.readVoteCounts(gameSnap.data());
      const previous = voteSnap.exists ? (voteSnap.data()?.value as VoteValue | undefined) : undefined;

      // Repeating the same vote must not double-count it; only a genuine change
      // touches the tally.
      if (previous !== value) {
        if (previous) counts[previous] = Math.max(0, counts[previous] - 1);
        counts[value] += 1;
        transaction.set(gameRef, { votesUp: counts.up, votesDown: counts.down }, { merge: true });
      }
      transaction.set(voteRef, { value, updatedAt: new Date().toISOString() });
      return counts;
    });
  }

  async clearVote(slug: string, uid: string): Promise<GameVoteCounts> {
    const gameRef = this.gameRef(slug);
    const voteRef = this.voteRef(slug, uid);
    return await this.db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const voteSnap = await transaction.get(voteRef);
      const counts = FirestoreStore.readVoteCounts(gameSnap.data());
      if (!voteSnap.exists) return counts;

      const previous = voteSnap.data()?.value as VoteValue | undefined;
      if (previous) counts[previous] = Math.max(0, counts[previous] - 1);
      transaction.delete(voteRef);
      transaction.set(gameRef, { votesUp: counts.up, votesDown: counts.down }, { merge: true });
      return counts;
    });
  }

  async getVoteCounts(slug: string): Promise<GameVoteCounts> {
    const snap = await this.gameRef(slug).get();
    return FirestoreStore.readVoteCounts(snap.data());
  }

  async addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord> {
    const createdAt = new Date().toISOString();
    const ref = this.feedbackCollection(slug).doc();
    const record: PlayerFeedbackRecord = { id: ref.id, uid, text, createdAt };
    await ref.set({ uid, text, createdAt });
    return record;
  }

  async listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]> {
    // Unbounded by default because the erase preview and the operator read both want
    // everything; the sweep passes a limit so one game with thousands of notes cannot
    // dominate a nightly job's read budget.
    const ordered = this.feedbackCollection(slug).orderBy('createdAt', 'desc');
    const snap = await (opts?.limit === undefined ? ordered : ordered.limit(opts.limit)).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlayerFeedbackRecord, 'id'>) }));
  }

  async countPlayerFeedback(slug: string): Promise<number> {
    const snap = await this.feedbackCollection(slug).count().get();
    return snap.data().count;
  }

  // `current` is a fixed doc id, so a game has exactly one scorecard and the sweep
  // overwrites rather than accumulating a history nobody reads.
  private scorecardRef(slug: string) {
    return this.gameRef(slug).collection('scorecard').doc('current');
  }

  async putScorecard(slug: string, scorecard: Scorecard): Promise<void> {
    // `set` without merge: a scorecard is a whole snapshot, and merging would leave
    // fields from a previous window alive next to a newer one — a row that never
    // existed as a measurement.
    await this.scorecardRef(slug).set(scorecard);
  }

  async listScorecards(opts?: { limit?: number }): Promise<Scorecard[]> {
    // A collection-group query over `scorecard` reads every game's `current` doc in one
    // round trip, instead of one read per catalog slug. Safe as a group name: nothing
    // else in the schema uses it, unlike the `events` collision that forced play
    // telemetry into its own group.
    //
    // Ordered by `computedAt` rather than by any metric, because the question this read
    // exists to answer is "did the sweep run, and how fresh is the freshest" — a stale
    // scorecard is the failure worth seeing first.
    //
    // The `orderBy` selects *which* docs the limit keeps (the freshest, if the catalog
    // ever outgrows it); the sort below decides the order they are presented in. Both
    // are needed: a sweep stamps one `computedAt` on every game it writes, so equal
    // timestamps are the normal case rather than a rare tie, and Firestore promises
    // nothing about order among equal values. Sorting here rather than adding
    // `.orderBy('slug')` avoids provisioning a composite index for a listing that is
    // already bounded to a couple of hundred rows.
    const snap = await this.db
      .collectionGroup('scorecard')
      .orderBy('computedAt', 'desc')
      .limit(opts?.limit ?? 200)
      .get();
    return snap.docs.map((doc) => doc.data() as Scorecard).sort(compareScorecards);
  }

  async listGameSlugs(): Promise<string[]> {
    // `listDocuments()` rather than `get()`: it lists references without reading
    // documents, and — the part that matters here — it includes games whose parent
    // document was never written but which have subcollections underneath. A game that
    // only ever received feedback is exactly that case, and a `get()` would miss it.
    const refs = await this.db.collection('games').listDocuments();
    return refs.map((ref) => ref.id).sort();
  }

  // Both of these need the COLLECTION_GROUP index on playerFeedback.uid that
  // infra/setup-gcp.sh step 7 provisions. Firestore auto-indexes single fields at
  // COLLECTION scope only, so without it they fail with 9 FAILED_PRECONDITION rather
  // than merely running slowly.
  private feedbackByUid(uid: string) {
    return this.db.collectionGroup('playerFeedback').where('uid', '==', uid);
  }

  async deletePlayerFeedbackByUid(uid: string): Promise<number> {
    const snap = await this.feedbackByUid(uid).get();
    if (snap.empty) return 0;

    // Chunked because a batch tops out at 500 writes, and "delete everything this
    // person wrote" is precisely the request that could exceed it.
    const docs = snap.docs;
    for (let index = 0; index < docs.length; index += 400) {
      const batch = this.db.batch();
      for (const doc of docs.slice(index, index + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
    return docs.length;
  }

  async countPlayerFeedbackByUid(uid: string): Promise<number> {
    const snap = await this.feedbackByUid(uid).count().get();
    return snap.data().count;
  }

  async getScorecard(slug: string): Promise<Scorecard | null> {
    const snap = await this.scorecardRef(slug).get();
    return snap.exists ? (snap.data() as Scorecard) : null;
  }

  async createAccessToken(record: AccessTokenRecord): Promise<void> {
    await this.db.collection('accessTokens').doc(record.tokenId).create(record);
  }

  async getAccessToken(tokenId: string): Promise<AccessTokenRecord | null> {
    const snap = await this.db.collection('accessTokens').doc(tokenId).get();
    if (!snap.exists) return null;
    return snap.data() as AccessTokenRecord;
  }

  async listAccessTokens(uid: string): Promise<AccessTokenRecord[]> {
    const snap = await this.db.collection('accessTokens').where('uid', '==', uid).get();
    // Sorted in memory rather than with orderBy: a composite (uid, createdAt) index is
    // not worth provisioning for a listing whose result set is a handful of rows.
    return snap.docs
      .map((doc) => doc.data() as AccessTokenRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteAccessToken(tokenId: string): Promise<boolean> {
    const docRef = this.db.collection('accessTokens').doc(tokenId);
    const snap = await docRef.get();
    if (!snap.exists) return false;
    await docRef.delete();
    return true;
  }

  async touchAccessToken(tokenId: string, at: string): Promise<void> {
    // `update` (not merge-set): a revoked token's doc is gone, and merge-set
    // would resurrect a partial record that later auth reads crash on. Missing
    // docs throw; callers already treat touch as best-effort.
    await this.db.collection('accessTokens').doc(tokenId).update({ lastUsedAt: at });
  }
}
