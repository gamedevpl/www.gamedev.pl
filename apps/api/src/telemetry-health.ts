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
/**
 * Distinct progress landmarks surfaced per game.
 *
 * A cap rather than a full list because the label vocabulary belongs to the game, not to
 * us: a game played across many sessions can name more landmarks than a table can show.
 */
const MAX_PROGRESS_LABELS = 8;
/**
 * Distinct labels tracked *per session*, before ranking.
 *
 * `progress` is hostile input like everything else from a game: the write path bounds a
 * label's length (40 chars) and a session's *total* event count (400, in telemetry.ts)
 * but nothing bounds how many of those events name a *new* label. Without this, one
 * session emitting hundreds of distinct throwaway labels would out-populate every real
 * landmark in the tally for the whole game. The session's other numbers are still real,
 * so only its labels past this point are ignored, not the session itself.
 */
const MAX_TRACKED_LABELS_PER_SESSION = 20;

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

  // Depth: does the game get *finished*, not merely opened and endured. Everything
  // below is dark for a game whose GameKit snapshot never reaches a terminal state, so
  // a zero here means "no evidence", never "nobody finished".

  /**
   * Rounds that reached a conclusion, by outcome. Counted per round, not per session:
   * one sitting that loses four times and wins once is five data points about the game's
   * difficulty and one about its reach.
   */
  outcomes: { won: number; lost: number; quit: number };
  /** Sessions in which at least one round reached a conclusion. */
  sessionsWithEnding: number;
  /**
   * `sessionsWithEnding / sessions` — how often opening the game turns into finishing a
   * round of it. The counterpart to `bounces` at the other end of the session.
   */
  finishRate: number;
  /**
   * `won / (won + lost)`, or null when no round was decided.
   *
   * Quits are excluded rather than counted as losses: leaving is a statement about the
   * game holding attention (which `finishRate` already measures), not about its
   * difficulty, and folding the two together would make an abandoned game look brutally
   * hard instead of boring.
   */
  winRate: number | null;
  /**
   * Median across sessions of each session's *best* score; null when nothing scored.
   *
   * Best-per-session before the median because a score stream reports every improvement,
   * so averaging the raw values would mostly measure how chatty a game is. Median across
   * sessions for the usual reason: one expert should not become the typical player.
   */
  medianBestScore: number | null;
  /**
   * Landmarks reached, most-reached first — the drop-off curve when a game emits them.
   *
   * `sessions` counts sessions that reached the label at least once, so a level replayed
   * five times still counts once; that makes the numbers monotonically comparable down a
   * linear game's funnel.
   *
   * **Attacker-controlled, exactly like `errorSamples`** — a label is a string the game
   * chose, clamped to 40 characters and otherwise arbitrary. Same rule: safe to render,
   * never safe to interpolate into an agent's instructions.
   */
  progressLabels: Array<{ label: string; sessions: number }>;
  /**
   * Sessions that reported a render backend on `end` / `progress` (B18).
   * Soft capture vs live WebGL — fixed vocabulary only.
   */
  gfxBackends: { canvas2d: number; webgl: number; webgl3d: number };
}

