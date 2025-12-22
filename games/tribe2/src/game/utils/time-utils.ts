import { HOURS_PER_GAME_DAY } from '../game-consts';

// Duration of a full day-night cycle in game time units
const DAY_NIGHT_CYCLE_DURATION = HOURS_PER_GAME_DAY * 10;

export function getDayNightPhase(time: number): number {
  return (time % DAY_NIGHT_CYCLE_DURATION) / DAY_NIGHT_CYCLE_DURATION;
}

/**
 * Returns a value from 0 (peak night) to 1 (peak day) representing the daylight factor.
 * Peak daylight (1.0) is at time % 24 == 0.
 * Peak night (0.0) is at time % 24 == 12.
 */
export function getDaylightFactor(time: number): number {
  const phase = getDayNightPhase(time);
  return (Math.cos(phase * 2 * Math.PI) + 1) / 2;
}

/**
 * Returns a value from 0 (day) to 1 (full night) representing visual night intensity.
 * Uses a steeper curve to make the transition more distinct for rendering.
 */
export function getNightIntensity(time: number): number {
  const phase = getDayNightPhase(time);
  // This matches the original implementation in render-utils.ts
  // It returns 1 at midnight (phase = 0.5) and 0 at midday (phase = 0).
  return Math.pow(Math.max(0, -Math.cos(phase * 2 * Math.PI)), 0.5);
}
