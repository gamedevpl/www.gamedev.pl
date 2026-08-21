import { ZONE_LINK_STEPS, type ZoneLinkStep } from '@gamedevpl/contract';

export { ZONE_LINK_STEPS };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Play-session telemetry, browser half (docs/improvement-loop-plan.md IL-1).
 *
 * The funnel events here are emitted by the *app*, not by the game, which is the
 * whole point: a game that reports nothing — or lies — still yields open, duration
 * and error data. Games only get to add depth (`progress`, `score`, `end`), and only
 * once the games-repo telemetry module exists.
 *
 * The session id is a per-open uuid held in memory and never written to a cookie or
 * to localStorage. Two opens of the same game by the same person are two unrelated
 * sessions, by design: this measures games, not people.
 */

export type TelemetryEvent =
  | { type: 'game_opened'; slots?: number }
  | { type: 'play_time'; seconds: number }
  | { type: 'game_closed' }
  | { type: 'error'; message: string }
  | { type: 'alive'; frames: number }
  | { type: 'progress'; label: string; gfxBackend?: 'canvas2d' | 'webgl' | 'webgl3d' }
  | { type: 'score'; value: number }
  | { type: 'end'; outcome: 'won' | 'lost' | 'quit'; gfxBackend?: 'canvas2d' | 'webgl' | 'webgl3d' }
  /**
   * How far this open got towards an actually shared world (P3 zones).
   *
   * A rung, in the shape `create_step` established: it means "this session reached
   * here", so each is recorded once and the read side is a funnel. `joined` over
   * `admitted` is the number worth having — anything below 1 is players who were issued
   * a seat and ended up alone anyway, which is the one zone failure with no symptom.
   * The shell falls back to solo play in silence by design, so without this the
   * difference between a working host and a dead one is invisible in aggregate.
   *
   * Emitted by the shell, never accepted from inside the frame. A game that could send
   * `joined` could report itself multiplayer while sitting alone.
   */
  | { type: 'zone_link'; step: ZoneLinkStep };

/** Flush when this many events are queued, so a busy session does not sit on data. */
const FLUSH_AT = 10;
/** Matches the API's per-request cap. */
const MAX_BATCH = 50;
/** Session ceiling. A game emitting past this is buggy or hostile; we stop listening. */
const MAX_EVENTS_PER_SESSION = 400;
/**
 * Types the shell reports about a game, which the game itself has no way to send.
 *
 * Keyed by type rather than by a flag on the call, and that is safe only because these
 * types are structurally unreachable from inside the frame: `gamePlayer.ts` does not
 * accept them over postMessage. Adding a type here that a game *can* send would hand it
 * a private budget to flood.
 */
const SHELL_OWNED_TYPES = new Set<TelemetryEvent['type']>(['zone_link']);
/**
 * A budget for those, separate from the game's.
 *
 * Sharing one ceiling let a game starve the evidence about itself: a frame that emits
 * 399 valid events before admission resolves would push the zone rungs past the cap, and
 * a broken zone would then render as `—` — no evidence — on the word of the thing being
 * measured. Separating the channel was not enough; the budget had to be separate too.
 *
 * Small on purpose. Per-session dedupe already holds this to one of each rung, so it is
 * a backstop rather than an allowance.
 */
const MAX_SHELL_EVENTS_PER_SESSION = 8;
/** Distinct `progress` labels one session may introduce — a label flood is a DoS. */
const MAX_DISTINCT_LABELS = 20;
const MAX_MESSAGE_LENGTH = 200;
const MAX_LABEL_LENGTH = 40;
/** Ceiling on a reported offset. Beyond this a session is not a session. */
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

/**
 * An event as it goes on the wire: the caller's event plus how long after the session
 * opened it happened.
 *
 * This exists because server-assigned receipt time is not event time. Events are
 * batched, so a flush can arrive minutes after the events in it — the first production
 * session stamped four events at 09:42:01 that had actually happened around 09:36:30,
 * collapsing 15 seconds of play onto one instant. Absolute time from the client can't
 * be trusted, but *elapsed* time can: it is a duration from a monotonic clock, so
 * skew, DST and a wrong system date cannot touch it, and the server still anchors it
 * to a real instant using the flush's own offset.
 */
export type WireEvent = TelemetryEvent & { msSinceOpen: number };

export type TelemetrySend = (body: {
  slug: string;
  sessionId: string;
  /** Age of the session at flush time — the anchor that dates every event in it. */
  flushMsSinceOpen: number;
  events: WireEvent[];
}) => void;

/**
 * Posts a batch. `keepalive` is what makes the final flush survive the page going
 * away, which is exactly when `game_closed` is emitted; a rejected request is
 * swallowed because telemetry must never surface as a player-visible failure.
 */
