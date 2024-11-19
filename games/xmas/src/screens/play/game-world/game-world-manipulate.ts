import { Fireball, GameWorldState } from './game-world-types';

// Constants for velocity calculation and smoothing
const VELOCITY_SMOOTHING = 0.5; // Lower values make velocity changes more smooth
const MIN_POSITION_DELTA = 0.1; // Minimum position change to calculate velocity

/**
 * Creates a new fireball in the game world
 */
export function addFireball(world: GameWorldState, x: number, y: number, radius: number, id: string) {
  const newFireball = createFireball(id, x, y, radius);
  world.fireballs.push(newFireball);
}

/**
 * Updates an existing fireball in the game world and calculates its velocity
 * based on position changes between updates
 */
export function updateFireball(world: GameWorldState, id: string, x: number, y: number, radius: number) {
  const fireball = world.fireballs.find((f) => f.id === id);
  if (!fireball) {
    return;
  }

  // Calculate position deltas
  let dx = x - fireball.x;
  let dy = y - fireball.y;

  // Normalize
  const distance = Math.sqrt(dx * dx + dy * dy);
  dx /= distance;
  dy /= distance;

  // Only update velocity if position change is significant
  if (Math.abs(dx) > MIN_POSITION_DELTA || Math.abs(dy) > MIN_POSITION_DELTA) {
    // Calculate new velocities with smoothing
    fireball.vx = fireball.vx * (1 - VELOCITY_SMOOTHING) + dx * VELOCITY_SMOOTHING;
    fireball.vy = fireball.vy * (1 - VELOCITY_SMOOTHING) + dy * VELOCITY_SMOOTHING;
  }

  // Update current position and radius
  fireball.x = x;
  fireball.y = y;
  fireball.radius = radius;
}

// Helper function to create a new fireball
export function createFireball(id: string, x: number, y: number, radius: number): Fireball {
  return {
    id,
    x,
    y,
    radius,
    createdAt: Date.now(),
    vx: 0,
    vy: 0,
  };
}
