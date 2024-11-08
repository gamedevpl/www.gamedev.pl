import { GameWorldState } from './game-world-types';

export function updateGameWorld(world: GameWorldState): GameWorldState {
  const newWorld = { ...world, time: Date.now() };

  return newWorld;
}
