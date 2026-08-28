import {
  ASSIST_STEPS,
  BETA_WELCOME_STEPS,
  CODE_COMPLETION_KINDS,
  CODE_STEPS,
  CREATE_STEPS,
  EDITOR_STEPS,
  HOW_TO_PLAY_VIAS,
  INVITE_STEPS,
  PLAY_VIAS,
  REMIX_CONTROLS,
  REMIX_PAINTED_VIAS,
  REMIX_STEPS,
  WAITLIST_STEPS,
  type AssistStep,
  type BetaWelcomeStep,
  type CodeCompletionKind,
  type CodeStep,
  type CreateStep,
  type EditorStep,
  type HowToPlayVia,
  type InviteStep,
  type PlayVia,
  type RemixControl,
  type RemixPaintedVia,
  type RemixStep,
  type WaitlistStep,
} from '@gamedevpl/contract';
import type { VisitEvent } from '../platform/store.js';

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
  // Plays per home page surface, all PLAY_VIAS present, zeroes included.
  playVia: Array<{ via: PlayVia | 'unknown'; plays: number }>;
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
  /**
   * The closed-beta waitlist funnel, always in step order and always with every step
   * present — including zeroes. Same posture as `creating`.
   */
  waitlist: Array<{ step: WaitlistStep; visits: number }>;
  invites: Array<{ step: InviteStep; visits: number }>;
  betaWelcome: Array<{ step: BetaWelcomeStep; visits: number }>;
  /**
   * EditorKit's revision funnel — opened → saved a draft → played it → published.
   * Same posture as `creating`: every step, in order, zeroes included.
   *
   * This is the read half of the question EditorKit was built to answer: does content
   * editing bring creators back, and how far along the loop do they actually get. The
   * events carry no slug (the visit stream stays unjoinable to the game stream), so
   * this is a per-visit funnel and deliberately not a per-game one.
   */
  editing: Array<{ step: EditorStep; visits: number }>;
  coding: Array<{ step: CodeStep; visits: number }>;
  completion: CodeCompletionFunnel;
  /**
   * The NL tuning lane, against `asked` as its denominator: of the sittings that
   * typed a request, how many got a patch, were told honestly that it needs code,
   * or were refused. This is the read half of "is the router worth its calls".
   */
  assisting: Array<{ step: AssistStep; visits: number }>;
  /** The remix loop, against `opened`. See REMIX_STEPS for what the order means. */
  remixing: Array<{ step: RemixStep; visits: number }>;
  /**
   * Which door brought painting visits to the brush: the router proposing the
   * painter after a content-shaped request (`redirect`), the theater's More
   * menu (`menu`), or the panel opening it as the game's only lane (`panel` —
   * every collections game while the model flags are off). All doors always
   * present, zeroes included, `unknown` only when a client outlived the deploy
   * that added the dimension. The doors are the hypothesis of
   * remix-content-editing-plan §3.1; this is what settles it.
   */
  remixPaintedVia: Array<{ via: RemixPaintedVia | 'unknown'; visits: number }>;
  /**
   * Whether the remix entry is worth the space it takes.
   *
   * `offered` is every visit shown the control; `opened` is every visit that
   * pressed it; `byControl` splits the presses between the game page, chrome bar,
   * and overflow menu. `medianSecondsToOpen` is
   * measured among visits that opened it — how long a player plays before they
   * want to change something.
   *
   * `null` for the median means no visit opened a remix in the window. Absence
   * of evidence renders as absence: a `0` here would read as "they open it
   * instantly", which is the opposite of what no data means.
   */
  remixEntry: {
    offered: number;
    opened: number;
    byControl: Array<{ control: RemixControl | 'unknown'; visits: number }>;
    medianSecondsToOpen: number | null;
  };
  /**
   * How to play card usage — the numbers that decide whether a richer per-game format
   * is worth building (github.com/gamedevpl/www.gamedev.pl/issues/395).
   *
   * Opens stay as raw counts so a second open in one visit stays visible; `visits` is
   * the distinct-visit denominator the open-rate question needs. Deep-link vs catalog is
   * `byEntry` (visit landing), not a field on the open event — the streams stay
   * unjoinable and the entry is already on `visit_started`.
   */
  howToPlay: HowToPlayFunnel;
}