export const sendTelemetry: TelemetrySend = (body) => {
  void fetch(`${API_BASE}/api/telemetry`, {
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
 * Validates, caps, and batches one play session's events.
 *
 * Kept free of React and of the DOM so the limits can be tested directly — they are
 * the part that has to hold against a hostile game, and a cap that only exists inside
 * an effect is a cap nobody can prove.
 */
export class TelemetrySession {
  private queue: WireEvent[] = [];
  private accepted = 0;
  private shellAccepted = 0;
  private labels = new Set<string>();
  /** Zone rungs already recorded — each is a "this session got this far", so once each. */
  private zoneSteps = new Set<string>();
  private closed = false;
  private readonly openedAt: number;

  constructor(
    readonly slug: string,
    readonly sessionId: string,
    private readonly send: TelemetrySend = sendTelemetry,
    /**
     * Monotonic millisecond source. `performance.now()` rather than `Date.now()` on
     * purpose: it cannot jump when the system clock is corrected or the machine wakes
     * from sleep, so an offset stays a real duration.
     */
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.openedAt = clock();
  }

  /** Milliseconds since this session opened, clamped to something a session can be. */
  private elapsed(): number {
    return Math.min(MAX_SESSION_MS, Math.max(0, Math.round(this.clock() - this.openedAt)));
  }

  /** Game-reported events accepted so far — what the game's cap is measured against. */
  get count(): number {
    return this.accepted;
  }

  /**
   * Records an event, returning whether it was accepted. Rejection is silent to the
   * caller's user: a game cannot tell whether it is being recorded, so it cannot
   * probe for the limits.
   */
  record(event: TelemetryEvent): boolean {
    if (this.closed) return false;
    const shellOwned = SHELL_OWNED_TYPES.has(event.type);
    if (shellOwned) {
      if (this.shellAccepted >= MAX_SHELL_EVENTS_PER_SESSION) return false;
    } else if (this.accepted >= MAX_EVENTS_PER_SESSION) return false;

    const normalized = this.normalize(event);
    if (!normalized) return false;

    // Stamped at record time, not at flush time — the whole point is that the two are
    // not the same instant.
    this.queue.push({ ...normalized, msSinceOpen: this.elapsed() });
    if (shellOwned) this.shellAccepted += 1;
    else this.accepted += 1;
    if (this.queue.length >= FLUSH_AT) this.flush();
    return true;
  }

  /** Sends whatever is queued. A no-op when the queue is empty. */
  flush(): void {
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, MAX_BATCH);
    this.send({ slug: this.slug, sessionId: this.sessionId, flushMsSinceOpen: this.elapsed(), events });
  }

  /** Final flush for the session; further events are ignored. */
  close(): void {
    this.flush();
    this.closed = true;
  }

  private normalize(event: TelemetryEvent): TelemetryEvent | null {
    switch (event.type) {
      case 'game_opened': {
        // A nonsense slot count loses the field, not the open event — the funnel's
        // first step must never depend on an optional detail being well formed.
        const slots = event.slots === undefined ? null : clampInt(event.slots, 1, 8);
        return slots === null ? { type: 'game_opened' } : { type: 'game_opened', slots };
      }
      case 'play_time': {
        const seconds = clampInt(event.seconds, 1, 3600);
        return seconds === null ? null : { type: 'play_time', seconds };
      }
      case 'game_closed':
        return { type: 'game_closed' };
      case 'alive': {
        const frames = clampInt(event.frames, 0, 100_000);
        return frames === null ? null : { type: 'alive', frames };
      }
      case 'error': {
        const message = String(event.message ?? '')
          .trim()
          .slice(0, MAX_MESSAGE_LENGTH);
        return message ? { type: 'error', message } : null;
      }
      case 'progress': {
        const label = String(event.label ?? '')
          .trim()
          .slice(0, MAX_LABEL_LENGTH);
        if (!label) return null;
        // A game may name at most MAX_DISTINCT_LABELS places; repeats of a known
        // label stay welcome, since that is what a drop-off curve is made of.
        if (!this.labels.has(label) && this.labels.size >= MAX_DISTINCT_LABELS) return null;
        this.labels.add(label);
        const gfxBackend = normalizeGfxBackend(event.gfxBackend);
        return gfxBackend ? { type: 'progress', label, gfxBackend } : { type: 'progress', label };
      }
      case 'zone_link': {
        if (!ZONE_LINK_STEPS.includes(event.step)) return null;
        // Once per rung per session. A link that flaps says the same thing about this
        // open as a link that dropped once, and repeats would swamp the denominator the
        // ratio is measured against.
        if (this.zoneSteps.has(event.step)) return null;
        this.zoneSteps.add(event.step);
        return { type: 'zone_link', step: event.step };
      }
      case 'score':
        return Number.isFinite(event.value) ? { type: 'score', value: event.value } : null;
      case 'end': {
        if (event.outcome !== 'won' && event.outcome !== 'lost' && event.outcome !== 'quit') return null;
        const gfxBackend = normalizeGfxBackend(event.gfxBackend);
        return gfxBackend
          ? { type: 'end', outcome: event.outcome, gfxBackend }
          : { type: 'end', outcome: event.outcome };
      }
      default:
        return null;
    }
  }
}

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeGfxBackend(value: unknown): 'canvas2d' | 'webgl' | 'webgl3d' | null {
  return value === 'canvas2d' || value === 'webgl' || value === 'webgl3d' ? value : null;
}

/**
 * Is play time currently accruing? The game iframe holds keyboard focus and is
 * opaque-origin, so the app cannot look inside it — but `document.hasFocus()` is true
 * when focus lives in a descendant frame, which is precisely the case we want to
 * count. A backgrounded tab or another window in front means no play time, however
 * enthusiastically the game keeps animating.
 */
export function isPlayTimeAccruing(doc: Pick<Document, 'visibilityState' | 'hasFocus'>): boolean {
  return doc.visibilityState === 'visible' && doc.hasFocus();
}
