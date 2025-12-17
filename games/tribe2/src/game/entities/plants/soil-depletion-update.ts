/**
 * Soil depletion system update logic.
 * Handles soil health degradation from walking and planting,
 * and soil recovery over time.
 */

import { Vector2D } from '../../utils/math-types';
import { EntityId } from '../entities-types';
import {
  SoilDepletionState,
  SoilSector,
  getSectorKey,
  parseSectorKey,
  createDefaultSector,
} from './soil-depletion-types';
import {
  SOIL_SECTOR_SIZE,
  SOIL_HEALTH_MAX,
  SOIL_HEALTH_MIN,
  SOIL_HEALTH_DEPLETED_THRESHOLD,
  SOIL_DEPLETION_PER_BUSH_PLANT,
  SOIL_DEPLETION_PER_WALK,
  SOIL_WALK_DEPLETION_COOLDOWN_HOURS,
  SOIL_RECOVERY_RATE_BASE,
  SOIL_RECOVERY_RATE_ADJACENT_BONUS,
  SOIL_RECOVERY_INACTIVE_THRESHOLD_HOURS,
} from './soil-depletion-consts';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../game-consts';

/**
 * Converts a world position to grid coordinates.
 */
function positionToGridCoords(
  position: Vector2D,
  worldWidth: number,
  worldHeight: number,
): { gridX: number; gridY: number } {
  // Handle wrapping
  const wrappedX = ((position.x % worldWidth) + worldWidth) % worldWidth;
  const wrappedY = ((position.y % worldHeight) + worldHeight) % worldHeight;

  return {
    gridX: Math.floor(wrappedX / SOIL_SECTOR_SIZE),
    gridY: Math.floor(wrappedY / SOIL_SECTOR_SIZE),
  };
}

/**
 * Gets a sector from the state, creating a default one if it doesn't exist.
 */
function getSector(state: SoilDepletionState, gridX: number, gridY: number): SoilSector {
  const key = getSectorKey(gridX, gridY);
  if (!state.sectors[key]) {
    state.sectors[key] = createDefaultSector();
  }
  return state.sectors[key];
}

/**
 * Gets the health of a sector without modifying state.
 * Returns max health for non-existent sectors.
 */
function getSectorHealth(state: SoilDepletionState, gridX: number, gridY: number): number {
  const key = getSectorKey(gridX, gridY);
  const sector = state.sectors[key];
  return sector ? sector.health : SOIL_HEALTH_MAX;
}

/**
 * Checks if soil at a position is depleted.
 */
export function isSoilDepleted(
  state: SoilDepletionState,
  position: Vector2D,
  worldWidth: number,
  worldHeight: number,
): boolean {
  const { gridX, gridY } = positionToGridCoords(position, worldWidth, worldHeight);
  const health = getSectorHealth(state, gridX, gridY);
  return health < SOIL_HEALTH_DEPLETED_THRESHOLD;
}

/**
 * Checks if soil at grid coordinates is viable (not depleted).
 */
function isSoilViableAtGrid(state: SoilDepletionState, gridX: number, gridY: number): boolean {
  const health = getSectorHealth(state, gridX, gridY);
  return health >= SOIL_HEALTH_DEPLETED_THRESHOLD;
}

/**
 * Applies depletion from an entity walking on a sector.
 */
export function applySoilWalkDepletion(
  state: SoilDepletionState,
  position: Vector2D,
  entityId: EntityId,
  currentTime: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const { gridX, gridY } = positionToGridCoords(position, worldWidth, worldHeight);
  const sector = getSector(state, gridX, gridY);

  // Check cooldown for this entity
  const lastAffected = sector.lastAffectedBy[entityId] || 0;
  if (currentTime - lastAffected < SOIL_WALK_DEPLETION_COOLDOWN_HOURS) {
    return; // Still on cooldown
  }

  // Apply depletion
  sector.health = Math.max(SOIL_HEALTH_MIN, sector.health - SOIL_DEPLETION_PER_WALK);
  sector.lastWalkTime = currentTime;
  sector.lastAffectedBy[entityId] = currentTime;
}

/**
 * Applies depletion from planting a bush.
 */
export function applySoilPlantDepletion(
  state: SoilDepletionState,
  position: Vector2D,
  currentTime: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const { gridX, gridY } = positionToGridCoords(position, worldWidth, worldHeight);
  const sector = getSector(state, gridX, gridY);

  sector.health = Math.max(SOIL_HEALTH_MIN, sector.health - SOIL_DEPLETION_PER_BUSH_PLANT);
  sector.lastPlantTime = currentTime;
}

