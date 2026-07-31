import type { CreatorsResponse, HealthResponse, VisitsResponse } from './healthApi.js';

/**
 * The growth coefficient k — the headline business number, assembled from the three
 * aggregate reads the telemetry dashboard already makes.
 *
 * k = games per creator × plays per published game × play→create conversion × D7 return.
 * It estimates how many new retained creators each retained creator produces: below 1 the
 * loop amplifies external acquisition by 1/(1−k), at 1 it sustains itself.
 *
 * Assembled client-side on purpose. The play and visit streams are deliberately
 * unjoinable (see the product-instrumentation skill), so k cannot exist as a tracked
 * funnel anywhere — only as arithmetic over four separately-measured aggregates. Doing
 * that arithmetic here, from the same responses the panels render, keeps the server free
 * of cross-stream reads and makes the estimate's ingredients visible on one page.
 *
 * In its own module rather than beside the panel because react-refresh insists component
 * files export only components — and it earns its keep as the testable, DOM-free half.
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
