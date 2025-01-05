import { Entities, PreyEntity } from './entities-types';
import { createEntity } from './entities-update';
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../game-world-consts';
import { Vector2D } from '../utils/math-types';
import { createPreyStateMachine } from '../state-machine/states/prey-states';

const DEFAULT_SPAWN_CONFIG = {
  maxCount: 20,
  minSpawnDistance: 100,
};

/**
 * Generates a random value within a range
 */
function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

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
export function preySpawn(entities: Entities, config = DEFAULT_SPAWN_CONFIG): Entities {
  // Count existing prey
  const preyCount = Array.from(entities.entities.values()).filter((entity) => entity.type === 'prey').length;

  // Don't spawn if at max capacity
  if (preyCount >= config.maxCount) {
    return entities;
  }

  // Generate random position
  // TODO: Make sure prey is not spawned on water or other entities
  const position = generateRandomPosition();

  // Create new prey entity with initialized hunger and thirst
  createEntity<PreyEntity>(entities, 'prey', {
    position,
    stateMachine: createPreyStateMachine(),
    health: 100,
    // Initialize hunger and thirst levels randomly within configured ranges
    hungerLevel: randomInRange(25, 100),
    thirstLevel: randomInRange(25, 100),
    staminaLevel: randomInRange(25, 75),
  });

  return entities;
}
