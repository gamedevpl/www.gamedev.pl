import { createFireball, GameWorldState } from './game-world-types';

/**
 * Creates a new fireball in the game world
 */
export function addFireball(world: GameWorldState, x: number, y: number, radius: number) {
  const newFireball = createFireball(x, y, radius);

  world.fireballs.push(newFireball);
}

/**
 * Updates an existing fireball in the game world
 */
export function updateFireball(world: GameWorldState, id: string, x: number, y: number, radius: number) {
  const fireball = world.fireballs.find((f) => f.id === id);

  if (!fireball) {
    return;
  }

  fireball.x = x;
  fireball.y = y;
  fireball.radius = radius;
}