/**
 * Gets the number of viable adjacent sectors (for recovery bonus calculation).
 */
function countViableAdjacentSectors(
  state: SoilDepletionState,
  gridX: number,
  gridY: number,
  maxGridX: number,
  maxGridY: number,
): number {
  let count = 0;

  // Check all 8 adjacent sectors (including diagonals)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;

      // Handle wrapping
      const adjX = (((gridX + dx) % maxGridX) + maxGridX) % maxGridX;
      const adjY = (((gridY + dy) % maxGridY) + maxGridY) % maxGridY;

      if (isSoilViableAtGrid(state, adjX, adjY)) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Updates soil recovery for all affected sectors.
 * Called once per frame from the main world update.
 */
export function updateSoilRecovery(
  state: SoilDepletionState,
  currentTime: number,
  deltaTimeSeconds: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const gameHoursDelta = deltaTimeSeconds * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
  const maxGridX = Math.ceil(worldWidth / SOIL_SECTOR_SIZE);
  const maxGridY = Math.ceil(worldHeight / SOIL_SECTOR_SIZE);

  // Process all stored sectors
  const keysToRemove: string[] = [];

  for (const key of Object.keys(state.sectors)) {
    const sector = state.sectors[key];

    // Check if sector has been inactive long enough for recovery
    const lastActivity = Math.max(sector.lastWalkTime, sector.lastPlantTime);
    if (currentTime - lastActivity < SOIL_RECOVERY_INACTIVE_THRESHOLD_HOURS) {
      continue; // Still active, no recovery
    }

    // Calculate recovery rate
    const { gridX, gridY } = parseSectorKey(key);
    const viableNeighbors = countViableAdjacentSectors(state, gridX, gridY, maxGridX, maxGridY);
    const adjacentBonus = viableNeighbors > 0 ? SOIL_RECOVERY_RATE_ADJACENT_BONUS * (viableNeighbors / 8) : 0;
    const recoveryRate = SOIL_RECOVERY_RATE_BASE + adjacentBonus;

    // Apply recovery
    sector.health = Math.min(SOIL_HEALTH_MAX, sector.health + recoveryRate * gameHoursDelta);

    // Clean up fully recovered sectors to save memory
    if (sector.health >= SOIL_HEALTH_MAX) {
      keysToRemove.push(key);
    }

    // Clean up old entity cooldown entries
    const cooldownThreshold = currentTime - SOIL_WALK_DEPLETION_COOLDOWN_HOURS * 10;
    for (const entityId of Object.keys(sector.lastAffectedBy)) {
      if (sector.lastAffectedBy[Number(entityId)] < cooldownThreshold) {
        delete sector.lastAffectedBy[Number(entityId)];
      }
    }
  }

  // Remove fully recovered sectors
  for (const key of keysToRemove) {
    delete state.sectors[key];
  }
}

/**
 * Gets all depleted sectors for rendering.
 * Returns an array of { position, health } for sectors below render threshold.
 */
export function getDepletedSectorsForRendering(
  state: SoilDepletionState,
  renderThreshold: number,
): Array<{ gridX: number; gridY: number; health: number }> {
  const result: Array<{ gridX: number; gridY: number; health: number }> = [];

  for (const key of Object.keys(state.sectors)) {
    const sector = state.sectors[key];
    if (sector.health < renderThreshold) {
      const { gridX, gridY } = parseSectorKey(key);
      result.push({ gridX, gridY, health: sector.health });
    }
  }

  return result;
}

/**
 * Gets depleted sectors within a rectangular area (for checking planting zones).
 */
export function getDepletedSectorsInArea(
  state: SoilDepletionState,
  centerPosition: Vector2D,
  width: number,
  height: number,
  worldWidth: number,
  worldHeight: number,
): Array<{ gridX: number; gridY: number }> {
  const result: Array<{ gridX: number; gridY: number }> = [];

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Calculate grid bounds
  const minX = centerPosition.x - halfWidth;
  const maxX = centerPosition.x + halfWidth;
  const minY = centerPosition.y - halfHeight;
  const maxY = centerPosition.y + halfHeight;

  const startGridX = Math.floor(minX / SOIL_SECTOR_SIZE);
  const endGridX = Math.ceil(maxX / SOIL_SECTOR_SIZE);
  const startGridY = Math.floor(minY / SOIL_SECTOR_SIZE);
  const endGridY = Math.ceil(maxY / SOIL_SECTOR_SIZE);

  const maxGridX = Math.ceil(worldWidth / SOIL_SECTOR_SIZE);
  const maxGridY = Math.ceil(worldHeight / SOIL_SECTOR_SIZE);

  for (let gx = startGridX; gx <= endGridX; gx++) {
    for (let gy = startGridY; gy <= endGridY; gy++) {
      // Handle wrapping
      const wrappedGx = ((gx % maxGridX) + maxGridX) % maxGridX;
      const wrappedGy = ((gy % maxGridY) + maxGridY) % maxGridY;

      if (!isSoilViableAtGrid(state, wrappedGx, wrappedGy)) {
        result.push({ gridX: wrappedGx, gridY: wrappedGy });
      }
    }
  }

  return result;
}

/**
 * Gets the speed modifier for movement based on soil depletion at a position.
 * Returns a value >= 1.0, with depleted soil giving a speed bonus.
 */
export function getSoilSpeedModifier(
  state: SoilDepletionState,
  position: Vector2D,
  worldWidth: number,
  worldHeight: number,
  depletedSpeedBonus: number,
): number {
  const { gridX, gridY } = positionToGridCoords(position, worldWidth, worldHeight);
  const health = getSectorHealth(state, gridX, gridY);

  // If soil is depleted, apply speed bonus
  if (health < SOIL_HEALTH_DEPLETED_THRESHOLD) {
    return depletedSpeedBonus;
  }

  return 1.0;
}

/**
 * Gets the soil depletion level at a position.
 * Returns a value between 0 and 1, where 0 is fully healthy soil and 1 is fully depleted.
 * Even slight depletion will return a value > 0, which can be used for path preference.
 */
export function getSoilDepletionLevel(
  state: SoilDepletionState,
  position: Vector2D,
  worldWidth: number,
  worldHeight: number,
): number {
  const { gridX, gridY } = positionToGridCoords(position, worldWidth, worldHeight);
  const health = getSectorHealth(state, gridX, gridY);

  // Convert health (0-100) to depletion level (0-1)
  // health 100 -> depletion 0
  // health 0 -> depletion 1
  return (SOIL_HEALTH_MAX - health) / SOIL_HEALTH_MAX;
}

/**
 * Calculates a direction bias towards nearby depleted soil.
 * This creates a subtle preference for entities to move along existing paths.
 * Samples positions around the entity and returns a weighted direction towards more depleted soil.
 * 
 * @param state The soil depletion state
 * @param position Current entity position
 * @param currentDirection Current movement direction (normalized)
 * @param sampleDistance Distance to sample around the entity
 * @param worldWidth World width for wrapping
 * @param worldHeight World height for wrapping
 * @returns A bias vector (not normalized) pointing towards depleted soil, or zero if no bias
 */
export function getPathPreferenceBias(
  state: SoilDepletionState,
  position: Vector2D,
  currentDirection: Vector2D,
  sampleDistance: number,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  // Sample 4 positions perpendicular to movement direction and slightly ahead
  // This biases movement towards depleted soil while still heading towards target
  const perpX = -currentDirection.y;
  const perpY = currentDirection.x;
  
  // Sample positions: left, right, and forward-left, forward-right
  const samples = [
    { dx: perpX * sampleDistance, dy: perpY * sampleDistance }, // left
    { dx: -perpX * sampleDistance, dy: -perpY * sampleDistance }, // right
    { dx: currentDirection.x * sampleDistance * 0.5 + perpX * sampleDistance * 0.5, 
      dy: currentDirection.y * sampleDistance * 0.5 + perpY * sampleDistance * 0.5 }, // forward-left
    { dx: currentDirection.x * sampleDistance * 0.5 - perpX * sampleDistance * 0.5, 
      dy: currentDirection.y * sampleDistance * 0.5 - perpY * sampleDistance * 0.5 }, // forward-right
  ];
  
  let biasX = 0;
  let biasY = 0;
  
  for (const sample of samples) {
    const samplePos = {
      x: ((position.x + sample.dx) % worldWidth + worldWidth) % worldWidth,
      y: ((position.y + sample.dy) % worldHeight + worldHeight) % worldHeight,
    };
    
    const depletion = getSoilDepletionLevel(state, samplePos, worldWidth, worldHeight);
    
    // Weight the direction towards this sample by its depletion level
    // Normalize the sample offset direction
    const dist = Math.sqrt(sample.dx * sample.dx + sample.dy * sample.dy);
    if (dist > 0) {
      biasX += (sample.dx / dist) * depletion;
      biasY += (sample.dy / dist) * depletion;
    }
  }
  
  return { x: biasX, y: biasY };
}
