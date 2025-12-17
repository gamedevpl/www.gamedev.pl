/**
 * Utility functions for tribe territory calculation and management.
 */

import { Vector2D } from '../../utils/math-types';
import { EntityId } from '../entities-types';
import { GameWorldState } from '../../world-types';
import { TerritoryCheckResult } from './territory-types';
import { TERRITORY_OWNERSHIP_RESOLUTION } from './territory-consts';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../utils/math-utils';

/** Converts a world position to territory grid coordinates. */
export function convertPositionToTerritoryGrid(position: Vector2D): Vector2D {
  const x = Math.floor(position.x / TERRITORY_OWNERSHIP_RESOLUTION);
  const y = Math.floor(position.y / TERRITORY_OWNERSHIP_RESOLUTION);
  return { x, y };
}

/** Converts a territory grid index back to world position (center of the grid cell). */
export function convertTerritoryIndexToPosition(index: number, worldWidth: number): Vector2D {
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
  const x = (index % gridWidth) * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2;
  const y = Math.floor(index / gridWidth) * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2;
  return { x, y };
}

/** Converts a world position to a territory grid index. */
export function convertPositionToTerritoryIndex(position: Vector2D, worldWidth: number): number {
  const gridPos = convertPositionToTerritoryGrid(position);
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
  return gridPos.y * gridWidth + gridPos.x;
}

/**
 * Helper to check if a point is within a specific territory.
 * Uses the terrainOwnership grid to determine ownership.
 */
export function getOwnerOfPoint(x: number, y: number, gameState: GameWorldState): EntityId | null {
  const territoryIndex = convertPositionToTerritoryIndex({ x, y }, gameState.mapDimensions.width);
  return gameState.terrainOwnership[territoryIndex] || null;
}

/**
 * Checks if a position is within a territory or near its border.
 * Simplified for grid-based territory system.
 */
export function checkPositionInTerritory(
  position: Vector2D,
  leaderId: EntityId,
  gameState: GameWorldState,
): TerritoryCheckResult {
  const owner = getOwnerOfPoint(position.x, position.y, gameState);
  const isInside = owner === leaderId;

  return {
    isInsideTerritory: isInside,
    isNearBorder: false, // Grid system doesn't support near-border detection
    distanceToEdge: 0, // Grid system doesn't support distance calculation
    leaderId,
  };
}

/**
 * Checks if a position is valid for building placement based on territory rules.
 * - Must be inside or near the owner's territory (or no territory exists yet)
 * - Must not be inside another tribe's territory
 */
export function canPlaceBuildingInTerritory(
  position: Vector2D,
  ownerId: EntityId,
  gameState: GameWorldState,
): { canPlace: boolean; reason?: string } {
  const positionOwner = getOwnerOfPoint(position.x, position.y, gameState);

  // If the position is unowned or owned by the builder, allow placement
  if (positionOwner === null || positionOwner === ownerId) {
    return { canPlace: true };
  }

  // If owned by another tribe, deny placement
  if (positionOwner !== ownerId) {
    return { canPlace: false, reason: "Position is inside another tribe's territory" };
  }

  return { canPlace: true };
}

/**
 * Checks if a position is valid for a tribe member to wander to.
 * Members should stay within territory or in unowned areas.
 */
export function isValidWanderPosition(position: Vector2D, leaderId: EntityId, gameState: GameWorldState): boolean {
  const owner = getOwnerOfPoint(position.x, position.y, gameState);

  // Allow wandering in own territory or unowned areas
  if (owner === null || owner === leaderId) {
    return true;
  }

  // Don't wander into other tribes' territories
  return false;
}

/**
 * Checks if a target position is within reasonable operating range for a tribe member.
 * This allows gathering/hunting slightly outside territory but not in enemy territory.
 * @param targetPosition The position to check
 * @param leaderId The leader ID of the tribe
 * @param gameState The current game state
 * @param maxDistanceOutside Maximum distance outside territory edge (default: TERRITORY_WANDER_DISTANCE)
 * @returns True if the target is within operating range
 */
export function isWithinOperatingRange(
  targetPosition: Vector2D,
  leaderId: EntityId,
  gameState: GameWorldState,
): boolean {
  const owner = getOwnerOfPoint(targetPosition.x, targetPosition.y, gameState);

  // Inside own territory or unowned is always valid
  if (owner === null || owner === leaderId) {
    return true;
  }

  // Don't operate in other tribes' territories
  return false;
}

