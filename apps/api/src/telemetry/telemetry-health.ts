import type { GameHealth } from '@gamedevpl/contract';
export type { GameHealth };
import type { TelemetryEvent } from '../store.js';

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

interface SessionState {
  playSeconds: number;
  closed: boolean;
  /** Previous event's position, for deciding whether the next tick is continuous. */
  lastOffsetMs: number | undefined;
  lastAtMs: number;
  /** Did any round in this session reach a conclusion? */
  reachedEnd: boolean;
  /** Was a seat issued for a shared world this session? */
  zoneAdmitted: boolean;
  /** Did one actually arrive? */
  zoneJoined: boolean;
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
        zoneAdmitted: false,
        zoneJoined: false,
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
          case 'zone_link': {
            if (event.step === 'admitted') state.zoneAdmitted = true;
            else if (event.step === 'joined') state.zoneJoined = true;
            break;
          }
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
    const zoneAdmitted = sessionStates.filter((state) => state.zoneAdmitted).length;
    // Both rungs, not `joined` alone. Telemetry is best-effort and batched, so a session
    // can land its `joined` while the request carrying its `admitted` was dropped — and
    // counting the two independently would then put a session in the numerator that is
    // missing from the denominator, producing a join rate above 100%. A ratio that can
    // exceed its own maximum discredits the column it sits in more thoroughly than the
    // gap it was reporting.
    //
    // A session missing its `admitted` is therefore dropped from both sides rather than
    // guessed at: it is one more "no evidence", which this file already renders as
    // absence. The residual bias runs the safe way — a lost `joined` batch reads as a
    // fallback, so the number understates success rather than inventing it.
    const zoneJoined = sessionStates.filter((state) => state.zoneAdmitted && state.zoneJoined).length;
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
      zoneAdmitted,
      zoneJoined,
      // Null, not zero, when this game never asked for a zone — the same rule the rest of
      // this file follows and the operator page renders as an em dash. A game with no
      // zone and a zone that never connects must not read the same.
      zoneJoinRate: zoneAdmitted === 0 ? null : zoneJoined / zoneAdmitted,
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
