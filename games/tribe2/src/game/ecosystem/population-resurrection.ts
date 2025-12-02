/**
 * Population resurrection system for ecosystem balancer.
 * Handles direct population intervention when species go extinct.
 */

import { createPrey, createPredator, createBerryBush } from '../entities/entities-update';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { generateRandomPreyGeneCode } from '../entities/characters/prey/prey-utils';
import { generateRandomPredatorGeneCode } from '../entities/characters/predator/predator-utils';
import {
  MAP_WIDTH,
  MAP_HEIGHT
} from '../game-consts.ts';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { Vector2D } from '../utils/math-types';

/**
 * Find a good spawn location for prey near bushes but away from predators and humans
 */
function findPreySpawnLocation(indexedState: IndexedWorldState): Vector2D {
  const bushes = indexedState.search.berryBush.byProperty('type', 'berryBush') as BerryBushEntity[];
  const predators = indexedState.search.predator.byProperty('type', 'predator');
  const humans = indexedState.search.human.byProperty('type', 'human');
  
  // Try to find location near bushes but away from threats
  for (let attempt = 0; attempt < 20; attempt++) {
    let candidate: Vector2D;
    
    if (bushes.length > 0 && attempt < 15) {
      // Try to spawn near a bush
      const randomBush = bushes[Math.floor(Math.random() * bushes.length)];
      const angle = Math.random() * 2 * Math.PI;
      const distance = 50 + Math.random() * 100; // 50-150 pixels from bush
      candidate = {
        x: Math.max(50, Math.min(MAP_WIDTH - 50, randomBush.position.x + Math.cos(angle) * distance)),
        y: Math.max(50, Math.min(MAP_HEIGHT - 50, randomBush.position.y + Math.sin(angle) * distance))
      };
    } else {
      // Fallback to random location away from edges
      candidate = {
        x: 50 + Math.random() * (MAP_WIDTH - 100),
        y: 50 + Math.random() * (MAP_HEIGHT - 100)
      };
    }
    
    // Check if location is safe (not too close to predators or humans)
    let isSafe = true;
    const minSafeDistance = 100;
    
    for (const predator of predators) {
      const distance = Math.sqrt((candidate.x - predator.position.x) ** 2 + (candidate.y - predator.position.y) ** 2);
      if (distance < minSafeDistance) {
        isSafe = false;
        break;
      }
    }
    
    if (isSafe) {
      for (const human of humans) {
        const distance = Math.sqrt((candidate.x - human.position.x) ** 2 + (candidate.y - human.position.y) ** 2);
        if (distance < minSafeDistance) {
          isSafe = false;
          break;
        }
      }
    }
    
    if (isSafe) {
      return candidate;
    }
  }
  
  // Fallback to center area if no safe location found
  return {
    x: MAP_WIDTH * 0.3 + Math.random() * MAP_WIDTH * 0.4,
    y: MAP_HEIGHT * 0.3 + Math.random() * MAP_HEIGHT * 0.4
  };
}

/**
 * Find a good spawn location for predators near prey but not too close to humans
 */
function findPredatorSpawnLocation(indexedState: IndexedWorldState): Vector2D {
  const prey = indexedState.search.prey.byProperty('type', 'prey') as PreyEntity[];
  const humans = indexedState.search.human.byProperty('type', 'human');
  
  // Try to find location near prey but away from humans
  for (let attempt = 0; attempt < 15; attempt++) {
    let candidate: Vector2D;
    
    if (prey.length > 0 && attempt < 10) {
      // Try to spawn near prey
      const randomPrey = prey[Math.floor(Math.random() * prey.length)];
      const angle = Math.random() * 2 * Math.PI;
      const distance = 100 + Math.random() * 150; // 100-250 pixels from prey
      candidate = {
        x: Math.max(50, Math.min(MAP_WIDTH - 50, randomPrey.position.x + Math.cos(angle) * distance)),
        y: Math.max(50, Math.min(MAP_HEIGHT - 50, randomPrey.position.y + Math.sin(angle) * distance))
      };
    } else {
      // Fallback to random location away from edges
      candidate = {
        x: 50 + Math.random() * (MAP_WIDTH - 100),
        y: 50 + Math.random() * (MAP_HEIGHT - 100)
      };
    }
    
    // Check if location is reasonably away from humans
    let isAcceptable = true;
    const minDistanceFromHumans = 150;
    
    for (const human of humans) {
      const distance = Math.sqrt((candidate.x - human.position.x) ** 2 + (candidate.y - human.position.y) ** 2);
      if (distance < minDistanceFromHumans) {
        isAcceptable = false;
        break;
      }
    }
    
    if (isAcceptable) {
      return candidate;
    }
  }
  
  // Fallback to edge areas away from center
  const edge = Math.floor(Math.random() * 4);
  switch (edge) {
    case 0: // Top edge
      return { x: Math.random() * MAP_WIDTH, y: 50 + Math.random() * 100 };
    case 1: // Right edge
      return { x: MAP_WIDTH - 150 + Math.random() * 100, y: Math.random() * MAP_HEIGHT };
    case 2: // Bottom edge
      return { x: Math.random() * MAP_WIDTH, y: MAP_HEIGHT - 150 + Math.random() * 100 };
    default: // Left edge
      return { x: 50 + Math.random() * 100, y: Math.random() * MAP_HEIGHT };
  }
}

