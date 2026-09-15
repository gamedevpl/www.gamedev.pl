// One day of play events, rolled into one document.

import { summarizeGameHealthDetailed, type GameHealth, type GameHealthDetail } from './telemetry-health.js';
import type { TelemetryEvent } from './store.js';

// Bump when the shape changes, or when the summarizer's counting does.

// A stored day at the wrong version is ignored, never merged.
export const DAILY_AGGREGATE_VERSION = 1;

// Values kept per metric per game on a quiet day.

// Under this, the merged median is exact.
export const MAX_SAMPLES_PER_METRIC = 128;

// Sample values the whole day document may carry, across every game.

// A busy day spends it on more games, not deeper samples.
export const MAX_SAMPLE_VALUES_PER_DAY = 18_000;

// The floor the per-game budget never drops below.
const MIN_SAMPLES_PER_METRIC = 16;

// A ceiling on games, well past any day this catalog has had.
export const MAX_GAMES_PER_DAY = 400;

// Tally rows per game, against the 5 and 8 reported.

// The byte budget bounds the document, so this can be generous.
export const MAX_TALLY_ROWS_PER_GAME = 64;

// The floor: below this the window can no longer rerank at all.
const MIN_TALLY_ROWS_PER_GAME = 8;

// What the whole serialized day may weigh, against Firestore's 1 MiB.

// An error message is capped at 200 chars, so tallies outweigh samples.
export const MAX_DOCUMENT_BYTES = 700_000;

export interface SampleSet {
  // The day's real value count, which is their weight.
  count: number;
  // Sorted ascending, at most MAX_SAMPLES_PER_METRIC of them.
  values: number[];
}

type DailyCounters = Omit<
  GameHealth,
  'medianPlaySeconds' | 'medianFps' | 'medianBestScore' | 'errorSamples' | 'progressLabels'
>;

export interface DailyGameAggregate extends DailyCounters {
  playSeconds: SampleSet;
  fps: SampleSet;
  bestScores: SampleSet;
  // Deeper than the reported top-N, so the window reranks.
  errorTally: { message: string; count: number }[];
  labelTally: { label: string; sessions: number }[];
}

export interface DailyTelemetryAggregate {
  date: string;
  version: number;
  computedAt: string;
  // False while the day can still receive events.
  sealed: boolean;
  // The day's scan hit its budget; counts are floors.
  truncated: boolean;
  // More games played that day than a single document holds.

  // Folded into the sweep's own truncated flag, never reported alone.
  gamesTruncated: boolean;

  // The byte budget bound, so this day reranks over fewer candidates.

  // Folded in the same way as games dropped for size.
  tallyTruncated?: boolean;
  games: DailyGameAggregate[];
}

// Evenly spaced through the sorted values, endpoints included.
export function downsample(values: number[], max: number = MAX_SAMPLES_PER_METRIC): SampleSet {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length <= max) return { count: sorted.length, values: sorted };
  const picked: number[] = [];
  for (let index = 0; index < max; index++) {
    picked.push(sorted[Math.round((index * (sorted.length - 1)) / (max - 1))]);
  }
  return { count: sorted.length, values: picked };
}

function toGameAggregate(detail: GameHealthDetail, perMetric: number, tallyRows: number): DailyGameAggregate {
  const {
    samples,
    medianPlaySeconds: _p,
    medianFps: _f,
    medianBestScore: _b,
    errorSamples: _e,
    progressLabels: _l,
    ...row
  } = detail;
  return {
    ...row,
    playSeconds: downsample(samples.playSeconds, perMetric),
    fps: downsample(samples.fps, perMetric),
    bestScores: downsample(samples.bestScores, perMetric),
    errorTally: samples.errorTally.slice(0, tallyRows),
    labelTally: samples.labelTally.slice(0, tallyRows),
  };
}

// Deep for a few games, shallower for a whole catalog.

// Dropping a game is worse than estimating its median slightly less finely.
export function samplesPerMetric(games: number): number {
  if (games <= 0) return MAX_SAMPLES_PER_METRIC;
  const share = Math.floor(MAX_SAMPLE_VALUES_PER_DAY / (3 * games));
  return Math.max(MIN_SAMPLES_PER_METRIC, Math.min(MAX_SAMPLES_PER_METRIC, share));
}

// Tally rows cost far more bytes than sample values do.

