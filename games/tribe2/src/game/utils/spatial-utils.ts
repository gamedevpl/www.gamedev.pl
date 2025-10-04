/**
 * Spatial Utilities - Position and collision helpers
 * Ported from Tribe 1
 */

import { Vector2D, Entity, GameState } from '../game-types';
import { vectorAdd, calculateWrappedDistance } from './math-utils';

/**
 * Get a random position near a center point
 */
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
 * Check if a position is occupied by any entity
 */
export function isPositionOccupied(
  position: Vector2D,
  gameState: GameState,
  checkRadius: number,
  ignoreEntityId?: string,
): boolean {
  for (const entity of gameState.entities) {
    if (ignoreEntityId !== undefined && entity.id === ignoreEntityId) {
      continue;
    }

    const distance = calculateWrappedDistance(
      position,
      entity.position,
      gameState.worldWidth,
      gameState.worldHeight,
    );
    if (distance < checkRadius + entity.radius) {
      return true;
    }
  }
  return false;
}

/**
 * Find a valid spot for placing an entity
 * Searches in expanding circles from the center
 */
export function findValidSpot(
  center: Vector2D,
  gameState: GameState,
  searchRadius: number,
  spotRadius: number,
  ignoreEntityId?: string,
): Vector2D | null {
  const worldWidth = gameState.worldWidth;
  const worldHeight = gameState.worldHeight;

  // First, check the center spot itself
  if (!isPositionOccupied(center, gameState, spotRadius, ignoreEntityId)) {
    return center;
  }

  // Then, check in expanding concentric circles
  const step = spotRadius;
  for (let r = step; r <= searchRadius; r += step) {
    const pointsOnCircle = Math.ceil((2 * Math.PI * r) / step);
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

      if (!isPositionOccupied(wrappedSpot, gameState, spotRadius, ignoreEntityId)) {
        return wrappedSpot;
      }
    }
  }

  return null;
}

/**
 * Find entities within a certain radius of a position
 */
export function findNearbyEntities(
  position: Vector2D,
  radius: number,
  gameState: GameState,
  excludeEntityId?: string,
): Entity[] {
  const nearby: Entity[] = [];

  for (const entity of gameState.entities) {
    if (excludeEntityId && entity.id === excludeEntityId) {
      continue;
    }

    const distance = calculateWrappedDistance(
      position,
      entity.position,
      gameState.worldWidth,
      gameState.worldHeight,
    );

    if (distance <= radius) {
      nearby.push(entity);
    }
  }

  return nearby;
}

/**
 * Find the closest entity to a position
 */
export function findClosestEntity(
  position: Vector2D,
  gameState: GameState,
  excludeEntityId?: string,
): Entity | null {
  let closestEntity: Entity | null = null;
  let closestDistance = Infinity;

  for (const entity of gameState.entities) {
    if (excludeEntityId && entity.id === excludeEntityId) {
      continue;
    }

    const distance = calculateWrappedDistance(
      position,
      entity.position,
      gameState.worldWidth,
      gameState.worldHeight,
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestEntity = entity;
    }
  }

  return closestEntity;
}
