import { HumanAIStrategy } from './ai-strategy-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import {
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  PARENT_FEEDING_RANGE,
  CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
  CHILD_MAX_WANDER_DISTANCE_FROM_PARENT,
} from '../../world-consts';
import { findClosestEntity, findParents, getRandomNearbyPosition } from '../../utils/world-utils';
import { calculateWrappedDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils';
import { EntityType } from '../../entities/entities-types';

export class ChildSeekingFoodStrategy implements HumanAIStrategy<HumanEntity | boolean> {
  check(human: HumanEntity, context: UpdateContext): HumanEntity | boolean | null {
    if (human.isAdult || human.hunger < CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD) {
      return null;
    }

    const { gameState } = context;

    const findParentWithFoodFn = (p: HumanEntity): boolean => {
      return (p.id === human.motherId || p.id === human.fatherId) && p.berries > 0;
    };

    // 1. Local search for parent with food
    let parentWithFood = findClosestEntity<HumanEntity>(
      human,
      gameState,
      'human' as EntityType,
      CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
      findParentWithFoodFn,
    );

    // 2. Global search if local search fails
    if (!parentWithFood) {
      parentWithFood = findClosestEntity<HumanEntity>(
        human,
        gameState,
        'human' as EntityType,
        undefined, // No radius limit
        findParentWithFoodFn,
      );
    }

    if (parentWithFood) {
      return parentWithFood; // Return the parent entity if found
    }

    // If no parent with food is found, but the child is hungry, return true to trigger execute.
    return true;
  }

  execute(human: HumanEntity, context: UpdateContext, checkResult: HumanEntity | boolean): void {
    const { gameState } = context;

    if (typeof checkResult === 'object') {
      // This means a parent with food was found and passed in checkResult
      const parentWithFood = checkResult;
      const distance = calculateWrappedDistance(
        human.position,
        parentWithFood.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );

      // Move towards parent with food
      if (distance > PARENT_FEEDING_RANGE) {
        human.activeAction = 'moving';
        human.targetPosition = { ...parentWithFood.position };
        const dirToTarget = vectorSubtract(parentWithFood.position, human.position);
        human.direction = vectorNormalize(dirToTarget);
      } else {
        // Child is close enough, wait for feeding
        human.activeAction = 'seekingFood';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      }
    } else {
      // This means no parent with food was found, but the child is hungry.
      // 4. Try to find any parent to stay close to.
      const parents = findParents(human, gameState);
      if (parents.length > 0) {
        const parentToFollow = parents[0]; // Just follow the first one found
        const distance = calculateWrappedDistance(
          human.position,
          parentToFollow.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );

        if (distance > CHILD_MAX_WANDER_DISTANCE_FROM_PARENT) {
          human.activeAction = 'moving';
          human.targetPosition = { ...parentToFollow.position };
          const dirToTarget = vectorSubtract(parentToFollow.position, human.position);
          human.direction = vectorNormalize(dirToTarget);
        } else {
          human.activeAction = 'seekingFood'; // Stay idle near parent
          human.direction = { x: 0, y: 0 };
          human.targetPosition = undefined;
        }
      } else {
        // 5. No parents found at all, stay idle with a small chance to move to avoid getting stuck
        human.activeAction = 'seekingFood';
        human.targetPosition = undefined;

        if (Math.random() < 0.05) {
          human.activeAction = 'moving';
          human.targetPosition = getRandomNearbyPosition(
            human.position,
            10, // Small radius
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );
          const dirToTarget = vectorSubtract(human.targetPosition, human.position);
          human.direction = vectorNormalize(dirToTarget);
        } else {
          human.direction = { x: 0, y: 0 };
        }
      }
    }
  }
}
