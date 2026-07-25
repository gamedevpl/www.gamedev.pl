import type { TelemetryEvent } from './store.js';

/**
 * Turns raw play events into a per-game health picture (docs/improvement-loop-plan.md IL-2).
 *
 * This is the read half of IL-1's capture: until it existed the data was write-only and
 * answering "is this published game broken" meant querying Firestore by hand. It is a
 * pure function over events on purpose — the interesting logic is all in what counts as
 * evidence, and that has to be testable without a database or a clock.
 *
 * Keyed by slug, across all published games rather than per creator: attribution runs
 * through `submissions.ownerUid`, and most catalog games have no submission document at
 * all, so a per-creator view would silently cover a fraction of the catalog.
 */

/** Nominal heartbeat spacing. `alive` and `play_time` are emitted against this. */
const HEARTBEAT_MS = 5_000;
/**
 * Largest gap between two events of a session that still counts as continuous play.
 *
 * Two heartbeats' worth. Anything longer means the tab was backgrounded, throttled, or
 * the machine slept, and the *first tick after* such a gap is a resume artifact: the
 * frame counter covers a window in which the browser was not scheduling frames at all.
 */
const CONTINUITY_MS = 2 * HEARTBEAT_MS + 1_000;
/** Distinct error messages surfaced per game. Enough to see a pattern, not a wall. */
const MAX_ERROR_SAMPLES = 5;

export interface GameHealth {
  slug: string;
  /** Distinct play sessions, i.e. distinct opens of the game. */
  sessions: number;
  /** Sessions that recorded an open but never any play time — the bounce count. */
  bounces: number;
  /** Sessions that reported a clean exit. A shortfall means tabs killed outright. */
  closes: number;
  /** Median of each session's total focused play time. The honest duration measure. */
  medianPlaySeconds: number;
  totalPlaySeconds: number;
  /** Uncaught errors and unhandled rejections reported by the bridge. */
  errors: number;
  /**
   * Most frequent distinct messages, worst first.
   *
   * **The one field here that is attacker-controlled.** Everything else is a number this
   * service computed; a message is a string a game chose to emit, bounded to 200
   * characters but otherwise arbitrary. Rendering it as text to an operator is safe
   * (React escapes it). Feeding it to a coding agent is not — that is a prompt-injection
   * channel, and IL-3 is the phase that will want to. Fence or summarize it there;
   * never interpolate it into an agent's instructions.
   */
  errorSamples: Array<{ message: string; count: number }>;
  /** Liveness ticks trusted for the frame stats below (see `resumeTicksIgnored`). */
  aliveTicks: number;
  /** Trusted ticks that observed no frames at all — the game was genuinely frozen. */
  stalledTicks: number;
  /** `stalledTicks / aliveTicks`, or 0 when nothing was measured. */
  stallRate: number;
  /** Median observed frames per second across trusted ticks; null when unmeasured. */
  medianFps: number | null;
  /**
   * Ticks discarded as resume artifacts. Reported rather than hidden: it is the
   * difference between "this game stalls" and "this player closed their laptop".
   */
  resumeTicksIgnored: number;
}

interface SessionState {
  playSeconds: number;
  closed: boolean;
  /** Previous event's position, for deciding whether the next tick is continuous. */
  lastOffsetMs: number | undefined;
  lastAtMs: number;
}

/**
 * Was this event close enough behind the previous one in its session to trust?
 *
 * Both clocks have to agree. The monotonic offset alone is not enough: it does not
 * advance while a machine sleeps, so a three-hour nap can look like a five-second gap in
 * offsets while the wall clock shows the truth. Wall clock alone is not enough either,
 * since it is only anchored per flush. Requiring both to be tight means a tick is
 * trusted only when nothing odd happened on either.
 */