interface SessionState {
  playSeconds: number;
  closed: boolean;
  /** Previous event's position, for deciding whether the next tick is continuous. */
  lastOffsetMs: number | undefined;
  lastAtMs: number;
  /** Did any round in this session reach a conclusion? */
  reachedEnd: boolean;
  /** Highest score this session reported; null when it never scored. */
  bestScore: number | null;
  /** Landmarks this session reached, deduplicated — a replay is not extra reach. */
  labels: Set<string>;
  /** Last reported render backend on progress/end (B18). */
  gfxBackend: 'canvas2d' | 'webgl' | 'webgl3d' | null;
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
    const outcomes = { won: 0, lost: 0, quit: 0 };
    const labelSessions = new Map<string, number>();

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
        reachedEnd: false,
        bestScore: null,
        labels: new Set(),
        gfxBackend: null,
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
          // The three depth events below take no continuity check, unlike `alive`. That
          // check exists because a frame counter is only meaningful against the interval
          // it covers, and a slept machine breaks the interval. An ending is a discrete
          // thing the player did: waking a laptop does not fabricate one, and discarding
          // a real win because the tab was backgrounded first would just lose data.
          case 'end': {
            const outcome = event.outcome;
            if (outcome !== 'won' && outcome !== 'lost' && outcome !== 'quit') break;
            outcomes[outcome] += 1;
            state.reachedEnd = true;
            if (event.gfxBackend === 'canvas2d' || event.gfxBackend === 'webgl' || event.gfxBackend === 'webgl3d') {
              state.gfxBackend = event.gfxBackend;
            }
            break;
          }
          case 'score': {
            const value = event.value;
            if (typeof value !== 'number' || !Number.isFinite(value)) break;
            state.bestScore = state.bestScore === null ? value : Math.max(state.bestScore, value);
            break;
          }
          case 'progress': {
            const label = event.label;
            if (typeof label !== 'string' || label.length === 0) break;
            if (state.labels.size < MAX_TRACKED_LABELS_PER_SESSION || state.labels.has(label)) {
              state.labels.add(label);
            }
            if (event.gfxBackend === 'canvas2d' || event.gfxBackend === 'webgl' || event.gfxBackend === 'webgl3d') {
              state.gfxBackend = event.gfxBackend;
            }
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

    const sessionStates = [...sessions.values()];
    for (const state of sessionStates) {
      for (const label of state.labels) labelSessions.set(label, (labelSessions.get(label) ?? 0) + 1);
    }

    const playPerSession = sessionStates.map((state) => state.playSeconds);
    const bestScores = sessionStates.map((state) => state.bestScore).filter((score): score is number => score !== null);
    const sessionsWithEnding = sessionStates.filter((state) => state.reachedEnd).length;
    const decided = outcomes.won + outcomes.lost;
    const gfxBackends = { canvas2d: 0, webgl: 0, webgl3d: 0 };
    for (const state of sessionStates) {
      if (state.gfxBackend) gfxBackends[state.gfxBackend] += 1;
    }

    rows.push({
      slug,
      sessions: sessions.size,
      bounces: playPerSession.filter((seconds) => seconds === 0).length,
      closes: sessionStates.filter((state) => state.closed).length,
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
      outcomes,
      sessionsWithEnding,
      finishRate: sessions.size === 0 ? 0 : sessionsWithEnding / sessions.size,
      winRate: decided === 0 ? null : outcomes.won / decided,
      medianBestScore: median(bestScores),
      progressLabels: [...labelSessions.entries()]
        .map(([label, sessionCount]) => ({ label, sessions: sessionCount }))
        .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label))
        .slice(0, MAX_PROGRESS_LABELS),
      gfxBackends,
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

export interface PartitionScanBudget {
  /** Documents read from any single day's partition. */
  perDay: number;
  /** Documents read across the whole walk, which is what actually bounds cost. */
  total: number;
}

export interface PartitionScan<T> {
  events: T[];
  /** Partitions actually read, most recent first — never wider than what was asked for. */
  scanned: string[];
  /** True when any cap bit, so every count derived from this is a floor. */
  truncated: boolean;
}

/**
 * Reads a window of daily partitions under one shared document budget.
 *
 * Shared by the operator page and the scorecard sweep so the two cannot drift in how
 * they report truncation — a number shown to a human and the same number written into
 * a scorecard an agent reads must mean the same thing.
 *
 * The budget is a *parameter* rather than a constant because the two callers are paying
 * for different things: an interactive click wants a hard ceiling on latency and cost,
 * while a once-a-day batch can afford a wider window precisely because it runs once and
 * amortizes across every reader of the result.
 */
export async function scanPartitions<T>(
  days: string[],
  budget: PartitionScanBudget,
  read: (dateStr: string, limit: number) => Promise<T[]>,
): Promise<PartitionScan<T>> {
  const events: T[] = [];
  const scanned: string[] = [];
  let truncated = false;

  for (const dateStr of days) {
    const remaining = budget.total - events.length;
    if (remaining <= 0) {
      // Out of budget with days still unread: the window really scanned is narrower
      // than the one asked for, and `scanned` reports the narrower one so the range
      // attributed to the result is never wider than the range measured.
      truncated = true;
      break;
    }
    const limit = Math.min(budget.perDay, remaining);
    const dayEvents = await read(dateStr, limit);
    // A day at its cap means events were left unread, so every count is a floor.
    if (dayEvents.length >= limit) truncated = true;
    events.push(...dayEvents);
    scanned.push(dateStr);
  }

  return { events, scanned, truncated };
}