/**
 * Find a good spawn location for bushes away from high-traffic areas
 */
function findBushSpawnLocation(indexedState: IndexedWorldState): Vector2D {
  const humans = indexedState.search.human.byProperty('type', 'human');
  const existingBushes = indexedState.search.berryBush.byProperty('type', 'berryBush') as BerryBushEntity[];
  
  // Try to find location away from humans and not crowding existing bushes
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = {
      x: 50 + Math.random() * (MAP_WIDTH - 100),
      y: 50 + Math.random() * (MAP_HEIGHT - 100)
    };
    
    let isGoodLocation = true;
    const minDistanceFromHumans = 80;
    const minDistanceFromBushes = 60;
    
    // Check distance from humans
    for (const human of humans) {
      const distance = Math.sqrt((candidate.x - human.position.x) ** 2 + (candidate.y - human.position.y) ** 2);
      if (distance < minDistanceFromHumans) {
        isGoodLocation = false;
        break;
      }
    }
    
    // Check distance from existing bushes
    if (isGoodLocation) {
      for (const bush of existingBushes) {
        const distance = Math.sqrt((candidate.x - bush.position.x) ** 2 + (candidate.y - bush.position.y) ** 2);
        if (distance < minDistanceFromBushes) {
          isGoodLocation = false;
          break;
        }
      }
    }
    
    if (isGoodLocation) {
      return candidate;
    }
  }
  
  // Fallback to random location
  return {
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT
  };
}

/**
 * Respawn prey when they go extinct
 */
export function respawnPrey(gameState: GameWorldState, count: number = 4): void {
  console.log(`🚨 Respawning ${count} prey to prevent extinction`);
  const indexedState = gameState as IndexedWorldState;
  
  for (let i = 0; i < count; i++) {
    const spawnPosition = findPreySpawnLocation(indexedState);
    const gender = i % 2 === 0 ? 'male' : 'female';
    createPrey(gameState.entities, spawnPosition, gender, undefined, undefined, generateRandomPreyGeneCode());
  }
}

/**
 * Respawn predators when they go extinct
 */
export function respawnPredators(gameState: GameWorldState, count: number = 2): void {
  console.log(`🚨 Respawning ${count} predators to prevent extinction`);
  const indexedState = gameState as IndexedWorldState;
  
  for (let i = 0; i < count; i++) {
    const spawnPosition = findPredatorSpawnLocation(indexedState);
    const gender = i % 2 === 0 ? 'male' : 'female';
    createPredator(gameState.entities, spawnPosition, gender, undefined, undefined, generateRandomPredatorGeneCode());
  }
}

/**
 * Check for extinct populations and respawn if necessary
 */
export function handlePopulationExtinction(gameState: GameWorldState): boolean {
  const indexedState = gameState as IndexedWorldState;
  const preyCount = indexedState.search.prey.count();
  const predatorCount = indexedState.search.predator.count();
  
  let interventionMade = false;
  
  // Respawn prey if extinct
  if (preyCount === 0) {
    respawnPrey(gameState, 6); // Respawn more prey since they're the base of the food chain
    interventionMade = true;
  }
  
  // Respawn predators if extinct
  if (predatorCount === 0) {
    respawnPredators(gameState, 3); // Respawn a small pack of predators
    interventionMade = true;
  }
  
  return interventionMade;
}

/**
 * Emergency population boost when populations are critically low
 */
export function emergencyPopulationBoost(gameState: GameWorldState): boolean {
  const indexedState = gameState as IndexedWorldState;
  const preyCount = indexedState.search.prey.count();
  const predatorCount = indexedState.search.predator.count();
  const bushCount = indexedState.search.berryBush.count();
  
  let interventionMade = false;
  
  // Much more conservative thresholds for population boosts to let RL learn
  if (preyCount > 0 && preyCount < 5) { // Reduced from 25 to 5 - only at extreme low levels
    const boostAmount = Math.max(2, Math.floor(8 - preyCount));
    respawnPrey(gameState, boostAmount);
    interventionMade = true;
  }
  
  if (predatorCount > 0 && predatorCount < 2) { // Reduced from 8 to 2 - only at extreme low levels
    const boostAmount = Math.max(1, Math.floor(3 - predatorCount));
    respawnPredators(gameState, boostAmount);
    interventionMade = true;
  }
  
  // Boost bushes if very low - reduced threshold
  if (bushCount < 5) { // Reduced from 30 to 5 - only when nearly extinct
    console.log(`🚨 Boosting bush count from ${bushCount} to help ecosystem`);
    for (let i = 0; i < 5; i++) { // Reduced from 10 to 5
      const bushPosition = findBushSpawnLocation(indexedState);
      createBerryBush(gameState.entities, bushPosition, gameState.time);
    }
    interventionMade = true;
  }
  
  return interventionMade;
}