export interface HowToPlayFunnel {
  /**
   * Total `how_to_play_opened` events among visits that also played — the same
   * population as `visitsWithPlay`, so the open rate cannot exceed 100%.
   */
  opens: number;
  /** Distinct playing visits that opened the card at least once. */
  visits: number;
  /**
   * Playing visits that reopened the *same* theater card (`reopen: true`). Not
   * "opened twice in the visit" — opening once per game in a multi-game sitting is
   * not this signal.
   */
  repeatVisits: number;
  /**
   * Opens and distinct visits by chrome surface. Always both `bar` and `more`, zeroes
   * included, so a missing surface reads as zero rather than "nothing to see".
   * Events recorded before `via` existed fall into `unknown`.
   */
  via: Array<{ via: HowToPlayVia | 'unknown'; opens: number; visits: number }>;
  /**
   * Per visit landing: how many playing visits, how many of those opened, and opens.
   * `play` is a shared-link / deep-link arrival; `home` is the catalog path. Every
   * entry with a playing visit appears (zero opens included) so rates are readable.
   * Busiest by playing visits first.
   */
  byEntry: Array<{ entry: string; playingVisits: number; visits: number; opens: number }>;
}

export interface CodeCompletionFunnel {
  requests: number;
  shown: number;
  empty: number;
  failed: number;
  byKind: Array<{
    kind: CodeCompletionKind;
    requests: number;
    shown: number;
    empty: number;
    failed: number;
    medianLatencyMs: number | null;
    p90LatencyMs: number | null;
  }>;
}

