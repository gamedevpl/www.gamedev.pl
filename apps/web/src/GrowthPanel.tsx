import type { CreatorsResponse, HealthResponse, VisitsResponse } from './healthApi.js';

/**
 * The growth coefficient k — the headline business number, assembled from the three
 * aggregate reads the dashboard already makes.
 *
 * k = games per creator × plays per published game × play→create conversion × D7 return.
 * It estimates how many new retained creators each retained creator produces: below 1 the
 * loop amplifies external acquisition by 1/(1−k), at 1 it sustains itself.
 *
 * Assembled client-side on purpose. The play and visit streams are deliberately
 * unjoinable (see the product-instrumentation skill), so k cannot exist as a tracked
 * funnel anywhere — only as arithmetic over four separately-measured aggregates. Doing
 * that arithmetic here, from the same responses the panels below render, keeps the server
 * free of cross-stream reads and makes the estimate's ingredients visible on one page.
 *
 * Two honesty rules, inherited from the panels around it:
 * - a term without evidence renders as — and poisons k to —, never to 0;
 * - a k over a cohort too small to read is labelled as such rather than left to look
 *   like a measurement.
 */

/** Everything the panel shows: the four terms, their product, and why any are missing. */
export interface GrowthReading {
  gamesPerCreator: number | null;
  playsPerPublishedGame: number | null;
  playToCreate: number | null;
  d7ReturnRate: number | null;
  /** Null whenever any term is null. */
  k: number | null;
  /** 1/(1−k): how much the loop multiplies external acquisition. Null when k is null or ≥ 1. */
  amplifier: number | null;
  /** Labels of the terms that are not measurable yet, for the explanatory note. */
  missing: string[];
}

export function computeGrowthReading(
  health: HealthResponse,
  visits: VisitsResponse,
  creators: CreatorsResponse,
): GrowthReading {
  const metrics = creators.metrics;
  const missing: string[] = [];

  const gamesPerCreator = metrics.gamesPerCreator;
  if (gamesPerCreator === null) missing.push('games per creator');

  // Sessions are windowed, published games are all-time — stated in the note rather than
  // hidden. A published catalog with zero plays in the window is a measured zero, not a
  // missing term: "nobody plays these" is exactly what k must not gloss over.
  const sessions = health.games.reduce((sum, game) => sum + game.sessions, 0);
  const playsPerPublishedGame = metrics.published > 0 ? sessions / metrics.published : null;
  if (playsPerPublishedGame === null) missing.push('plays per published game');

  // Both halves come from the visit stream, so this is the one genuinely funnel-shaped
  // term: of visits that played something, how many got a submission in.
  const submitted = visits.funnel.creating.find((row) => row.step === 'submission_created');
  const playToCreate =
    visits.funnel.visitsWithPlay > 0 && submitted ? submitted.visits / visits.funnel.visitsWithPlay : null;
  if (playToCreate === null) missing.push('play→create conversion');

  const d7ReturnRate = metrics.d7ReturnRate;
  if (d7ReturnRate === null) missing.push('D7 return');

  const k =
    gamesPerCreator !== null && playsPerPublishedGame !== null && playToCreate !== null && d7ReturnRate !== null
      ? gamesPerCreator * playsPerPublishedGame * playToCreate * d7ReturnRate
      : null;

  return {
    gamesPerCreator,
    playsPerPublishedGame,
    playToCreate,
    d7ReturnRate,
    k,
    amplifier: k !== null && k < 1 ? 1 / (1 - k) : null,
    missing,
  };
}

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
