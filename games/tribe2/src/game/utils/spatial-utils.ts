import { EntityId } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { calculateWrappedDistance, getAveragePosition, vectorAdd } from './math-utils';
import { Vector2D } from './math-types';
import { findTribeMembers, getFamilyMembers } from './family-tribe-utils';

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
  if (!isPositionOccupied(center, gameState, spotRadius, ignoreEntityId)) {
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
      if (!isPositionOccupied(wrappedSpot, gameState, spotRadius, ignoreEntityId)) {
        return wrappedSpot;
      }
    }
  }

  return null;
}

export function getTribeCenter(leaderId: EntityId, gameState: GameWorldState): Vector2D {
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
