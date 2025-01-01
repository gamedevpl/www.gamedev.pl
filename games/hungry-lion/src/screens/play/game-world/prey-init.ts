import { PreyState, PreySpawnConfig } from './prey-types';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from './game-world-consts';

export const DEFAULT_PREY_SPAWN_CONFIG: PreySpawnConfig = {
  initialCount: 5,
  spawnInterval: 5000, // 5 seconds
  maxCount: 20,
};

export function createInitialPrey(): PreyState[] {
  const preyEntities: PreyState[] = [];
  for (let i = 0; i < DEFAULT_PREY_SPAWN_CONFIG.initialCount; i++) {
    preyEntities.push({
      id: `prey-${i}`,
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
    });
  }
  return preyEntities;
}
