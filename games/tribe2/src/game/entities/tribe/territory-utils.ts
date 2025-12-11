/**
 * Utility functions for tribe territory calculation and management.
 */

import { Vector2D } from '../../utils/math-types';
import { EntityId } from '../entities-types';
import { GameWorldState } from '../../world-types';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { TribeTerritory, TerritoryCircle, TerritoryCheckResult } from './territory-types';
import {
  TERRITORY_BUILDING_RADIUS,
  TERRITORY_CENTER_RADIUS,
  TERRITORY_BORDER_PLACEMENT_DISTANCE,
  TERRITORY_MINIMUM_GAP,
  TERRITORY_COLORS,
  TERRITORY_WANDER_DISTANCE,
} from './territory-consts';
import { calculateWrappedDistance, getAveragePosition, getDirectionVectorOnTorus } from '../../utils/math-utils';

/**
 * Calculates the territory for a specific tribe.
 * Territory is based on buildings owned by the tribe.
 * No buildings = no territory border.
 */
export function calculateTribeTerritory(
  leaderId: EntityId,
  gameState: GameWorldState,
  tribeColorIndex: number = 0,
): TribeTerritory | undefined {
  const indexedState = gameState as IndexedWorldState;

  // Get all buildings owned by this tribe
  const buildings = indexedState.search.building.byProperty('ownerId', leaderId);

  // No buildings means no territory
  if (buildings.length === 0) {
    return undefined;
  }

  // Get tribe members to calculate tribe center
  const tribeMembers = indexedState.search.human.byProperty('leaderId', leaderId);

  if (tribeMembers.length === 0) {
    return undefined;
  }

  const circles: TerritoryCircle[] = [];

  // Add circles around each building
  for (const building of buildings) {
    circles.push({
      center: { ...building.position },
      radius: TERRITORY_BUILDING_RADIUS,
    });
  }

  // Calculate tribe center from buildings
  const buildingPositions = buildings.map((b) => b.position);
  const territoryCenter = getAveragePosition(buildingPositions);

  // Add a circle at the tribe center (based on number of buildings)
  // More buildings = larger center radius
  const centerRadius = Math.min(TERRITORY_CENTER_RADIUS, TERRITORY_BUILDING_RADIUS * (1 + buildings.length * 0.5));
  circles.push({
    center: { ...territoryCenter },
    radius: centerRadius,
  });

  // Calculate bounding radius from center
  let boundingRadius = centerRadius;
  for (const circle of circles) {
    const distFromCenter = calculateWrappedDistance(
      territoryCenter,
      circle.center,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    const extendedRadius = distFromCenter + circle.radius;
    if (extendedRadius > boundingRadius) {
      boundingRadius = extendedRadius;
    }
  }

  // Get color for this tribe
  const color = TERRITORY_COLORS[tribeColorIndex % TERRITORY_COLORS.length];

  return {
    leaderId,
    center: territoryCenter,
    circles,
    boundingRadius,
    color,
  };
}

/**
 * Calculates territories for all tribes in the game.
 */
export function calculateAllTerritories(gameState: GameWorldState): Map<EntityId, TribeTerritory> {
  const indexedState = gameState as IndexedWorldState;
  const territories = new Map<EntityId, TribeTerritory>();

  // Find all unique leader IDs
  const allHumans = indexedState.search.human.all();
  const leaderIds = new Set<EntityId>();

  for (const human of allHumans) {
    if (human.leaderId) {
      leaderIds.add(human.leaderId);
    }
  }

  // Calculate territory for each tribe
  let colorIndex = 0;
  for (const leaderId of leaderIds) {
    const territory = calculateTribeTerritory(leaderId, gameState, colorIndex);
    if (territory) {
      territories.set(leaderId, territory);
      colorIndex++;
    }
  }

  return territories;
}

/**
 * Checks if a position is inside a specific territory circle.
 */
function isInsideCircle(
  position: Vector2D,
  circle: TerritoryCircle,
  worldWidth: number,
  worldHeight: number,
): boolean {
  const distance = calculateWrappedDistance(position, circle.center, worldWidth, worldHeight);
  return distance <= circle.radius;
}

/**
 * Gets the distance from a position to the edge of the nearest circle in a territory.
 * Returns negative values if inside, positive if outside.
 */
function getDistanceToTerritoryEdge(
  position: Vector2D,
  territory: TribeTerritory,
  worldWidth: number,
  worldHeight: number,
): number {
  let minDistance = Infinity;

  for (const circle of territory.circles) {
    const distToCenter = calculateWrappedDistance(position, circle.center, worldWidth, worldHeight);
    const distToEdge = distToCenter - circle.radius;

    if (distToEdge < minDistance) {
      minDistance = distToEdge;
    }
  }

  return minDistance;
}

/**
 * Checks if a position is within a territory or near its border.
 */
export function checkPositionInTerritory(
  position: Vector2D,
  territory: TribeTerritory,
  gameState: GameWorldState,
): TerritoryCheckResult {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  // Check if inside any circle
  let isInside = false;
  for (const circle of territory.circles) {
    if (isInsideCircle(position, circle, worldWidth, worldHeight)) {
      isInside = true;
      break;
    }
  }

  const distanceToEdge = getDistanceToTerritoryEdge(position, territory, worldWidth, worldHeight);
  const isNearBorder = !isInside && distanceToEdge <= TERRITORY_BORDER_PLACEMENT_DISTANCE;

  return {
    isInsideTerritory: isInside,
    isNearBorder,
    distanceToEdge,
    territory,
  };
}

/**
 * Checks if a position is valid for building placement based on territory rules.
 * - Must be inside or near the owner's territory
 * - Must not be inside another tribe's territory
 */
export function canPlaceBuildingInTerritory(
  position: Vector2D,
  ownerId: EntityId,
  gameState: GameWorldState,
): { canPlace: boolean; reason?: string } {
  const territories = calculateAllTerritories(gameState);
  const ownerTerritory = territories.get(ownerId);

  // If the owner has no territory yet (first building), allow placement
  if (!ownerTerritory) {
    // But check it doesn't overlap with other territories
    for (const [otherId, otherTerritory] of territories) {
      if (otherId === ownerId) continue;

      const checkResult = checkPositionInTerritory(position, otherTerritory, gameState);
      if (checkResult.isInsideTerritory) {
        return { canPlace: false, reason: 'Position is inside another tribe\'s territory' };
      }
    }
    return { canPlace: true };
  }

  // Check if position is within or near owner's territory
  const ownerCheck = checkPositionInTerritory(position, ownerTerritory, gameState);
  if (!ownerCheck.isInsideTerritory && !ownerCheck.isNearBorder) {
    return { canPlace: false, reason: 'Position is too far from tribe territory' };
  }

  // Check that position doesn't overlap with other territories
  for (const [otherId, otherTerritory] of territories) {
    if (otherId === ownerId) continue;

    const otherCheck = checkPositionInTerritory(position, otherTerritory, gameState);
    if (otherCheck.isInsideTerritory || otherCheck.distanceToEdge < TERRITORY_MINIMUM_GAP) {
      return { canPlace: false, reason: 'Position is too close to another tribe\'s territory' };
    }
  }

  return { canPlace: true };
}

/**
 * Checks if a position is valid for a tribe member to wander to.
 * Members should stay within territory or close to its edge.
 */
export function isValidWanderPosition(
  position: Vector2D,
  leaderId: EntityId,
  gameState: GameWorldState,
): boolean {
  const territories = calculateAllTerritories(gameState);
  const ownTerritory = territories.get(leaderId);

  // If no territory, allow wandering anywhere
  if (!ownTerritory) {
    return true;
  }

  const checkResult = checkPositionInTerritory(position, ownTerritory, gameState);

  // Allow wandering inside territory or within TERRITORY_WANDER_DISTANCE of the edge
  if (checkResult.isInsideTerritory) {
    return true;
  }

  if (checkResult.distanceToEdge <= TERRITORY_WANDER_DISTANCE) {
    // But not if it would enter another tribe's territory
    for (const [otherId, otherTerritory] of territories) {
      if (otherId === leaderId) continue;

      const otherCheck = checkPositionInTerritory(position, otherTerritory, gameState);
      if (otherCheck.isInsideTerritory) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Gets the territory boundary points for rendering.
 * Returns an array of points that outline the territory.
 */
export function getTerritoryBoundaryPoints(
  territory: TribeTerritory,
  segmentsPerCircle: number = 32,
): Vector2D[][] {
  const boundaries: Vector2D[][] = [];

  // For each circle, generate boundary points
  for (const circle of territory.circles) {
    const points: Vector2D[] = [];
    for (let i = 0; i < segmentsPerCircle; i++) {
      const angle = (i / segmentsPerCircle) * Math.PI * 2;
      points.push({
        x: circle.center.x + Math.cos(angle) * circle.radius,
        y: circle.center.y + Math.sin(angle) * circle.radius,
      });
    }
    boundaries.push(points);
  }

  return boundaries;
}

/**
 * Checks if a target position is within reasonable operating range for a tribe member.
 * This allows gathering/hunting slightly outside territory but not too far.
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
  maxDistanceOutside: number = TERRITORY_WANDER_DISTANCE,
): boolean {
  const territories = calculateAllTerritories(gameState);
  const ownTerritory = territories.get(leaderId);

  // If no territory (no buildings), allow operating anywhere
  if (!ownTerritory) {
    return true;
  }

  const checkResult = checkPositionInTerritory(targetPosition, ownTerritory, gameState);

  // Inside territory is always valid
  if (checkResult.isInsideTerritory) {
    return true;
  }

  // Allow operating slightly outside territory
  if (checkResult.distanceToEdge <= maxDistanceOutside) {
    // But not if it's inside another tribe's territory
    for (const [otherId, otherTerritory] of territories) {
      if (otherId === leaderId) continue;

      const otherCheck = checkPositionInTerritory(targetPosition, otherTerritory, gameState);
      if (otherCheck.isInsideTerritory) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Constrains a wander target to be within territory bounds.
 * If the target is outside territory, returns a position on the territory edge
 * in the direction of the original target.
 */
export function constrainWanderToTerritory(
  currentPosition: Vector2D,
  targetPosition: Vector2D,
  leaderId: EntityId,
  gameState: GameWorldState,
): Vector2D {
  const territories = calculateAllTerritories(gameState);
  const ownTerritory = territories.get(leaderId);

  // If no territory, don't constrain
  if (!ownTerritory) {
    return targetPosition;
  }

  // Check if target is valid
  if (isValidWanderPosition(targetPosition, leaderId, gameState)) {
    return targetPosition;
  }

  // Find the closest point on territory edge in the direction of the target
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
      x: ((currentPosition.x + (directionToTarget.x * d) / magnitude) % worldWidth + worldWidth) % worldWidth,
      y: ((currentPosition.y + (directionToTarget.y * d) / magnitude) % worldHeight + worldHeight) % worldHeight,
    };

    if (isValidWanderPosition(testPosition, leaderId, gameState)) {
      validPosition = testPosition;
    } else {
      break;
    }
  }

  return validPosition;
}
