import { HumanAIStrategy } from './ai-strategy-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import {
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  PARENT_FEEDING_RANGE,
  CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
} from '../../world-consts';
import { findClosestEntity, getRandomNearbyPosition } from '../../utils/world-utils';
import { calculateWrappedDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils';
import { EntityType } from '../../entities/entities-types';

export class ChildSeekingFoodStrategy implements HumanAIStrategy {
  check(human: HumanEntity): boolean {
    if (!human.isAdult && human.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD) {
      return true;
    }
    return false;
  }

  execute(human: HumanEntity, context: UpdateContext): void {
    const { gameState } = context;

    const findParentFn = (p: HumanEntity) => {
      if (p.type !== 'human') return false;
      const parentCandidate = p as HumanEntity;
      return (
        (parentCandidate.id === human.motherId || parentCandidate.id === human.fatherId) &&
        parentCandidate.berries > 0
      );
    };

    // 1. Local search
    let parentWithFood = findClosestEntity<HumanEntity>(
      human,
      gameState.entities.entities,
      'human' as EntityType,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
      CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
      (p) => findParentFn(p as HumanEntity),
    );

    // 2. Global search if local search fails
    if (!parentWithFood) {
      parentWithFood = findClosestEntity<HumanEntity>(
        human,
        gameState.entities.entities,
        'human' as EntityType,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
        undefined, // No radius limit for global search
        (p) => findParentFn(p as HumanEntity),
      );
    }

    if (parentWithFood) {
      const distance = calculateWrappedDistance(
        human.position,
        parentWithFood.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );

      // 3. Move towards parent
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
      // 4. No parent found, stay idle but with a chance to move slightly
      human.activeAction = 'seekingFood';
      human.targetPosition = undefined;

      // 5. Small chance to move to avoid getting stuck
      if (Math.random() < 0.05) {
        // 5% chance
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
