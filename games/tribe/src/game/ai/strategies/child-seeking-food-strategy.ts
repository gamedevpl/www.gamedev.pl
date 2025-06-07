import { HumanAIStrategy } from './ai-strategy-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import {
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  PARENT_FEEDING_RANGE,
  CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
} from '../../world-consts';
import { findClosestEntity } from '../../utils/world-utils';
import { calculateWrappedDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils'; // Using calculateWrappedDistance
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

    const parentWithFood = findClosestEntity<HumanEntity>(
      human,
      gameState.entities.entities,
      'human' as EntityType,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
      CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
      (p) => {
        if (p.type !== 'human') return false;
        const parentCandidate = p as HumanEntity;
        return (
          (parentCandidate.id === human.motherId || parentCandidate.id === human.fatherId) &&
          parentCandidate.berries > 0
        );
      },
    );

    if (parentWithFood) {
      const distance = calculateWrappedDistance(
        human.position,
        parentWithFood.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );

      if (distance > PARENT_FEEDING_RANGE) {
        human.activeAction = 'moving';
        human.targetPosition = { ...parentWithFood.position };
        const dirToTarget = vectorSubtract(parentWithFood.position, human.position);
        human.direction = vectorNormalize(dirToTarget);
      } else {
        // Child is close enough, feeding is handled by human-update.ts
        human.activeAction = 'idle';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      }
    } else {
      // No suitable parent found
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}