interface VisitRollup {
  started: boolean;
  /** Creation steps this visit reached. A Set, so a repeated step counts once. */
  steps: Set<string>;
  /** Waitlist steps this visit reached. Separate from create so the two funnels cannot collide. */
  waitlistSteps: Set<string>;
  inviteSteps: Set<string>;
  betaWelcomeSteps: Set<string>;
  /** Editor steps this visit reached. Separate again, for the same reason. */
  editorSteps: Set<string>;
  /** The door on this visit's `painted`, first one wins (the client dedupes). */
  paintedVia?: string;
  assistSteps: Set<string>;
  remixSteps: Set<string>;
  codeSteps: Set<string>;
  /** Which control opened the remix — first one wins, like `paintedVia`. */
  remixControl?: string;
  /** How far into the visit the remix was first opened. */
  remixOpenedMs?: number;
  entry?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  plays: number;
  /** Offset of the first play within the visit, or undefined if it never played. */
  firstPlayMs?: number;
  /** How many times this visit opened How to play. */
  howToPlayOpens: number;
  /** Surfaces that opened it — for the via visit counts (a visit can use both). */
  howToPlayVias: Set<string>;
  /** True when any open carried `reopen: true` — same-card reopen, not multi-game. */
  howToPlayReopened: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

/** Sorts a count map into rows, busiest first, with a stable tiebreak on the row. */
function rank<T, R extends { visits: number }>(entries: Map<string, T>, toRow: (key: string, value: T) => R): R[] {
  return Array.from(entries, ([key, value]) => toRow(key, value)).sort(
    (a, b) => b.visits - a.visits || JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}

export function summarizeVisitFunnel(events: VisitEvent[]): VisitFunnel {
  const visits = new Map<string, VisitRollup>();
  const completion = new Map<
    CodeCompletionKind,
    { requests: number; shown: number; empty: number; failed: number; latencies: number[] }
  >();

  for (const event of events) {
    const rollup = visits.get(event.visitId) ?? {
      started: false,
      plays: 0,
      steps: new Set<string>(),
      waitlistSteps: new Set<string>(),
      inviteSteps: new Set<string>(),
      betaWelcomeSteps: new Set<string>(),
      editorSteps: new Set<string>(),
      assistSteps: new Set<string>(),
      remixSteps: new Set<string>(),
      codeSteps: new Set<string>(),
      howToPlayOpens: 0,
      howToPlayVias: new Set<string>(),
      howToPlayReopened: false,
    };

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
    } else if (event.type === 'waitlist_step') {
      if (event.step) rollup.waitlistSteps.add(event.step);
    } else if (event.type === 'invite_step') {
      if (event.step) rollup.inviteSteps.add(event.step);
    } else if (event.type === 'beta_welcome_step') {
      if (event.step) rollup.betaWelcomeSteps.add(event.step);
    } else if (event.type === 'editor_step') {
      if (event.step) rollup.editorSteps.add(event.step);
    } else if (event.type === 'assist_step') {
      if (event.step) rollup.assistSteps.add(event.step);
    } else if (event.type === 'code_step') {
      if (event.step) rollup.codeSteps.add(event.step);
    } else if (event.type === 'code_completion') {
      const kind = event.kind as CodeCompletionKind;
      if (!CODE_COMPLETION_KINDS.includes(kind)) continue;
      if (event.outcome !== 'shown' && event.outcome !== 'empty' && event.outcome !== 'failed') continue;
      const stats = completion.get(kind) ?? { requests: 0, shown: 0, empty: 0, failed: 0, latencies: [] };
      stats.requests += 1;
      if (event.outcome === 'shown') stats.shown += 1;
      else if (event.outcome === 'empty') stats.empty += 1;
      else stats.failed += 1;
      stats.latencies.push(event.latencyMs ?? 0);
      completion.set(kind, stats);
    } else if (event.type === 'remix_step') {
      if (event.step) rollup.remixSteps.add(event.step);
      if (event.step === 'painted' && rollup.paintedVia === undefined) {
        rollup.paintedVia = event.via ?? 'unknown';
      }
      if (event.step === 'opened') {
        if (rollup.remixControl === undefined) rollup.remixControl = event.control ?? 'unknown';
        // Earliest wins, for the same reason `firstPlayMs` does: a flush can
        // deliver events out of order, and "how long until they opened it" must
        // not depend on which row was written first.
        if (rollup.remixOpenedMs === undefined || event.msSinceStart < rollup.remixOpenedMs) {
          rollup.remixOpenedMs = event.msSinceStart;
        }
      }
    } else if (event.type === 'play_started') {
      rollup.plays += 1;
      // Earliest wins: a flush can deliver events out of order, and "time to first
      // play" must not depend on which one happened to be written first.
      if (rollup.firstPlayMs === undefined || event.msSinceStart < rollup.firstPlayMs) {
        rollup.firstPlayMs = event.msSinceStart;
      }
    } else if (event.type === 'how_to_play_opened') {
      // Every open counts — unlike create/waitlist steps. Same-card reopens are
      // flagged on the event (`reopen`); visit-wide open count alone is not that
      // signal (two games opened once each would look like a repeat).
      rollup.howToPlayOpens += 1;
      rollup.howToPlayVias.add(event.via ?? 'unknown');
      if (event.reopen === true) rollup.howToPlayReopened = true;
    }
    // `route_viewed` needs no rollup of its own yet: it exists so a future
    // step-by-step funnel can be built without another schema change.

    visits.set(event.visitId, rollup);
  }

  const rollups = Array.from(visits.values());
  const playing = rollups.filter((rollup) => rollup.plays > 0);
  const completionRows = CODE_COMPLETION_KINDS.map((kind) => {
    const stats = completion.get(kind) ?? { requests: 0, shown: 0, empty: 0, failed: 0, latencies: [] };
    return {
      kind,
      requests: stats.requests,
      shown: stats.shown,
      empty: stats.empty,
      failed: stats.failed,
      medianLatencyMs: stats.latencies.length ? median(stats.latencies) : null,
      p90LatencyMs: percentile(stats.latencies, 0.9),
    };
  });

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

  // Numerator and denominator share one population: visits that recorded a published
  // play. Opens from drafts / generated games / failed loads (no `play_started`) stay
  // out so the rate cannot read as "1 of 0" or above 100%.
  const openedHowTo = playing.filter((rollup) => rollup.howToPlayOpens > 0);
  const playingVisitIds = new Set(
    Array.from(visits.entries())
      .filter(([, rollup]) => rollup.plays > 0)
      .map(([visitId]) => visitId),
  );
  const viaVisits = new Map<string, number>();
  for (const via of HOW_TO_PLAY_VIAS) viaVisits.set(via, 0);
  let howToOpens = 0;
  for (const rollup of openedHowTo) {
    howToOpens += rollup.howToPlayOpens;
    for (const via of rollup.howToPlayVias) {
      viaVisits.set(via, (viaVisits.get(via) ?? 0) + 1);
    }
  }

  // Opens-per-via are counted from events, not from visit rollups: a visit that opened
  // from the bar twice and from More once must not put three opens into both buckets.
  // Visit counts above already use the Set of vias the visit touched.
  const viaOpens = new Map<string, number>();
  for (const via of HOW_TO_PLAY_VIAS) viaOpens.set(via, 0);
  for (const event of events) {
    if (event.type !== 'how_to_play_opened') continue;
    if (!playingVisitIds.has(event.visitId)) continue;
    const via = event.via ?? 'unknown';
    viaOpens.set(via, (viaOpens.get(via) ?? 0) + 1);
  }

  const viaRows: Array<{ via: HowToPlayVia | 'unknown'; opens: number; visits: number }> = [
    ...HOW_TO_PLAY_VIAS.map((via) => ({
      via,
      opens: viaOpens.get(via) ?? 0,
      visits: viaVisits.get(via) ?? 0,
    })),
  ];
  const unknownOpens = viaOpens.get('unknown') ?? 0;
  const unknownVisits = viaVisits.get('unknown') ?? 0;
  if (unknownOpens > 0 || unknownVisits > 0) {
    viaRows.push({ via: 'unknown', opens: unknownOpens, visits: unknownVisits });
  }

  // No playing-visit gate here — play_started already is the play.
  const playViaCounts = new Map<string, number>();
  for (const via of PLAY_VIAS) playViaCounts.set(via, 0);
  for (const event of events) {
    if (event.type !== 'play_started') continue;
    const via = event.via ?? 'unknown';
    playViaCounts.set(via, (playViaCounts.get(via) ?? 0) + 1);
  }
  const playViaRows: Array<{ via: PlayVia | 'unknown'; plays: number }> = PLAY_VIAS.map((via) => ({
    via,
    plays: playViaCounts.get(via) ?? 0,
  }));
  const unknownPlays = playViaCounts.get('unknown') ?? 0;
  if (unknownPlays > 0) playViaRows.push({ via: 'unknown', plays: unknownPlays });

  // Every entry that has a playing visit appears, including zero openers — otherwise
  // 10 of 1,000 home players and 5 of 10 deep-link players both render as raw counts
  // with no denominator and look like "home wins".
  const byHowToEntry = new Map<string, { playingVisits: number; visits: number; opens: number }>();
  for (const rollup of playing) {
    const entryKey = rollup.entry ?? 'unknown';
    const entry = byHowToEntry.get(entryKey) ?? { playingVisits: 0, visits: 0, opens: 0 };
    entry.playingVisits += 1;
    if (rollup.howToPlayOpens > 0) {
      entry.visits += 1;
      entry.opens += rollup.howToPlayOpens;
    }
    byHowToEntry.set(entryKey, entry);
  }

  return {
    visits: rollups.length,
    bounces: rollups.length - playing.length,
    visitsWithPlay: playing.length,
    plays: rollups.reduce((total, rollup) => total + rollup.plays, 0),
    playVia: playViaRows,
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
    waitlist: WAITLIST_STEPS.map((step) => ({
      step,
      visits: rollups.filter((rollup) => rollup.waitlistSteps.has(step)).length,
    })),
    invites: INVITE_STEPS.map((step) => ({
      step,
      visits: rollups.filter((rollup) => rollup.inviteSteps.has(step)).length,
    })),
    betaWelcome: BETA_WELCOME_STEPS.map((step) => ({
      step,
      visits: rollups.filter((rollup) => rollup.betaWelcomeSteps.has(step)).length,
    })),
    editing: EDITOR_STEPS.map((step) => ({
      step,
      visits: rollups.filter((rollup) => rollup.editorSteps.has(step)).length,
    })),
    coding: CODE_STEPS.map((step) => ({
      step,
      visits: rollups.filter((rollup) => rollup.codeSteps.has(step)).length,
    })),
    completion: {
      requests: completionRows.reduce((total, row) => total + row.requests, 0),
      shown: completionRows.reduce((total, row) => total + row.shown, 0),
      empty: completionRows.reduce((total, row) => total + row.empty, 0),
      failed: completionRows.reduce((total, row) => total + row.failed, 0),
      byKind: completionRows,
    },
    assisting: ASSIST_STEPS.map((step) => ({
      step,
      visits: rollups.filter((rollup) => rollup.assistSteps.has(step)).length,
    })),
    remixing: REMIX_STEPS.map((step) => ({
      step,
      visits: rollups.filter((rollup) => rollup.remixSteps.has(step)).length,
    })),
    remixPaintedVia: (() => {
      const doors = REMIX_PAINTED_VIAS;
      const painting = rollups.filter((rollup) => rollup.remixSteps.has('painted'));
      const rows: Array<{ via: RemixPaintedVia | 'unknown'; visits: number }> = doors.map((via) => ({
        via,
        visits: painting.filter((rollup) => rollup.paintedVia === via).length,
      }));
      const unknown = painting.filter((rollup) => !doors.includes(rollup.paintedVia as (typeof doors)[number])).length;
      if (unknown > 0) rows.push({ via: 'unknown', visits: unknown });
      return rows;
    })(),
    remixEntry: (() => {
      const offered = rollups.filter((rollup) => rollup.remixSteps.has('offered'));
      /**
       * Opens *within the offered cohort*, not every open in the window.
       *
       * A tab running the client from before this deploy records `opened` and
       * never `offered`, so counting all opens against only new offers puts
       * legacy visits in the numerator and none of them in the denominator —
       * two old opens beside one new offered-and-opened visit reports "3 of 1",
       * and a rate over 100% discredits the very experiment it exists to
       * settle. The same rule the zone join rate had to learn: count the
       * numerator only inside the denominator's set, and let the residual bias
       * understate rather than invent.
       *
       * Nothing is hidden by this — a legacy open is still counted on the
       * `opened` rung of `remixing` above. This block is narrower on purpose:
       * it reports only the visits we know were shown the control.
       */
      const opened = offered.filter((rollup) => rollup.remixSteps.has('opened'));
      const doors = REMIX_CONTROLS;
      const byControl: Array<{ control: RemixControl | 'unknown'; visits: number }> = doors.map((control) => ({
        control,
        visits: opened.filter((rollup) => rollup.remixControl === control).length,
      }));
      const unknown = opened.filter((rollup) => !doors.includes(rollup.remixControl as (typeof doors)[number])).length;
      if (unknown > 0) byControl.push({ control: 'unknown', visits: unknown });
      // Only visits that actually opened one carry a delay, so the median is over
      // that set — including the silent majority would measure the window, not them.
      const delays = opened.map((rollup) => rollup.remixOpenedMs).filter((ms): ms is number => ms !== undefined);
      return {
        offered: offered.length,
        opened: opened.length,
        byControl,
        medianSecondsToOpen: delays.length > 0 ? Math.round(median(delays) / 1000) : null,
      };
    })(),
    howToPlay: {
      opens: howToOpens,
      visits: openedHowTo.length,
      repeatVisits: openedHowTo.filter((rollup) => rollup.howToPlayReopened).length,
      via: viaRows,
      byEntry: Array.from(byHowToEntry, ([entry, value]) => ({ entry, ...value })).sort(
        (a, b) => b.playingVisits - a.playingVisits || b.visits - a.visits || a.entry.localeCompare(b.entry),
      ),
    },
  };
}