/**
 * Constrains a wander target to be within territory bounds.
 * If the target is outside territory, returns a position that is valid.
 */
export function constrainWanderToTerritory(
  currentPosition: Vector2D,
  targetPosition: Vector2D,
  leaderId: EntityId,
  gameState: GameWorldState,
): Vector2D {
  // Check if target is valid
  if (isValidWanderPosition(targetPosition, leaderId, gameState)) {
    return targetPosition;
  }

  // Find the closest valid position along the direction to the target
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const directionToTarget = getDirectionVectorOnTorus(currentPosition, targetPosition, worldWidth, worldHeight);

  // Pre-calculate magnitude to avoid division by zero
  const magnitude = Math.sqrt(directionToTarget.x ** 2 + directionToTarget.y ** 2);
  if (magnitude === 0) {
    return currentPosition; // Target is at the same position
  }

  // Binary search to find the furthest valid position along the direction
  let validPosition = currentPosition;
  const maxDistance = calculateWrappedDistance(currentPosition, targetPosition, worldWidth, worldHeight);
  const step = maxDistance / 10;

  for (let d = step; d <= maxDistance; d += step) {
    const testPosition: Vector2D = {
      x: (((currentPosition.x + (directionToTarget.x * d) / magnitude) % worldWidth) + worldWidth) % worldWidth,
      y: (((currentPosition.y + (directionToTarget.y * d) / magnitude) % worldHeight) + worldHeight) % worldHeight,
    };

    if (isValidWanderPosition(testPosition, leaderId, gameState)) {
      validPosition = testPosition;
    } else {
      break;
    }
  }

  return validPosition;
}

/**
 * Paints terrain ownership in a circular area around a position.
 * Used when buildings are placed to claim territory.
 *
 * @param position The center position of the territory to claim (typically a building position)
 * @param radius The radius of the circular territory area (typically TERRITORY_BUILDING_RADIUS)
 * @param ownerId The entity ID of the tribe leader claiming this territory
 * @param gameState The current game state
 */
export function paintTerrainOwnership(
  position: Vector2D,
  radius: number,
  ownerId: EntityId,
  gameState: GameWorldState,
): void {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  // Calculate grid dimensions
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / TERRITORY_OWNERSHIP_RESOLUTION);

  // Calculate the bounding box of grid cells affected by the circular radius
  // We need to check cells in a square area that encompasses the circle
  const radiusInCells = Math.ceil(radius / TERRITORY_OWNERSHIP_RESOLUTION);

  // Convert position to grid coordinates
  const centerGridX = Math.floor(position.x / TERRITORY_OWNERSHIP_RESOLUTION);
  const centerGridY = Math.floor(position.y / TERRITORY_OWNERSHIP_RESOLUTION);

  // Iterate through all grid cells in the bounding box
  for (let dy = -radiusInCells; dy <= radiusInCells; dy++) {
    for (let dx = -radiusInCells; dx <= radiusInCells; dx++) {
      // Calculate grid coordinates with wrapping
      const gridX = (((centerGridX + dx) % gridWidth) + gridWidth) % gridWidth;
      const gridY = (((centerGridY + dy) % gridHeight) + gridHeight) % gridHeight;

      // Calculate the cell's center position in world coordinates
      const cellCenterX = gridX * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2;
      const cellCenterY = gridY * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2;

      // Check if the cell center is within radius of the building position using wrapped distance
      const distance = calculateWrappedDistance(position, { x: cellCenterX, y: cellCenterY }, worldWidth, worldHeight);

      if (distance <= radius) {
        // Calculate the 1D array index
        const index = gridY * gridWidth + gridX;

        // Only overwrite cells that are unowned or already owned by the same tribe
        // This respects existing ownership from other tribes
        if (gameState.terrainOwnership[index] === null || gameState.terrainOwnership[index] === ownerId) {
          gameState.terrainOwnership[index] = ownerId;
        }
      }
    }
  }
}

/**
 * Finds the nearest territory edge for a given tribe from a starting position.
 * An edge is defined as a grid cell owned by the tribe that is adjacent to a cell NOT owned by the tribe.
 *
 * @param position The search start position
 * @param tribeId The ID of the tribe
 * @param gameState The current game state
 * @returns The position of the nearest edge cell center, or null if not found (e.g., no territory or map full)
 */
