import { GameWorldState, Fireball } from './game-world-types';

// Constants for fireball management
const FIREBALL_LIFETIME = 10000; // Fireballs last for 10 seconds

/**
 * Updates the game world state for a single frame
 */
export function updateGameWorld(world: GameWorldState, deltaTime: number): GameWorldState {
  const currentTime = world.time + deltaTime;

  // Update fireballs: remove expired ones
  const updatedFireballs = world.fireballs
    .filter((fireball) => currentTime - fireball.createdAt < FIREBALL_LIFETIME)
    .map((fireball) => updateFireball(fireball, deltaTime));

  return {
    ...world,
    time: currentTime,
    fireballs: updatedFireballs,
  };
}

/**
 * Updates a single fireball's position and state
 */
function updateFireball(fireball: Fireball, deltaTime: number): Fireball {
  // If fireball has velocity, update its position
  if (fireball.vx || fireball.vy) {
    return {
      ...fireball,
      x: fireball.x + (fireball.vx || 0) * deltaTime,
      y: fireball.y + (fireball.vy || 0) * deltaTime,
    };
  }
  return fireball;
}
