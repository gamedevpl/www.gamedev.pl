/**
 * Population resurrection system for ecosystem balancer.
 * Handles direct population intervention when species go extinct.
 */

import { createPrey, createPredator, createBerryBush } from '../entities/entities-update';
import { GameWorldState } from '../world-types';
import { generateRandomPreyGeneCode } from '../entities/characters/prey/prey-utils';
import { generateRandomPredatorGeneCode } from '../entities/characters/predator/predator-utils';
import { MAP_WIDTH, MAP_HEIGHT } from '../world-consts';

/**
 * Respawn prey when they go extinct
 */
export function respawnPrey(gameState: GameWorldState, count: number = 4): void {
  console.log(`Respawning ${count} prey to prevent extinction`);
  
  for (let i = 0; i < count; i++) {
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    
    const gender = i % 2 === 0 ? 'male' : 'female';
    createPrey(gameState.entities, randomPosition, gender, undefined, undefined, generateRandomPreyGeneCode());
  }
}

/**
 * Respawn predators when they go extinct
 */
export function respawnPredators(gameState: GameWorldState, count: number = 2): void {
  console.log(`Respawning ${count} predators to prevent extinction`);
  
  for (let i = 0; i < count; i++) {
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    
    const gender = i % 2 === 0 ? 'male' : 'female';
    createPredator(gameState.entities, randomPosition, gender, undefined, undefined, generateRandomPredatorGeneCode());
  }
}

/**
 * Check for extinct populations and respawn if necessary
 */
export function handlePopulationExtinction(gameState: GameWorldState): boolean {
  const preyCount = (gameState as any).search.prey.count();
  const predatorCount = (gameState as any).search.predator.count();
  
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
  const preyCount = (gameState as any).search.prey.count();
  const predatorCount = (gameState as any).search.predator.count();
  const bushCount = (gameState as any).search.berryBush.count();
  
  let interventionMade = false;
  
  // More aggressive thresholds for population boosts
  if (preyCount > 0 && preyCount < 25) { // Increased from 5 to 25
    const boostAmount = Math.max(3, Math.floor(25 - preyCount / 2));
    respawnPrey(gameState, boostAmount);
    interventionMade = true;
  }
  
  if (predatorCount > 0 && predatorCount < 8) { // Increased from 2 to 8
    const boostAmount = Math.max(2, Math.floor(8 - predatorCount / 2));
    respawnPredators(gameState, boostAmount);
    interventionMade = true;
  }
  
  // Boost bushes if very low
  if (bushCount < 30) {
    console.log(`Boosting bush count from ${bushCount} to help ecosystem`);
    for (let i = 0; i < 10; i++) {
      const randomPosition = {
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
      };
      
      createBerryBush(gameState.entities, randomPosition, gameState.time);
    }
    interventionMade = true;
  }
  
  return interventionMade;
}