export function findNearestTerritoryEdge(
  position: Vector2D,
  tribeId: EntityId,
  gameState: GameWorldState,
): Vector2D | null {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / TERRITORY_OWNERSHIP_RESOLUTION);

  const startGridX = Math.floor(position.x / TERRITORY_OWNERSHIP_RESOLUTION);
  const startGridY = Math.floor(position.y / TERRITORY_OWNERSHIP_RESOLUTION);

  // Spiral search to find nearest edge
  // Max search radius in cells (e.g., 50 cells = 1000px)
  const maxRadius = 50;

  for (let r = 0; r <= maxRadius; r++) {
    // Check points on the perimeter of the square of radius r
    // For r=0, it's just the center point
    const minX = -r;
    const maxX = r;
    const minY = -r;
    const maxY = r;

    // Iterate through the perimeter
    for (let dy = minY; dy <= maxY; dy++) {
      for (let dx = minX; dx <= maxX; dx++) {
        // Only check perimeter cells (skip internal ones unless r=0)
        if (r > 0 && dx > minX && dx < maxX && dy > minY && dy < maxY) {
          continue;
        }

        const gridX = (((startGridX + dx) % gridWidth) + gridWidth) % gridWidth;
        const gridY = (((startGridY + dy) % gridHeight) + gridHeight) % gridHeight;
        const index = gridY * gridWidth + gridX;

        // Check if this cell belongs to the tribe
        if (gameState.terrainOwnership[index] === tribeId) {
          // Check neighbors to see if any are NOT owned by this tribe
          let isEdge = false;

          // Check 4-connectivity neighbors
          const neighbors = [
            { nx: 0, ny: -1 }, // Top
            { nx: 1, ny: 0 }, // Right
            { nx: 0, ny: 1 }, // Bottom
            { nx: -1, ny: 0 }, // Left
          ];

          for (const { nx, ny } of neighbors) {
            const nGridX = (((gridX + nx) % gridWidth) + gridWidth) % gridWidth;
            const nGridY = (((gridY + ny) % gridHeight) + gridHeight) % gridHeight;
            const nIndex = nGridY * gridWidth + nGridX;

            if (gameState.terrainOwnership[nIndex] !== tribeId) {
              isEdge = true;
              break;
            }
          }

          if (isEdge) {
            // Found an edge cell! Return its center position.
            return {
              x: gridX * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2,
              y: gridY * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2,
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Calculates the normal vector of the territory edge at a given position.
 * The normal points OUT of the territory (towards unowned/other territory).
 *
 * @param position The position on the edge
 * @param tribeId The ID of the tribe
 * @param gameState The current game state
 * @returns A normalized vector pointing away from the territory
 */
export function getTerritoryEdgeNormal(position: Vector2D, tribeId: EntityId, gameState: GameWorldState): Vector2D {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / TERRITORY_OWNERSHIP_RESOLUTION);

  const gridX = Math.floor(position.x / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridY = Math.floor(position.y / TERRITORY_OWNERSHIP_RESOLUTION);

  let normalX = 0;
  let normalY = 0;

  // Check 8 neighbors
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nGridX = (((gridX + dx) % gridWidth) + gridWidth) % gridWidth;
      const nGridY = (((gridY + dy) % gridHeight) + gridHeight) % gridHeight;
      const nIndex = nGridY * gridWidth + nGridX;

      // If neighbor is NOT owned by tribe, the normal points towards it
      if (gameState.terrainOwnership[nIndex] !== tribeId) {
        normalX += dx;
        normalY += dy;
      }
    }
  }

  // If we found directions towards non-territory, normalize and return
  if (normalX !== 0 || normalY !== 0) {
    return vectorNormalize({ x: normalX, y: normalY });
  }

  // Fallback: if surrounded by own territory (shouldn't happen if called on edge), return zero vector
  return { x: 0, y: 0 };
}

/**
 * Replaces all occurrences of an old owner ID with a new owner ID in the terrain ownership grid.
 * Used when a tribe is disbanded or changes leadership.
 */
export function replaceOwnerInTerrainOwnership(
  gameState: GameWorldState,
  oldOwnerId: EntityId,
  newOwnerId: EntityId | null,
): void {
  const ownershipGrid = gameState.terrainOwnership;
  for (let i = 0; i < ownershipGrid.length; i++) {
    if (ownershipGrid[i] === oldOwnerId) {
      ownershipGrid[i] = newOwnerId;
    }
  }
}
