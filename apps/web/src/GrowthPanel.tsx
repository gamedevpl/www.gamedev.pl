import type { CreatorsResponse, HealthResponse, VisitsResponse } from './healthApi.js';
import { computeGrowthReading } from './growthReading.js';

/**
 * The Growth loop section of the telemetry view: k above the panels that carry its
 * ingredients. The definition, the reasoning and the arithmetic live in
 * growthReading.ts; this file only renders the reading.
 *
 * Two honesty rules, inherited from the panels around it:
 * - a term without evidence renders as — and poisons k to —, never to 0;
 * - a k over a cohort too small to read is labelled as such rather than left to look
 *   like a measurement.
 */

/** Creators whose 7-day window has elapsed, below which any k is labelled unreadable. */
const READABLE_COHORT = 20;

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function ratio(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

export function GrowthPanel({
  health,
  visits,
  creators,
}: {
  health: HealthResponse;
  visits: VisitsResponse;
  creators: CreatorsResponse;
}) {
  const reading = computeGrowthReading(health, visits, creators);
  const cohort = creators.metrics.eligibleForReturn;
  const smallCohort = cohort < READABLE_COHORT;

  return (
    <section className="funnel">
      <h2>Growth loop</h2>

      <ul className="funnel-stats">
        <li>
          <span className="funnel-stat-value">{reading.k === null ? '—' : reading.k.toFixed(2)}</span>
          <span className="funnel-stat-label">k — retained creators per retained creator</span>
        </li>
        <li>
          <span className="funnel-stat-value">{ratio(reading.gamesPerCreator)}</span>
          <span className="funnel-stat-label">games / creator</span>
        </li>
        <li>
          <span className="funnel-stat-value">{ratio(reading.playsPerPublishedGame)}</span>
          <span className="funnel-stat-label">plays / published game</span>
        </li>
        <li>
          <span className="funnel-stat-value">{percent(reading.playToCreate)}</span>
          <span className="funnel-stat-label">played → submitted</span>
        </li>
        <li>
          <span className="funnel-stat-value">{percent(reading.d7ReturnRate)}</span>
          <span className="funnel-stat-label">creator D7 return</span>
        </li>
      </ul>

      <p className="health-note">
        {reading.k === null ? (
          <>
            Not measurable yet — no evidence for: {reading.missing.join(', ')}. Each term stays a dash until it has
            data, and k stays a dash until all four do.
          </>
        ) : (
          <>
            {reading.k >= 1 ? (
              <>At or above 1 the loop sustains itself without external acquisition.</>
            ) : (
              <>
                Below 1 the loop is an amplifier, not an engine: each recruited creator becomes ~
                {reading.amplifier === null ? '—' : reading.amplifier.toFixed(1)} in total.
              </>
            )}{' '}
            {smallCohort && (
              <>
                <strong>
                  Low confidence: only {cohort} creator{cohort === 1 ? '' : 's'} past the 7-day mark
                </strong>{' '}
                (readable from ~{READABLE_COHORT}).{' '}
              </>
            )}
            Estimate, not a tracked funnel: plays and the create funnel use the selected window, creator terms are
            all-time, and the streams are deliberately unjoinable.
          </>
        )}
      </p>
    </section>
  );
}
