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
 * Checks if a tribe has any territory at all.
 * @param ownerId The tribe leader ID
 * @param gameState The current game state
 */
export function tribeHasTerritory(ownerId: EntityId, gameState: GameWorldState): boolean {
  // Fast native check
  return gameState.terrainOwnership.includes(ownerId);
}

/**
 * Checks if placing territory at a position with a given radius would maintain contiguity.
 * Rules:
 * 1. Must not overlap with another tribe's territory.
 * 2. Must touch existing territory of the same tribe, OR
 * 3. If the tribe has NO territory, it can be placed anywhere (that isn't owned by others).
 *
 * @param position The center of the new territory
 * @param radius The radius of the new territory
 * @param ownerId The tribe leader ID
 * @param gameState The current game state
 */
export function checkTerritoryContiguity(
  position: Vector2D,
  radius: number,
  ownerId: EntityId,
  gameState: GameWorldState,
): { valid: boolean; reason?: string } {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / TERRITORY_OWNERSHIP_RESOLUTION);
  const radiusInCells = Math.ceil(radius / TERRITORY_OWNERSHIP_RESOLUTION);

  const centerGridX = Math.floor(position.x / TERRITORY_OWNERSHIP_RESOLUTION);
  const centerGridY = Math.floor(position.y / TERRITORY_OWNERSHIP_RESOLUTION);

  let hasAdjacency = false;
  let overlapsOtherTribe = false;

  // Scan the area that would be painted
  for (let dy = -radiusInCells; dy <= radiusInCells; dy++) {
    for (let dx = -radiusInCells; dx <= radiusInCells; dx++) {
      const gridX = (((centerGridX + dx) % gridWidth) + gridWidth) % gridWidth;
      const gridY = (((centerGridY + dy) % gridHeight) + gridHeight) % gridHeight;

      const cellCenterX = gridX * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2;
      const cellCenterY = gridY * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2;

      const distance = calculateWrappedDistance(position, { x: cellCenterX, y: cellCenterY }, worldWidth, worldHeight);

      if (distance <= radius) {
        const index = gridY * gridWidth + gridX;
        const currentOwner = gameState.terrainOwnership[index];

        if (currentOwner === ownerId) {
          hasAdjacency = true;
        } else if (currentOwner !== null) {
          overlapsOtherTribe = true;
        }
      }
    }
  }

  if (overlapsOtherTribe) {
    return { valid: false, reason: "Position overlaps with another tribe's territory" };
  }

  if (hasAdjacency) {
    return { valid: true };
  }

  // If no adjacency found, check if it's the first territory
  if (!tribeHasTerritory(ownerId, gameState)) {
    return { valid: true };
  }

  return { valid: false, reason: 'Territory must be contiguous with existing territory' };
}

/**
 * Checks if a position is valid for building placement based on territory rules.
 * - Must be inside or near the owner's territory (or no territory exists yet)
 * - Must not be inside another tribe's territory
 * - If radius is provided, checks for contiguity of the resulting territory
 *
 * @param position Position to check
 * @param ownerId Owner of the building
 * @param gameState Game state
 * @param radius Optional radius of territory the building will claim. If > 0, strict contiguity check is performed.
 */