// So rerank range shrinks first, then depth, and a game goes last.
export function fitWithinDocument(ranked: GameHealthDetail[]): {
  games: DailyGameAggregate[];
  gamesTruncated: boolean;
  tallyTruncated: boolean;
} {
  let keep = Math.min(ranked.length, MAX_GAMES_PER_DAY);
  let perMetric = samplesPerMetric(keep);
  let tallyRows = MAX_TALLY_ROWS_PER_GAME;
  const shape = () => ranked.slice(0, keep).map((detail) => toGameAggregate(detail, perMetric, tallyRows));

  let games = shape();
  // Bounded: each pass either halves a budget or drops games proportionally.
  for (let pass = 0; pass < 32; pass++) {
    const bytes = Buffer.byteLength(JSON.stringify(games));
    if (bytes <= MAX_DOCUMENT_BYTES) break;
    if (tallyRows > MIN_TALLY_ROWS_PER_GAME) {
      tallyRows = Math.max(MIN_TALLY_ROWS_PER_GAME, Math.floor(tallyRows / 2));
    } else if (perMetric > MIN_SAMPLES_PER_METRIC) {
      perMetric = Math.max(MIN_SAMPLES_PER_METRIC, Math.floor(perMetric / 2));
    } else {
      const fits = Math.floor((keep * MAX_DOCUMENT_BYTES) / bytes);
      keep = Math.max(1, Math.min(keep - 1, fits));
    }
    games = shape();
  }

  // True whichever way a candidate was lost, budget or sheer variety.
  const lostCandidates = ranked
    .slice(0, keep)
    .some(({ samples }) => samples.errorTally.length > tallyRows || samples.labelTally.length > tallyRows);

  return {
    games,
    gamesTruncated: games.length < ranked.length,
    tallyTruncated: lostCandidates,
  };
}

export function buildDailyAggregate(
  date: string,
  events: TelemetryEvent[],
  meta: { computedAt: string; sealed: boolean; truncated: boolean },
): DailyTelemetryAggregate {
  const rows = summarizeGameHealthDetailed(events);
  const ranked = [...rows].sort((a, b) => b.sessions - a.sessions || a.slug.localeCompare(b.slug));
  const { games, gamesTruncated, tallyTruncated } = fitWithinDocument(ranked);
  return {
    date,
    version: DAILY_AGGREGATE_VERSION,
    computedAt: meta.computedAt,
    sealed: meta.sealed,
    truncated: meta.truncated,
    gamesTruncated,
    tallyTruncated,
    games,
  };
}

interface Weighted {
  value: number;
  weight: number;
}

// A kept value stands for several real ones.

// Every weight is 1 when nothing was downsampled.
export function weightedMedian(pairs: Weighted[]): number | null {
  const total = pairs.reduce((sum, pair) => sum + pair.weight, 0);
  if (total === 0) return null;
  const sorted = [...pairs].sort((a, b) => a.value - b.value);
  const half = total / 2;
  let seen = 0;
  for (let index = 0; index < sorted.length; index++) {
    seen += sorted[index].weight;
    if (seen > half) return sorted[index].value;
    if (seen === half) {
      const next = sorted[index + 1];
      return next ? (sorted[index].value + next.value) / 2 : sorted[index].value;
    }
  }
  return sorted[sorted.length - 1].value;
}

function weighted(sets: SampleSet[]): Weighted[] {
  const pairs: Weighted[] = [];
  for (const set of sets) {
    if (set.values.length === 0) continue;
    const weight = set.count / set.values.length;
    for (const value of set.values) pairs.push({ value, weight });
  }
  return pairs;
}

function topBy<T>(entries: Map<string, number>, limit: number, key: (label: string, count: number) => T): T[] {
  return [...entries.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => key(label, count));
}

const MAX_ERROR_SAMPLES = 5;
const MAX_PROGRESS_LABELS = 8;

function mergeGame(days: DailyGameAggregate[]): GameHealth {
  const first = days[0];
  const sum = (pick: (day: DailyGameAggregate) => number) => days.reduce((acc, day) => acc + pick(day), 0);

  const errorCounts = new Map<string, number>();
  for (const day of days) {
    for (const sample of day.errorTally)
      errorCounts.set(sample.message, (errorCounts.get(sample.message) ?? 0) + sample.count);
  }
  const labelCounts = new Map<string, number>();
  for (const day of days) {
    for (const label of day.labelTally)
      labelCounts.set(label.label, (labelCounts.get(label.label) ?? 0) + label.sessions);
  }

  const sessions = sum((day) => day.sessions);
  const aliveTicks = sum((day) => day.aliveTicks);
  const stalledTicks = sum((day) => day.stalledTicks);
  const won = sum((day) => day.outcomes.won);
  const lost = sum((day) => day.outcomes.lost);
  const decided = won + lost;
  const sessionsWithEnding = sum((day) => day.sessionsWithEnding);
  const zoneAdmitted = sum((day) => day.zoneAdmitted);
  const zoneJoined = sum((day) => day.zoneJoined);

  return {
    slug: first.slug,
    sessions,
    bounces: sum((day) => day.bounces),
    closes: sum((day) => day.closes),
    medianPlaySeconds: weightedMedian(weighted(days.map((day) => day.playSeconds))) ?? 0,
    totalPlaySeconds: sum((day) => day.totalPlaySeconds),
    errors: sum((day) => day.errors),
    errorSamples: topBy(errorCounts, MAX_ERROR_SAMPLES, (message, count) => ({ message, count })),
    aliveTicks,
    stalledTicks,
    stallRate: aliveTicks === 0 ? 0 : stalledTicks / aliveTicks,
    medianFps: weightedMedian(weighted(days.map((day) => day.fps))),
    resumeTicksIgnored: sum((day) => day.resumeTicksIgnored),
    outcomes: { won, lost, quit: sum((day) => day.outcomes.quit) },
    sessionsWithEnding,
    zoneAdmitted,
    zoneJoined,
    zoneJoinRate: zoneAdmitted === 0 ? null : zoneJoined / zoneAdmitted,
    finishRate: sessions === 0 ? 0 : sessionsWithEnding / sessions,
    winRate: decided === 0 ? null : won / decided,
    medianBestScore: weightedMedian(weighted(days.map((day) => day.bestScores))),
    progressLabels: topBy(labelCounts, MAX_PROGRESS_LABELS, (label, count) => ({ label, sessions: count })),
    gfxBackends: {
      canvas2d: sum((day) => day.gfxBackends.canvas2d),
      webgl: sum((day) => day.gfxBackends.webgl),
      webgl3d: sum((day) => day.gfxBackends.webgl3d),
    },
  };
}

