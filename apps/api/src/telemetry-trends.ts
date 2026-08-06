import type { SubmissionRecord, User, VisitEvent } from './store.js';
import { BOT_UID_PREFIX } from './store.js';
import { returnedAfterPublish } from './creator-metrics.js';

/**
 * Time series for the operator telemetry tab — the glance that answers "is this
 * getting better or worse?" rather than "what happened in this window".
 *
 * Daily points are the source of truth. Weekly / monthly grains and rolling
 * averages are pure rollups over those points (same module, same tests), so the
 * three timescales cannot drift from each other.
 *
 * Visits / plays / creations come from the anonymous visit stream, partitioned
 * by UTC day. Retention is the Stage 0 D7 return rate, plotted on the day a
 * creator's 7-day window closes (the first day the outcome is knowable) — not
 * on the publish day, which would be a prediction.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrendGrain = 'day' | 'week' | 'month';

export interface DailyActivityPoint {
  /** UTC `yyyy-mm-dd` partition the counts were read from. */
  date: string;
  /** Distinct visits that recorded `visit_started` that day. */
  visits: number;
  /** `play_started` events that day — one sitting can contribute several. */
  plays: number;
  /** Distinct visits that reached `submission_created` that day. */
  creations: number;
  /** True when this day's read hit its cap, so the counts are a floor. */
  truncated: boolean;
}

export interface DailyRetentionPoint {
  /**
   * The day the D7 window closed for this cohort (publish day + 7).
   * Absent cohorts still appear as a zero-eligible row when the activity
   * series has that day, so the two charts stay aligned.
   */
  date: string;
  eligible: number;
  returned: number;
  /** Null when nobody's window closed that day — absence, not a measured 0%. */
  rate: number | null;
}

export interface TelemetryTrends {
  /** Days actually scanned, oldest first — chart order. */
  days: string[];
  truncated: boolean;
  activity: DailyActivityPoint[];
  retention: DailyRetentionPoint[];
}

/** One day's activity from its visit-event partition. */
export function summarizeVisitDay(dateStr: string, events: VisitEvent[], truncated = false): DailyActivityPoint {
  const started = new Set<string>();
  const created = new Set<string>();
  let plays = 0;

  for (const event of events) {
    if (event.type === 'visit_started') {
      started.add(event.visitId);
    } else if (event.type === 'play_started') {
      plays += 1;
    } else if (event.type === 'create_step' && event.step === 'submission_created') {
      created.add(event.visitId);
    }
  }

  return {
    date: dateStr,
    visits: started.size,
    plays,
    creations: created.size,
    truncated,
  };
}

/**
 * D7 return, one point per eligibility day.
 *
 * A creator who published on day P becomes eligible on day P+7. Plotting on P+7
 * means every point is a resolved outcome, never a half-open window. Creators
 * whose window has not yet closed are excluded — same honesty rule as
 * `summarizeCreatorMetrics`.
 */
export function summarizeRetentionByEligibilityDay(
  submissions: SubmissionRecord[],
  usersByUid: Map<string, User>,
  dayKeys: string[],
  now: number = Date.now(),
): DailyRetentionPoint[] {
  const daySet = new Set(dayKeys);
  const cohorts = new Map<string, { eligible: number; returned: number }>();

  // One row per creator (earliest publish), matching summarizeCreatorMetrics.
  const earliestPublishByOwner = new Map<string, string>();
  for (const submission of submissions) {
    if (submission.ownerUid.startsWith(BOT_UID_PREFIX)) continue;
    const at = submission.publishedAt;
    if (!at) continue;
    const current = earliestPublishByOwner.get(submission.ownerUid);
    if (current === undefined || at < current) earliestPublishByOwner.set(submission.ownerUid, at);
  }

  earliestPublishByOwner.forEach((publishedAt, uid) => {
    const published = Date.parse(publishedAt);
    if (!Number.isFinite(published)) return;
    const publishDay = new Date(published).toISOString().slice(0, 10);
    const eligibleAt = Date.parse(`${publishDay}T00:00:00.000Z`) + 7 * DAY_MS;
    if (!Number.isFinite(eligibleAt) || now < eligibleAt) return;
    const eligibleDay = new Date(eligibleAt).toISOString().slice(0, 10);
    if (!daySet.has(eligibleDay)) return;

    const cohort = cohorts.get(eligibleDay) ?? { eligible: 0, returned: 0 };
    cohort.eligible += 1;
    if (returnedAfterPublish(usersByUid.get(uid)?.activeDays, publishedAt)) {
      cohort.returned += 1;
    }
    cohorts.set(eligibleDay, cohort);
  });

  return dayKeys.map((date) => {
    const cohort = cohorts.get(date);
    if (!cohort || cohort.eligible === 0) {
      return { date, eligible: 0, returned: 0, rate: null };
    }
    return {
      date,
      eligible: cohort.eligible,
      returned: cohort.returned,
      rate: cohort.returned / cohort.eligible,
    };
  });
}