export function canPlaceBuildingInTerritory(
  position: Vector2D,
  ownerId: EntityId,
  gameState: GameWorldState,
  radius: number = 0,
): { canPlace: boolean; reason?: string } {
  // If a radius is provided, perform the strict contiguity check
  if (radius > 0) {
    const contiguityCheck = checkTerritoryContiguity(position, radius, ownerId, gameState);
    if (!contiguityCheck.valid) {
      return { canPlace: false, reason: contiguityCheck.reason };
    }
    return { canPlace: true };
  }

  // Fallback to simple point check (legacy behavior or for 0 radius)
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
 * Paints terrain ownership with a robust 4-step process to ensure
 * clean, solid shapes without holes, elbows, or pixel noise.
 */
export function paintTerrainOwnership(
  position: Vector2D,
  radius: number,
  ownerId: EntityId,
  gameState: GameWorldState,
): void {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  // Grid config
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / TERRITORY_OWNERSHIP_RESOLUTION);

  // --- STEP 1: Paint the main circle (Standard) ---
  const radiusInCells = Math.ceil(radius / TERRITORY_OWNERSHIP_RESOLUTION);
  const centerGridX = Math.floor(position.x / TERRITORY_OWNERSHIP_RESOLUTION);
  const centerGridY = Math.floor(position.y / TERRITORY_OWNERSHIP_RESOLUTION);

  for (let dy = -radiusInCells; dy <= radiusInCells; dy++) {
    for (let dx = -radiusInCells; dx <= radiusInCells; dx++) {
      const gridX = (((centerGridX + dx) % gridWidth) + gridWidth) % gridWidth;
      const gridY = (((centerGridY + dy) % gridHeight) + gridHeight) % gridHeight;
      const cellCenterX = gridX * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2;
      const cellCenterY = gridY * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2;

      const distance = calculateWrappedDistance(position, { x: cellCenterX, y: cellCenterY }, worldWidth, worldHeight);

      if (distance <= radius) {
        const index = gridY * gridWidth + gridX;
        if (gameState.terrainOwnership[index] === null || gameState.terrainOwnership[index] === ownerId) {
          gameState.terrainOwnership[index] = ownerId;
        }
      }
    }
  }

  // --- STEP 2: Per-Pixel Bridge Filling ---
  // Connects walls that are close to each other (fixes "elbows")
  const BRIDGE_CHECK_DIST = 3;
  const scanRange = radiusInCells + BRIDGE_CHECK_DIST + 2;
  const cellsToBridge: number[] = [];

  for (let dy = -scanRange; dy <= scanRange; dy++) {
    for (let dx = -scanRange; dx <= scanRange; dx++) {
      const gridX = (((centerGridX + dx) % gridWidth) + gridWidth) % gridWidth;
      const gridY = (((centerGridY + dy) % gridHeight) + gridHeight) % gridHeight;
      const index = gridY * gridWidth + gridX;

      if (gameState.terrainOwnership[index] === null) {
        let isBridged = false;

        // Check 4 Axes
        const axes = [
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: -1 },
        ];

        for (const axis of axes) {
          let foundPositive = false;
          let foundNegative = false;

          for (let d = 1; d <= BRIDGE_CHECK_DIST; d++) {
            const nGx = (((gridX + axis.x * d) % gridWidth) + gridWidth) % gridWidth;
            const nGy = (((gridY + axis.y * d) % gridHeight) + gridHeight) % gridHeight;
            const nIndex = nGy * gridWidth + nGx;
            if (gameState.terrainOwnership[nIndex] === ownerId) {
              foundPositive = true;
              break;
            }
          }

          if (foundPositive) {
            for (let d = 1; d <= BRIDGE_CHECK_DIST; d++) {
              const nGx = (((gridX - axis.x * d) % gridWidth) + gridWidth) % gridWidth;
              const nGy = (((gridY - axis.y * d) % gridHeight) + gridHeight) % gridHeight;
              const nIndex = nGy * gridWidth + nGx;
              if (gameState.terrainOwnership[nIndex] === ownerId) {
                foundNegative = true;
                break;
              }
            }
          }

          if (foundPositive && foundNegative) {
            isBridged = true;
            break;
          }
        }

        if (isBridged) {
          cellsToBridge.push(index);
        }
      }
    }
  }
  for (const index of cellsToBridge) gameState.terrainOwnership[index] = ownerId;

  // --- STEP 3: Flood Fill Small Holes ---
  // Fills enclosed lakes/donuts
  const MAX_HOLE_SIZE = 250;
  const processedIndices = new Set<number>();

  for (let dy = -scanRange; dy <= scanRange; dy++) {
    for (let dx = -scanRange; dx <= scanRange; dx++) {
      const gridX = (((centerGridX + dx) % gridWidth) + gridWidth) % gridWidth;
      const gridY = (((centerGridY + dy) % gridHeight) + gridHeight) % gridHeight;
      const index = gridY * gridWidth + gridX;

      if (gameState.terrainOwnership[index] === null && !processedIndices.has(index)) {
        const regionCells: number[] = [];
        const queue: number[] = [index];
        processedIndices.add(index);
        regionCells.push(index);
        let isSmallHole = true;
        let head = 0;

        while (head < queue.length) {
          const currIndex = queue[head++];
          if (regionCells.length > MAX_HOLE_SIZE) {
            isSmallHole = false;
            break;
          }
          const currGx = currIndex % gridWidth;
          const currGy = Math.floor(currIndex / gridWidth);
          const neighbors = [
            { nx: 0, ny: -1 },
            { nx: 1, ny: 0 },
            { nx: 0, ny: 1 },
            { nx: -1, ny: 0 },
          ];

          for (const { nx, ny } of neighbors) {
            const nGx = (((currGx + nx) % gridWidth) + gridWidth) % gridWidth;
            const nGy = (((currGy + ny) % gridHeight) + gridHeight) % gridHeight;
            const nIndex = nGy * gridWidth + nGx;
            if (gameState.terrainOwnership[nIndex] === null && !processedIndices.has(nIndex)) {
              processedIndices.add(nIndex);
              if (isSmallHole) {
                regionCells.push(nIndex);
                queue.push(nIndex);
              }
            }
          }
        }
        if (isSmallHole && regionCells.length <= MAX_HOLE_SIZE) {
          for (const cellIndex of regionCells) gameState.terrainOwnership[cellIndex] = ownerId;
        }
      }
    }
  }

  // --- STEP 4: One-Cell Hole Filler (The Final Polish) ---
  // Iterates one last time to remove single-pixel noise.
  // Rule: If an empty cell has >= 5 friendly neighbors (out of 8), fill it.
  const cellsToPolish: number[] = [];

  for (let dy = -scanRange; dy <= scanRange; dy++) {
    for (let dx = -scanRange; dx <= scanRange; dx++) {
      const gridX = (((centerGridX + dx) % gridWidth) + gridWidth) % gridWidth;
      const gridY = (((centerGridY + dy) % gridHeight) + gridHeight) % gridHeight;
      const index = gridY * gridWidth + gridX;

      if (gameState.terrainOwnership[index] === null) {
        let friendlyNeighbors = 0;

        // Check 8 neighbors (Moore Neighborhood)
        for (let ny = -1; ny <= 1; ny++) {
          for (let nx = -1; nx <= 1; nx++) {
            if (nx === 0 && ny === 0) continue;

            const nGx = (((gridX + nx) % gridWidth) + gridWidth) % gridWidth;
            const nGy = (((gridY + ny) % gridHeight) + gridHeight) % gridHeight;
            const nIndex = nGy * gridWidth + nGx;

            if (gameState.terrainOwnership[nIndex] === ownerId) {
              friendlyNeighbors++;
            }
          }
        }

        // 5 is the magic number.
        // 4 neighbors is a flat wall. 5 neighbors is a dent/hole.
        if (friendlyNeighbors >= 5) {
          cellsToPolish.push(index);
        }
      }
    }
  }
  for (const index of cellsToPolish) gameState.terrainOwnership[index] = ownerId;
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
