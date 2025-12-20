/**
 * Soil depletion system update logic.
 * Handles soil health degradation from walking and planting,
 * and soil recovery over time.
 */

import { Vector2D } from '../../utils/math-types';
import { EntityId } from '../entities-types';
import { GameWorldState } from '../../world-types';
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
  SOIL_DEPLETION_PLANTING_ZONE_MULTIPLIER,
  SOIL_UPDATE_INTERVAL_HOURS,
} from './soil-depletion-consts';
import { isPositionInAnyPlantingZone } from '../tribe/tribe-food-utils';

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
  gameState: GameWorldState,
): void {
  const { gridX, gridY } = positionToGridCoords(position, worldWidth, worldHeight);
  const sector = getSector(state, gridX, gridY);

  // Check cooldown for this entity
  const lastAffected = sector.lastAffectedBy[entityId] || 0;
  if (currentTime - lastAffected < SOIL_WALK_DEPLETION_COOLDOWN_HOURS) {
    return; // Still on cooldown
  }

  // Apply depletion
  const multiplier = isPositionInAnyPlantingZone(position, gameState) ? SOIL_DEPLETION_PLANTING_ZONE_MULTIPLIER : 1;
  const depletionAmount = SOIL_DEPLETION_PER_WALK * multiplier;

  sector.health = Math.max(SOIL_HEALTH_MIN, sector.health - depletionAmount);
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
  gameState: GameWorldState,
): void {
  const { gridX, gridY } = positionToGridCoords(position, worldWidth, worldHeight);
  const sector = getSector(state, gridX, gridY);

  const multiplier = isPositionInAnyPlantingZone(position, gameState) ? SOIL_DEPLETION_PLANTING_ZONE_MULTIPLIER : 1;
  const depletionAmount = SOIL_DEPLETION_PER_BUSH_PLANT * multiplier;

  sector.health = Math.max(SOIL_HEALTH_MIN, sector.health - depletionAmount);
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
export function updateSoilRecovery({
  soilDepletion: state,
  time: currentTime,
  mapDimensions: { width: worldWidth, height: worldHeight },
}: GameWorldState): void {
  if (currentTime - state.lastUpdateTime < SOIL_UPDATE_INTERVAL_HOURS) {
    return;
  }
  const gameHoursDelta = currentTime - state.lastUpdateTime;
  state.lastUpdateTime = currentTime;

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
): { depletedSectors: Array<{ gridX: number; gridY: number }>; totalSectorsCount: number } {
  const depletedSectors: Array<{ gridX: number; gridY: number }> = [];

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Calculate grid bounds
  const minX = centerPosition.x - halfWidth;
  const maxX = centerPosition.x + halfWidth;
  const minY = centerPosition.y - halfHeight;
  const maxY = centerPosition.y + halfHeight;

  const startGridX = Math.floor(minX / SOIL_SECTOR_SIZE);
  // Use a small epsilon to avoid including the next sector if the coordinate is exactly on the boundary
  const endGridX = Math.floor((maxX - 0.001) / SOIL_SECTOR_SIZE);
  const startGridY = Math.floor(minY / SOIL_SECTOR_SIZE);
  const endGridY = Math.floor((maxY - 0.001) / SOIL_SECTOR_SIZE);

  const maxGridX = Math.ceil(worldWidth / SOIL_SECTOR_SIZE);
  const maxGridY = Math.ceil(worldHeight / SOIL_SECTOR_SIZE);

  let totalSectorsCount = 0;
  for (let gx = startGridX; gx <= endGridX; gx++) {
    for (let gy = startGridY; gy <= endGridY; gy++) {
      totalSectorsCount++;
      // Handle wrapping
      const wrappedGx = ((gx % maxGridX) + maxGridX) % maxGridX;
      const wrappedGy = ((gy % maxGridY) + maxGridY) % maxGridY;

      if (!isSoilViableAtGrid(state, wrappedGx, wrappedGy)) {
        depletedSectors.push({ gridX: wrappedGx, gridY: wrappedGy });
      }
    }
  }

  return { depletedSectors, totalSectorsCount };
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

  return 1.0 + (depletedSpeedBonus - 1) * Math.sqrt(1 - health / SOIL_HEALTH_MAX); // Normalized speed modifier
}
