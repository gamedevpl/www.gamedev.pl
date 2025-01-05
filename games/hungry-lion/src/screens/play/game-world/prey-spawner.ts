import { Entities, PreyEntity } from './entities-types';
import { createEntity } from './entities-update';
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from './game-world-consts';
import { Vector2D } from './math-types';

const DEFAULT_SPAWN_CONFIG = {
  maxCount: 20,
  minSpawnDistance: 100,
};

/**
 * Generates a random position within game world bounds
 */
function generateRandomPosition(): Vector2D {
  return {
    x: Math.random() * GAME_WORLD_WIDTH,
    y: Math.random() * GAME_WORLD_HEIGHT,
  };
}

/**
 * Attempts to spawn a new prey entity if conditions are met
 * @param entities Current entities state
 * @param config Spawn configuration
 * @returns Updated entities state
 */
export function spawnPrey(entities: Entities, config = DEFAULT_SPAWN_CONFIG): Entities {
  // Count existing prey
  const preyCount = Array.from(entities.entities.values()).filter((entity) => entity.type === 'prey').length;

  // Don't spawn if at max capacity
  if (preyCount >= config.maxCount) {
    return entities;
  }

  // Generate random position
  // TODO: Make sure prey is not spawned on water or other entities
  const position = generateRandomPosition();

  // Create new prey entity
  createEntity<PreyEntity>(entities, 'prey', {
    position,
    state: 'idle',
    health: 100,
    currentBehavior: 'idle',
    lastBehaviorUpdate: 0,
  });

  return entities;
}
