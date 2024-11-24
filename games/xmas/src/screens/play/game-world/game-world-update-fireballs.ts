import { GameWorldState } from './game-world-types';

/**
 * Updates fireball positions and removes those that are out of bounds
 */
export function updateFireballs(state: GameWorldState, deltaTime: number) {
  state.fireballs = state.fireballs.filter((fireball) => {
    // Update position
    fireball.x += fireball.vx * deltaTime;
    fireball.y += fireball.vy * deltaTime;

    // Remove fireballs that are out of bounds or too old
    const isOutOfBounds = fireball.x < 0 || fireball.y < 0;
    const isTooOld = state.time - fireball.createdAt > 10000; // 10 seconds lifetime

    return !isOutOfBounds && !isTooOld;
  });
}