function isContinuous(state: SessionState, event: TelemetryEvent): boolean {
  const atMs = Date.parse(event.at);
  if (Number.isFinite(atMs) && atMs - state.lastAtMs > CONTINUITY_MS) return false;
  if (state.lastOffsetMs === undefined || event.msSinceOpen === undefined) {
    // An older client sent no offsets. The wall-clock check above is all there is, and
    // it already passed, so accept rather than discard real data.
    return true;
  }
  return event.msSinceOpen - state.lastOffsetMs <= CONTINUITY_MS;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Aggregates events into one row per game.
 *
 * Events may arrive in any order and from any number of days; they are sorted per
 * session before the continuity checks, because "the previous event" is only meaningful
 * in time order and Firestore returns documents in id order.
 */
export function summarizeGameHealth(events: TelemetryEvent[]): GameHealth[] {
  const bySlug = new Map<string, TelemetryEvent[]>();
  for (const event of events) {
    const bucket = bySlug.get(event.slug);
    if (bucket) bucket.push(event);
    else bySlug.set(event.slug, [event]);
  }

  const rows: GameHealth[] = [];
  for (const [slug, slugEvents] of bySlug) {
    const sessions = new Map<string, SessionState>();
    const errorCounts = new Map<string, number>();
    const fpsSamples: number[] = [];
    let errors = 0;
    let aliveTicks = 0;
    let stalledTicks = 0;
    let resumeTicksIgnored = 0;

    // Group first, then order within each session: interleaved sessions would otherwise
    // make every event look discontinuous from the one before it.
    const bySession = new Map<string, TelemetryEvent[]>();
    for (const event of slugEvents) {
      const bucket = bySession.get(event.sessionId);
      if (bucket) bucket.push(event);
      else bySession.set(event.sessionId, [event]);
    }

    for (const [sessionId, unordered] of bySession) {
      const ordered = [...unordered].sort(
        (a, b) => (a.msSinceOpen ?? 0) - (b.msSinceOpen ?? 0) || a.at.localeCompare(b.at),
      );
      const state: SessionState = {
        playSeconds: 0,
        closed: false,
        lastOffsetMs: undefined,
        lastAtMs: Date.parse(ordered[0].at),
      };
      sessions.set(sessionId, state);

      for (const event of ordered) {
        switch (event.type) {
          case 'play_time':
            state.playSeconds += event.seconds ?? 0;
            break;
          case 'game_closed':
            state.closed = true;
            break;
          case 'error': {
            errors += 1;
            const message = event.message ?? '(no message)';
            errorCounts.set(message, (errorCounts.get(message) ?? 0) + 1);
            break;
          }
          case 'alive': {
            if (!isContinuous(state, event)) {
              resumeTicksIgnored += 1;
              break;
            }
            aliveTicks += 1;
            const frames = event.frames ?? 0;
            if (frames === 0) stalledTicks += 1;
            // Measure fps against the gap actually observed rather than the nominal
            // heartbeat, so a slow tick is not mistaken for a slow game.
            const gapMs =
              state.lastOffsetMs !== undefined && event.msSinceOpen !== undefined
                ? event.msSinceOpen - state.lastOffsetMs
                : HEARTBEAT_MS;
            if (gapMs > 0) fpsSamples.push(frames / (gapMs / 1000));
            break;
          }
          default:
            break;
        }

        const atMs = Date.parse(event.at);
        if (Number.isFinite(atMs)) state.lastAtMs = atMs;
        if (event.msSinceOpen !== undefined) state.lastOffsetMs = event.msSinceOpen;
      }
    }

    const playPerSession = [...sessions.values()].map((state) => state.playSeconds);
    rows.push({
      slug,
      sessions: sessions.size,
      bounces: playPerSession.filter((seconds) => seconds === 0).length,
      closes: [...sessions.values()].filter((state) => state.closed).length,
      medianPlaySeconds: median(playPerSession) ?? 0,
      totalPlaySeconds: playPerSession.reduce((sum, seconds) => sum + seconds, 0),
      errors,
      errorSamples: [...errorCounts.entries()]
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message))
        .slice(0, MAX_ERROR_SAMPLES),
      aliveTicks,
      stalledTicks,
      stallRate: aliveTicks === 0 ? 0 : stalledTicks / aliveTicks,
      medianFps: median(fpsSamples),
      resumeTicksIgnored,
    });
  }

  // Worst first: anything erroring or stalling is what the view exists to surface, and
  // among healthy games the most played is the most consequential.
  return rows.sort(
    (a, b) =>
      Number(b.errors > 0) - Number(a.errors > 0) ||
      b.stallRate - a.stallRate ||
      b.sessions - a.sessions ||
      a.slug.localeCompare(b.slug),
  );
}

/** The `yyyy-mm-dd` partition names for the last `days` days, most recent first. */
export function recentPartitions(days: number, now: number = Date.now()): string[] {
  return Array.from({ length: Math.max(1, days) }, (_, index) =>
    new Date(now - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
}
