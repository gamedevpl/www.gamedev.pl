import { PreyState, PreySpawnConfig } from './prey-types';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from './game-world-consts';

export function spawnPrey(config: PreySpawnConfig, existingPrey: PreyState[]): PreyState[] {
  if (existingPrey.length >= config.maxCount) return existingPrey;

  const newPrey: PreyState = {
    id: `prey-${Date.now()}`,
    position: {
      x: Math.random() * GAME_WORLD_WIDTH,
      y: Math.random() * GAME_WORLD_HEIGHT,
    },
    movement: {
      direction: { x: 0, y: 0 },
      speed: 0,
    },
    state: 'idle',
    visionDirection: {
      x: 0,
      y: 0,
    },
  };

  return [...existingPrey, newPrey];
}