// A session crossing UTC midnight is counted in both partitions.

// The write path buckets by event time; the seam precedes this.
export function mergeDailyAggregates(days: DailyTelemetryAggregate[]): GameHealth[] {
  const bySlug = new Map<string, DailyGameAggregate[]>();
  for (const day of days) {
    for (const game of day.games) {
      const bucket = bySlug.get(game.slug);
      if (bucket) bucket.push(game);
      else bySlug.set(game.slug, [game]);
    }
  }

  return [...bySlug.values()]
    .map(mergeGame)
    .sort(
      (a, b) =>
        Number(b.errors > 0) - Number(a.errors > 0) ||
        b.stallRate - a.stallRate ||
        b.sessions - a.sessions ||
        a.slug.localeCompare(b.slug),
    );
}

// How far back a day must be to seal.

// One leaves today and yesterday open, for late flushes.
export const SEAL_LAG_DAYS = 1;

export interface DailyWindowReader {
  read(dateStr: string, limit: number): Promise<TelemetryEvent[]>;
  get(dateStr: string): Promise<DailyTelemetryAggregate | undefined>;
  put(dateStr: string, aggregate: DailyTelemetryAggregate): Promise<void>;
}

export interface DailyWindow {
  days: DailyTelemetryAggregate[];
  scanned: string[];
  truncated: boolean;
  // Partitions this run actually read event by event.
  rescanned: number;
  // Partitions served by a sealed rollup, at one document each.
  reused: number;
}

// Reads each day from its rollup, scanning only what has none.

// A sealed day is written once and read back forever.
export async function readDailyWindow(
  requested: string[],
  budget: { perDay: number; total: number },
  reader: DailyWindowReader,
  meta: { computedAt: string; sealedBefore: string },
  onError?: (dateStr: string, error: unknown) => void,
): Promise<DailyWindow> {
  const days: DailyTelemetryAggregate[] = [];
  const scanned: string[] = [];
  let truncated = false;
  let remaining = budget.total;
  let rescanned = 0;
  let reused = 0;

  for (const dateStr of requested) {
    const stored = await reader.get(dateStr);
    if (stored?.sealed && stored.version === DAILY_AGGREGATE_VERSION) {
      days.push(stored);
      scanned.push(dateStr);
      // Games dropped, or tallies shortened, make every count a floor too.
      if (stored.truncated || stored.gamesTruncated || stored.tallyTruncated) truncated = true;
      reused += 1;
      continue;
    }

    if (remaining <= 0) {
      // Out of budget, so the window measured is the narrower one.
      truncated = true;
      break;
    }
    const limit = Math.min(budget.perDay, remaining);
    const events = await reader.read(dateStr, limit);
    remaining -= events.length;
    rescanned += 1;
    // A day at its cap leaves every count a floor.
    const dayTruncated = events.length >= limit;
    if (dayTruncated) truncated = true;
    const aggregate = buildDailyAggregate(dateStr, events, {
      computedAt: meta.computedAt,
      // Sealed even when truncated: a rescan reads the same page.
      sealed: dateStr < meta.sealedBefore,
      truncated: dayTruncated,
    });
    if (aggregate.gamesTruncated || aggregate.tallyTruncated) truncated = true;
    days.push(aggregate);
    scanned.push(dateStr);
    try {
      await reader.put(dateStr, aggregate);
    } catch (error) {
      // An unwritable rollup costs next night's saving, never tonight's scorecards.
      onError?.(dateStr, error);
    }
  }

  return { days, scanned, truncated, rescanned, reused };
}

// The first date that is still too recent to seal.
export function sealedBefore(now: number, lagDays: number = SEAL_LAG_DAYS): string {
  return new Date(now - lagDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
