import { GameWorldState } from './game-world-types';
import { updateFireballRadius, processFireballCollisions } from './game-world-collisions';

/**
 * Updates fireball positions, handles growth, and processes collisions
 * with improved consistency and optimization
 */
export function updateFireballs(state: GameWorldState, deltaTime: number) {
  const currentTime = state.time;

  // Update positions and radii
  state.fireballs.forEach((fireball) => {
    // Update position
    fireball.x += fireball.vx * deltaTime;
    fireball.y += fireball.vy * deltaTime;

    // Update radius based on growth progress
    updateFireballRadius(fireball, currentTime);
  });

  // Process collisions and merging
  state.fireballs = processFireballCollisions(state.fireballs, currentTime);

  // Filter out fireballs that are out of bounds or too old
  state.fireballs = state.fireballs.filter((fireball) => {
    const isOutOfBounds = fireball.x < 0 || fireball.y < 0;
    const isTooOld = currentTime - fireball.createdAt > 10000; // 10 seconds lifetime

    return !isOutOfBounds && !isTooOld;
  });
}