import type { TrendGrain } from '@gamedevpl/contract';
import type { DailyActivityPoint, DailyMcpPoint, DailyRetentionPoint } from './healthApi.js';

export type { TrendGrain };

/**
 * Client-side rollups over the daily trends payload.
 *
 * The API ships daily points only (one source of truth, one read budget). Grain and
 * rolling averages are toggles an operator flips while looking — recomputing them
 * here keeps those clicks free of another Firestore walk.
 *
 * Arithmetic mirrors apps/api/src/telemetry/telemetry-trends.ts; keep the two in step.
 */

export type RollingWindow = 0 | 7 | 28;

export interface RolledTrendPoint {
  key: string;
  label: string;
  visits: number;
  plays: number;
  creations: number;
  selfChosen: number;
  platformChosen: number;
  connected: number;
  signaled: number;
  gateVerdicts: number;
  retentionRate: number | null;
  retentionEligible: number;
  retentionReturned: number;
  truncated: boolean;
}

export function rollupTrends(
  activity: DailyActivityPoint[],
  mcp: DailyMcpPoint[],
  retention: DailyRetentionPoint[],
  grain: TrendGrain,
): RolledTrendPoint[] {
  const mcpByDate = new Map(mcp.map((row) => [row.date, row]));
  const retentionByDate = new Map(retention.map((row) => [row.date, row]));

  if (grain === 'day') {
    return activity.map((row) => {
      const mcpRow = mcpByDate.get(row.date);
      const ret = retentionByDate.get(row.date);
      return {
        key: row.date,
        label: row.date.slice(5),
        visits: row.visits,
        plays: row.plays,
        creations: row.creations,
        selfChosen: mcpRow?.selfChosen ?? 0,
        platformChosen: mcpRow?.platformChosen ?? 0,
        connected: mcpRow?.connected ?? 0,
        signaled: mcpRow?.signaled ?? 0,
        gateVerdicts: mcpRow?.gateVerdicts ?? 0,
        retentionRate: ret?.rate ?? null,
        retentionEligible: ret?.eligible ?? 0,
        retentionReturned: ret?.returned ?? 0,
        truncated: row.truncated || mcpRow?.truncated === true,
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
      selfChosen: number;
      platformChosen: number;
      connected: number;
      signaled: number;
      gateVerdicts: number;
      retentionEligible: number;
      retentionReturned: number;
      truncated: boolean;
    }
  >();

  for (const row of activity) {
    const { key, label } = periodKey(row.date, grain);
    const bucket = buckets.get(key) ?? {
      label,
      visits: 0,
      plays: 0,
      creations: 0,
      selfChosen: 0,
      platformChosen: 0,
      connected: 0,
      signaled: 0,
      gateVerdicts: 0,
      retentionEligible: 0,
      retentionReturned: 0,
      truncated: false,
    };
    bucket.visits += row.visits;
    bucket.plays += row.plays;
    bucket.creations += row.creations;
    const mcpRow = mcpByDate.get(row.date);
    if (mcpRow) {
      bucket.selfChosen += mcpRow.selfChosen;
      bucket.platformChosen += mcpRow.platformChosen;
      bucket.connected += mcpRow.connected;
      bucket.signaled += mcpRow.signaled;
      bucket.gateVerdicts += mcpRow.gateVerdicts;
      if (mcpRow.truncated) bucket.truncated = true;
    }
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
    selfChosen: bucket.selfChosen,
    platformChosen: bucket.platformChosen,
    connected: bucket.connected,
    signaled: bucket.signaled,
    gateVerdicts: bucket.gateVerdicts,
    retentionEligible: bucket.retentionEligible,
    retentionReturned: bucket.retentionReturned,
    retentionRate: bucket.retentionEligible === 0 ? null : bucket.retentionReturned / bucket.retentionEligible,
    truncated: bucket.truncated,
  }));
}

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

/**
 * Map a calendar rolling window (7d / 28d) onto the current grain.
 * Day grain uses the window as-is; week ≈ window/7 periods; month ≈ window/30.
 */
export function rollingPeriods(grain: TrendGrain, windowDays: RollingWindow): number {
  if (windowDays === 0) return 0;
  if (grain === 'day') return windowDays;
  if (grain === 'week') return Math.max(1, Math.round(windowDays / 7));
  return Math.max(1, Math.round(windowDays / 30));
}

function periodKey(dateStr: string, grain: TrendGrain): { key: string; label: string } {
  if (grain === 'month') {
    const key = dateStr.slice(0, 7);
    return { key, label: key };
  }
  const start = weekStart(dateStr);
  return { key: start, label: `w ${start.slice(5)}` };
}

function weekStart(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}
