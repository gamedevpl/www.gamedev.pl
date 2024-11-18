import { GameWorldState } from './game-world-types';

export function updateGameWorld(world: GameWorldState, deltaTime: number): GameWorldState {
  const newWorld = { ...world, time: world.time + deltaTime };

  return newWorld;
}
