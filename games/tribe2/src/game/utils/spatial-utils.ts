import { EntityId } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { calculateWrappedDistance, getAveragePosition, vectorAdd } from './math-utils';
import { Vector2D } from './math-types';
import { findTribeMembers, getFamilyMembers } from '../entities/tribe/family-tribe-utils';
import { BuildingEntity } from '../entities/buildings/building-types';
import { isSoilDepleted, getSoilDepletionLevel } from '../entities/plants/soil-depletion-update';
import { SoilDepletionState } from '../entities/plants/soil-depletion-types';

/** Number of candidate positions to generate when preferring paths */
const PATH_PREFERENCE_CANDIDATES = 5;

/** Weight multiplier for soil depletion when selecting wander positions */
const SOIL_DEPLETION_WEIGHT = 3.0;

export function getRandomNearbyPosition(
  center: Vector2D,
  radius: number,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  const randomAngle = Math.random() * Math.PI * 2;
  const randomDistance = Math.sqrt(Math.random()) * radius;
  const offset = {
    x: Math.cos(randomAngle) * randomDistance,
    y: Math.sin(randomAngle) * randomDistance,
  };
  const newPosition = vectorAdd(center, offset);
  return {
    x: ((newPosition.x % worldWidth) + worldWidth) % worldWidth,
    y: ((newPosition.y % worldHeight) + worldHeight) % worldHeight,
  };
}

/**
 * Gets a random nearby position with a preference for already depleted soil.
 * This creates a subtle bias towards existing paths, making walk path formation more likely.
 * Generates multiple candidate positions and weights selection towards those with more soil depletion.
 */
export function getRandomNearbyPositionPreferringPaths(
  center: Vector2D,
  radius: number,
  worldWidth: number,
  worldHeight: number,
  soilState: SoilDepletionState,
): Vector2D {
  // Generate multiple candidate positions
  const candidates: { position: Vector2D; weight: number }[] = [];

  for (let i = 0; i < PATH_PREFERENCE_CANDIDATES; i++) {
    const position = getRandomNearbyPosition(center, radius, worldWidth, worldHeight);
    // Get depletion level (0-1, where 1 is fully depleted)
    const depletionLevel = getSoilDepletionLevel(soilState, position, worldWidth, worldHeight);
    // Weight = base weight (1) + bonus for depleted soil
    // Even slight depletion (e.g., 0.05) gives a small bonus, creating subtle path preference
    const weight = 1.0 + depletionLevel * SOIL_DEPLETION_WEIGHT;
    candidates.push({ position, weight });
  }

  // Weighted random selection
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let randomValue = Math.random() * totalWeight;

  for (const candidate of candidates) {
    randomValue -= candidate.weight;
    if (randomValue <= 0) {
      return candidate.position;
    }
  }

  // Fallback to last candidate (shouldn't normally happen)
  return candidates[candidates.length - 1].position;
}

export function isPositionOccupied(
  position: Vector2D,
  gameState: GameWorldState,
  checkRadius: number,
  ignoreEntityId?: EntityId, // New optional parameter
): boolean {
  const indexedState = gameState as IndexedWorldState;
  const searchRect = {
    left: position.x - checkRadius,
    top: position.y - checkRadius,
    right: position.x + checkRadius,
    bottom: position.y + checkRadius,
  };

  const potentialOccupants = [
    ...indexedState.search.human.byRect(searchRect),
    ...indexedState.search.berryBush.byRect(searchRect),
    ...indexedState.search.corpse.byRect(searchRect),
  ];

  for (const entity of potentialOccupants) {
    // Ignore the specified entity if provided
    if (ignoreEntityId !== undefined && entity.id === ignoreEntityId) {
      continue;
    }

    const distance = calculateWrappedDistance(
      position,
      entity.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    if (distance < checkRadius + entity.radius) {
      return true;
    }
  }
  return false;
}

export function findValidPlantingSpot(
  center: Vector2D,
  gameState: GameWorldState,
  searchRadius: number,
  spotRadius: number,
  ignoreEntityId?: EntityId, // New optional parameter
): Vector2D | null {
  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;

  // First, check the center spot itself, ignoring the specified entity.
  if (
    !isPositionOccupied(center, gameState, spotRadius, ignoreEntityId) &&
    !isSoilDepleted(gameState.soilDepletion, center, worldWidth, worldHeight)
  ) {
    return center;
  }

  // Then, check in expanding concentric circles (approximated by polygons)
  const step = spotRadius; // The distance between each check point circle.
  for (let r = step; r <= searchRadius; r += step) {
    const pointsOnCircle = Math.ceil((2 * Math.PI * r) / step); // Number of points to check on the circle
    for (let i = 0; i < pointsOnCircle; i++) {
      const angle = (i / pointsOnCircle) * 2 * Math.PI;
      const offset = {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
      };
      const spot = vectorAdd(center, offset);
      const wrappedSpot = {
        x: ((spot.x % worldWidth) + worldWidth) % worldWidth,
        y: ((spot.y % worldHeight) + worldHeight) % worldHeight,
      };

      // Pass the ignoreEntityId to the occupancy check
      if (
        !isPositionOccupied(wrappedSpot, gameState, spotRadius, ignoreEntityId) &&
        !isSoilDepleted(gameState.soilDepletion, wrappedSpot, worldWidth, worldHeight)
      ) {
        return wrappedSpot;
      }
    }
  }

  return null;
}

export function getTribeCenter(leaderId: EntityId, gameState: GameWorldState): Vector2D {
  const buildings = (gameState as IndexedWorldState).search.building.byProperty('ownerId', leaderId);
  if (buildings.length > 0) {
    // buildings define the tribe center if any exist
    const positions = buildings.map((building) => building.position);
    return getAveragePosition(positions);
  }

  const tribeMembers = findTribeMembers(leaderId, gameState);
  if (tribeMembers.length === 0) {
    const leader = gameState.entities.entities[leaderId];
    return leader ? leader.position : { x: 0, y: 0 };
  }
  const positions = tribeMembers.map((member) => member.position);
  return getAveragePosition(positions);
}

export function getFamilyCenter(human: HumanEntity, gameState: GameWorldState): Vector2D {
  const familyMembers = getFamilyMembers(human, gameState);
  const positions = [...familyMembers, human].map((member) => member.position);
  return getAveragePosition(positions);
}

/**
 * Checks if a position is within the rectangular bounds of a building zone,
 * accounting for world wrapping (toroidal world).
 */
export function isPositionInZone(position: Vector2D, zone: BuildingEntity, gameState: GameWorldState): boolean {
  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;

  // Calculate relative position accounting for wrapping
  let dx = position.x - zone.position.x;
  let dy = position.y - zone.position.y;

  // Handle wrapping
  if (Math.abs(dx) > worldWidth / 2) dx -= Math.sign(dx) * worldWidth;
  if (Math.abs(dy) > worldHeight / 2) dy -= Math.sign(dy) * worldHeight;

  return Math.abs(dx) <= zone.width / 2 && Math.abs(dy) <= zone.height / 2;
}
