import type { CreatorsResponse, HealthResponse, VisitsResponse } from './healthApi.js';
import { computeGrowthReading } from './growthReading.js';
import { Gauge, Histogram, OpenGauge, type GaugeTone } from './TelemetryCharts.js';

/**
 * At-a-glance strip for the telemetry tab.
 *
 * Dashboard posture: rates as gauges, distributions as histograms, above the
 * sections that carry the same numbers in prose. The strip does not invent
 * metrics — every figure is one the panels below already compute.
 *
 * Gauges stay on bounded rates (0–1). Growth k is unbounded, so it gets an
 * open dial with a goal tick at 1 (the sustainability threshold), not a
 * percentage gauge that would pin past 100% and lie.
 */

const READABLE_COHORT = 20;

function percentDisplay(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function reachRate(visits: VisitsResponse): number | null {
  const { visits: total, visitsWithPlay } = visits.funnel;
  if (total === 0) return null;
  return visitsWithPlay / total;
}

/** Only the documented k≥1 threshold gets a tone; other rates stay neutral. */
function kTone(k: number | null, smallCohort: boolean): GaugeTone {
  if (k === null) return 'idle';
  if (smallCohort) return 'warn';
  return k >= 1 ? 'ok' : 'warn';
}

function measuredTone(value: number | null, caution = false): GaugeTone {
  if (value === null) return 'idle';
  return caution ? 'warn' : 'ok';
}

function bucketLabel(upToSeconds: number | null): string {
  if (upToSeconds === null) return 'slower';
  if (upToSeconds < 60) return `≤${upToSeconds}s`;
  return `≤${Math.round(upToSeconds / 60)}m`;
}

export function TelemetryOverview({
  health,
  visits,
  creators,
}: {
  health: HealthResponse;
  visits: VisitsResponse;
  creators: CreatorsResponse;
}) {
  const reading = computeGrowthReading(health, visits, creators);
  const reach = reachRate(visits);
  const d7 = creators.metrics.d7ReturnRate;
  const smallCohort = creators.metrics.eligibleForReturn < READABLE_COHORT;
  // Dial max: enough headroom past the goal so a healthy loop still has arc left,
  // without inventing a scale that changes every refresh. Cap the domain at the
  // reading itself when it overshoots, so the needle never lies about overflow.
  const kMax = reading.k === null ? 2 : Math.max(2, Math.ceil(reading.k));

  const timeBars = visits.funnel.timeToFirstPlay.map((row) => ({
    label: bucketLabel(row.upToSeconds),
    value: row.visits,
  }));
  const depthBars = visits.funnel.depth.map((row) => ({
    label: String(row.plays),
    value: row.visits,
  }));

  return (
    <section className="telem-overview" aria-label="Telemetry overview">
      <div className="telem-overview-gauges">
        <OpenGauge
          value={reading.k}
          display={reading.k === null ? '—' : reading.k.toFixed(2)}
          label="growth k"
          max={kMax}
          goal={1}
          tone={kTone(reading.k, smallCohort)}
        />
        <Gauge value={reach} display={percentDisplay(reach)} label="reached a game" tone={measuredTone(reach)} />
        <Gauge
          value={reading.playToCreate}
          display={percentDisplay(reading.playToCreate)}
          label="played → submitted"
          tone={measuredTone(reading.playToCreate)}
        />
        <Gauge value={d7} display={percentDisplay(d7)} label="creator D7 return" tone={measuredTone(d7, smallCohort)} />
      </div>

      <div className="telem-overview-charts">
        <Histogram
          title="Time to first play"
          bars={timeBars}
          emptyMessage={visits.funnel.visits === 0 ? 'No visits in this window.' : 'No visit reached a game.'}
        />
        <Histogram
          title="Games per visit"
          bars={depthBars}
          emptyMessage={visits.funnel.visits === 0 ? 'No visits in this window.' : 'No visit reached a game.'}
        />
      </div>
    </section>
  );
}
