import { GameWorldState } from '../world-types';
import { Vector2D } from './math-types';
import { findPlayerEntity } from './world-utils';
import { vectorLerp, getDirectionVectorOnTorus, vectorLength, vectorAdd } from './math-utils';
import { VIEWPORT_FOLLOW_SPEED } from '../game-consts.ts';
import { HumanEntity } from '../entities/characters/human/human-types';

export const updateViewportCenter = (
  gameState: GameWorldState,
  currentViewportCenter: Vector2D,
  deltaTime: number,
): Vector2D => {
  const { mapDimensions } = gameState;
  const { width, height } = mapDimensions;

  if (!gameState.cameraFollowingPlayer) {
    if (gameState.cameraTargetPosition) {
      // Smooth scroll to target
      const diff = getDirectionVectorOnTorus(
        currentViewportCenter,
        gameState.cameraTargetPosition,
        width,
        height
      );
      
      const distance = vectorLength(diff);
      if (distance < 1) {
        const finalPos = gameState.cameraTargetPosition;
        gameState.cameraTargetPosition = undefined;
        return finalPos;
      }

      const targetPosition = vectorAdd(currentViewportCenter, diff);
      let newViewportCenter = vectorLerp(currentViewportCenter, targetPosition, VIEWPORT_FOLLOW_SPEED * deltaTime);

      newViewportCenter = {
        x: ((newViewportCenter.x % width) + width) % width,
        y: ((newViewportCenter.y % height) + height) % height,
      };

      return newViewportCenter;
    }
    return currentViewportCenter;
  }

  const player = findPlayerEntity(gameState);
  let targetEntity: HumanEntity | undefined = player;

  if (gameState.debugCharacterId) {
    const debugEntity = gameState.entities.entities[gameState.debugCharacterId];
    if (debugEntity && 'position' in debugEntity) {
      targetEntity = debugEntity as HumanEntity;
    }
  }

  if (targetEntity) {
    // Create a target position for the lerp that may be outside the world bounds
    // to ensure the lerp takes the shortest path.
    let targetPosition = { ...targetEntity.position };

    const dx = targetPosition.x - currentViewportCenter.x;
    if (Math.abs(dx) > width / 2) {
      if (dx > 0) {
        targetPosition.x -= width;
      } else {
        targetPosition.x += width;
      }
    }

    const dy = targetPosition.y - currentViewportCenter.y;
    if (Math.abs(dy) > height / 2) {
      if (dy > 0) {
        targetPosition.y -= height;
      } else {
        targetPosition.y += height;
      }
    }

    // Lerp towards the adjusted target.
    let newViewportCenter = vectorLerp(currentViewportCenter, targetPosition, VIEWPORT_FOLLOW_SPEED * deltaTime);

    // Wrap the new viewport center to stay within the world bounds.
    newViewportCenter = {
      x: ((newViewportCenter.x % width) + width) % width,
      y: ((newViewportCenter.y % height) + height) % height,
    };

    return newViewportCenter;
  }

  // If there's no target, just return the game state's viewport center.
  return gameState.viewportCenter;
};

/**
 * Immediately centers the viewport on a specific world position.
 * @param gameState The game world state to mutate.
 * @param position The world coordinates to center on.
 */
export function centerViewportOn(gameState: GameWorldState, position: Vector2D): void {
  const { width, height } = gameState.mapDimensions;
  // Ensure the position is wrapped within the world bounds
  gameState.cameraTargetPosition = undefined;
  gameState.viewportCenter = {
    x: ((position.x % width) + width) % width,
    y: ((position.y % height) + height) % height,
  };
}
