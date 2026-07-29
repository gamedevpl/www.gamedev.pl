import type { VisitEvent } from './store.js';

/**
 * Aggregates raw visit events into the funnel — the Stage 0 metrics of gtm-plan.md in the private www.gamedev.pl-ops repo.
 *
 * The write half has been capturing since 2026-07-25 and nothing could read it. This is
 * the read half, and it answers exactly the three questions the visit stream exists for:
 * how the first minute goes, how deep a sitting gets, and where visitors came from.
 *
 * Aggregates only — never raw rows. Referrer and UTM values are the one attacker- and
 * marketer-influenced input here (anyone can link in with `?utm_source=…`), so they are
 * grouped and counted but never echoed as anything but the bounded, character-filtered
 * strings the intake already validated.
 */

/** Buckets for "how long did it take to reach a first play", in seconds. */
const TIME_TO_PLAY_BUCKETS = [10, 30, 60, 180, 600] as const;

export interface VisitFunnel {
  /** Distinct visits (tabs) seen in the window. */
  visits: number;
  /**
   * Visits that recorded a landing but never a play — the bounce count.
   *
   * A visit that only ever reads /privacy counts here too, which is correct: it is a
   * real arrival that produced no play. `entries` below is what separates those.
   */
  bounces: number;
  /** Visits that played at least one game. */
  visitsWithPlay: number;
  /** Total plays across all visits — the numerator for depth. */
  plays: number;
  /**
   * Visits by how many games they played: `depth[2]` is visits that played exactly two.
   * Key `0` is deliberately absent — that is `bounces`.
   */
  depth: Array<{ plays: number; visits: number }>;
  /** Median plays among visits that played at all. Zero when nobody played. */
  medianPlaysPerPlayingVisit: number;
  /**
   * Seconds from landing to first play, bucketed. The Stage 0 "first minute" question.
   * Only visits that reached a play appear here.
   */
  timeToFirstPlay: Array<{ upToSeconds: number | null; visits: number }>;
  /** Median seconds to first play among visits that played. */
  medianSecondsToFirstPlay: number;
  /** Where visits landed, most common first. A shared game link lands on `play`. */
  entries: Array<{ entry: string; visits: number; plays: number }>;
  /**
   * Acquisition, most common first. `referrer` is a bare hostname; `direct` is the
   * bucket for visits with no external referrer at all.
   */
  referrers: Array<{ referrer: string; visits: number; plays: number }>;
  /** Campaign attribution, most common first. Only visits carrying UTM values appear. */
  campaigns: Array<{ source?: string; medium?: string; campaign?: string; visits: number; plays: number }>;
  /**
   * The creation funnel, always in step order and always with every step present —
   * including zeroes.
   *
   * Emitting absent steps as zero rather than omitting them is the point: a funnel with
   * a missing rung reads as "nothing to see", when the interesting case is exactly the
   * step where everyone stopped.
   */
  creating: Array<{ step: CreateStep; visits: number }>;
}

/** Step order is the funnel's meaning, so it is declared once and reused. */
export const CREATE_STEPS = [
  'prompt_started',
  'spec_submitted',
  'signin_required',
  'qa_shown',
  'submission_created',
] as const;

export type CreateStep = (typeof CREATE_STEPS)[number];

