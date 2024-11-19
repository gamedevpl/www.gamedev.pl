import { Fireball, GameWorldState } from './game-world-types';

/**
 * Creates a new fireball in the game world
 */
export function addFireball(
  world: GameWorldState,
  id: string,
  x: number,
  y: number,
  radius: number,
  vx: number,
  vy: number,
) {
  const newFireball = createFireball(id, x, y, radius, vx, vy);
  world.fireballs.push(newFireball);
}

/**
 * Updates an existing fireball in the game world and calculates its velocity
 * based on position changes between updates
 */
export function updateFireball(
  world: GameWorldState,
  id: string,
  x: number,
  y: number,
  radius: number,
  vx: number,
  vy: number,
) {
  const fireball = world.fireballs.find((f) => f.id === id);
  if (!fireball) {
    return;
  }

  // Update current position and radius
  fireball.x = x;
  fireball.y = y;
  fireball.radius = radius;
  fireball.vx = vx;
  fireball.vy = vy;
}

// Helper function to create a new fireball
export function createFireball(id: string, x: number, y: number, radius: number, vx: number, vy: number): Fireball {
  return {
    id,
    x,
    y,
    radius,
    createdAt: Date.now(),
    vx,
    vy,
  };
}