export interface RolledPoint {
  /** Period key: day `yyyy-mm-dd`, week start `yyyy-mm-dd`, or month `yyyy-mm`. */
  key: string;
  label: string;
  visits: number;
  plays: number;
  creations: number;
  /** Retention over the period: null when no cohort closed inside it. */
  retentionRate: number | null;
  retentionEligible: number;
  retentionReturned: number;
  truncated: boolean;
}

/** Roll daily activity + retention up to week or month. Day grain is a pass-through. */
export function rollupTrends(
  activity: DailyActivityPoint[],
  retention: DailyRetentionPoint[],
  grain: TrendGrain,
): RolledPoint[] {
  if (grain === 'day') {
    const byDate = new Map(retention.map((row) => [row.date, row]));
    return activity.map((row) => {
      const ret = byDate.get(row.date);
      return {
        key: row.date,
        label: row.date.slice(5), // mm-dd — short axis labels
        visits: row.visits,
        plays: row.plays,
        creations: row.creations,
        retentionRate: ret?.rate ?? null,
        retentionEligible: ret?.eligible ?? 0,
        retentionReturned: ret?.returned ?? 0,
        truncated: row.truncated,
      };
    });
  }

  const buckets = new Map<
    string,
    {
      label: string;
      visits: number;
      plays: number;
      creations: number;
      retentionEligible: number;
      retentionReturned: number;
      truncated: boolean;
    }
  >();

  const retentionByDate = new Map(retention.map((row) => [row.date, row]));

  for (const row of activity) {
    const { key, label } = periodKey(row.date, grain);
    const bucket = buckets.get(key) ?? {
      label,
      visits: 0,
      plays: 0,
      creations: 0,
      retentionEligible: 0,
      retentionReturned: 0,
      truncated: false,
    };
    bucket.visits += row.visits;
    bucket.plays += row.plays;
    bucket.creations += row.creations;
    if (row.truncated) bucket.truncated = true;
    const ret = retentionByDate.get(row.date);
    if (ret) {
      bucket.retentionEligible += ret.eligible;
      bucket.retentionReturned += ret.returned;
    }
    buckets.set(key, bucket);
  }

  return Array.from(buckets, ([key, bucket]) => ({
    key,
    label: bucket.label,
    visits: bucket.visits,
    plays: bucket.plays,
    creations: bucket.creations,
    retentionEligible: bucket.retentionEligible,
    retentionReturned: bucket.retentionReturned,
    retentionRate: bucket.retentionEligible === 0 ? null : bucket.retentionReturned / bucket.retentionEligible,
    truncated: bucket.truncated,
  }));
}

/**
 * Trailing mean over `window` points. Until the window is full the average uses
 * whatever points exist (so the left edge of a chart is not blank); a stretch of
 * all-null inputs stays null.
 */
export function rollingAverage(values: Array<number | null>, window: number): Array<number | null> {
  const size = Math.max(1, Math.floor(window));
  return values.map((_, index) => {
    const from = Math.max(0, index - size + 1);
    let sum = 0;
    let count = 0;
    for (let i = from; i <= index; i += 1) {
      const value = values[i];
      if (value === null) continue;
      sum += value;
      count += 1;
    }
    return count === 0 ? null : sum / count;
  });
}

/** ISO week starts Monday; month is calendar month. Keys sort lexicographically. */
export function periodKey(dateStr: string, grain: TrendGrain): { key: string; label: string } {
  if (grain === 'day') return { key: dateStr, label: dateStr.slice(5) };
  if (grain === 'month') {
    const key = dateStr.slice(0, 7);
    return { key, label: key };
  }
  const start = weekStart(dateStr);
  return { key: start, label: `w ${start.slice(5)}` };
}

function weekStart(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  // getUTCDay: 0 Sun … 6 Sat. Shift so Monday is 0.
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

/** Oldest-first partition list for a chart window ending at `now`. */
export function trendPartitions(days: number, now: number = Date.now()): string[] {
  const count = Math.max(1, days);
  return Array.from({ length: count }, (_, index) =>
    new Date(now - (count - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  );
}