interface VisitRollup {
  started: boolean;
  /** Creation steps this visit reached. A Set, so a repeated step counts once. */
  steps: Set<string>;
  entry?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  plays: number;
  /** Offset of the first play within the visit, or undefined if it never played. */
  firstPlayMs?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Sorts a count map into rows, busiest first, with a stable tiebreak on the row. */
function rank<T, R extends { visits: number }>(entries: Map<string, T>, toRow: (key: string, value: T) => R): R[] {
  return Array.from(entries, ([key, value]) => toRow(key, value)).sort(
    (a, b) => b.visits - a.visits || JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}

export function summarizeVisitFunnel(events: VisitEvent[]): VisitFunnel {
  const visits = new Map<string, VisitRollup>();

  for (const event of events) {
    const rollup = visits.get(event.visitId) ?? { started: false, plays: 0, steps: new Set<string>() };

    if (event.type === 'visit_started') {
      rollup.started = true;
      rollup.entry = event.entry;
      rollup.referrer = event.referrer;
      rollup.utmSource = event.utmSource;
      rollup.utmMedium = event.utmMedium;
      rollup.utmCampaign = event.utmCampaign;
    } else if (event.type === 'create_step') {
      // The client already dedupes, but a Set here means a replayed or duplicated
      // flush cannot inflate a funnel rung either.
      if (event.step) rollup.steps.add(event.step);
    } else if (event.type === 'play_started') {
      rollup.plays += 1;
      // Earliest wins: a flush can deliver events out of order, and "time to first
      // play" must not depend on which one happened to be written first.
      if (rollup.firstPlayMs === undefined || event.msSinceStart < rollup.firstPlayMs) {
        rollup.firstPlayMs = event.msSinceStart;
      }
    }
    // `route_viewed` needs no rollup of its own yet: it exists so a future
    // step-by-step funnel can be built without another schema change.

    visits.set(event.visitId, rollup);
  }

  const rollups = Array.from(visits.values());
  const playing = rollups.filter((rollup) => rollup.plays > 0);

  const depthCounts = new Map<number, number>();
  playing.forEach((rollup) => depthCounts.set(rollup.plays, (depthCounts.get(rollup.plays) ?? 0) + 1));

  const timeBuckets = new Map<number | null, number>();
  playing.forEach((rollup) => {
    const seconds = (rollup.firstPlayMs ?? 0) / 1000;
    // `null` is the overflow bucket: slower than the widest named bucket.
    const bucket = TIME_TO_PLAY_BUCKETS.find((upTo) => seconds <= upTo) ?? null;
    timeBuckets.set(bucket, (timeBuckets.get(bucket) ?? 0) + 1);
  });

  const byEntry = new Map<string, { visits: number; plays: number }>();
  const byReferrer = new Map<string, { visits: number; plays: number }>();
  const byCampaign = new Map<
    string,
    { source?: string; medium?: string; campaign?: string; visits: number; plays: number }
  >();

  rollups.forEach((rollup) => {
    const entryKey = rollup.entry ?? 'unknown';
    const entry = byEntry.get(entryKey) ?? { visits: 0, plays: 0 };
    entry.visits += 1;
    entry.plays += rollup.plays;
    byEntry.set(entryKey, entry);

    // No referrer means the visitor typed the URL, used a bookmark, or came from a
    // client that strips it — all "direct" for attribution purposes.
    const referrerKey = rollup.referrer ?? 'direct';
    const referrer = byReferrer.get(referrerKey) ?? { visits: 0, plays: 0 };
    referrer.visits += 1;
    referrer.plays += rollup.plays;
    byReferrer.set(referrerKey, referrer);

    if (rollup.utmSource || rollup.utmMedium || rollup.utmCampaign) {
      const campaignKey = `${rollup.utmSource ?? ''}|${rollup.utmMedium ?? ''}|${rollup.utmCampaign ?? ''}`;
      const campaign = byCampaign.get(campaignKey) ?? {
        ...(rollup.utmSource === undefined ? {} : { source: rollup.utmSource }),
        ...(rollup.utmMedium === undefined ? {} : { medium: rollup.utmMedium }),
        ...(rollup.utmCampaign === undefined ? {} : { campaign: rollup.utmCampaign }),
        visits: 0,
        plays: 0,
      };
      campaign.visits += 1;
      campaign.plays += rollup.plays;
      byCampaign.set(campaignKey, campaign);
    }
  });

  return {
    visits: rollups.length,
    bounces: rollups.length - playing.length,
    visitsWithPlay: playing.length,
    plays: rollups.reduce((total, rollup) => total + rollup.plays, 0),
    depth: Array.from(depthCounts, ([plays, count]) => ({ plays, visits: count })).sort((a, b) => a.plays - b.plays),
    medianPlaysPerPlayingVisit: median(playing.map((rollup) => rollup.plays)),
    timeToFirstPlay: Array.from(timeBuckets, ([upToSeconds, count]) => ({ upToSeconds, visits: count })).sort(
      // The overflow bucket sorts last; named buckets ascend.
      (a, b) => (a.upToSeconds ?? Infinity) - (b.upToSeconds ?? Infinity),
    ),
    medianSecondsToFirstPlay: Math.round(median(playing.map((rollup) => (rollup.firstPlayMs ?? 0) / 1000))),
    entries: rank(byEntry, (entry, value) => ({ entry, ...value })),
    referrers: rank(byReferrer, (referrer, value) => ({ referrer, ...value })),
    campaigns: rank(byCampaign, (_key, value) => value),
    creating: CREATE_STEPS.map((step) => ({
      step,
      visits: rollups.filter((rollup) => rollup.steps.has(step)).length,
    })),
  };
}
