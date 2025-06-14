import { HumanAIStrategy } from './ai-strategy-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { EntityType } from '../../entities/entities-types';
import {
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  PARENT_FEEDING_RANGE,
  CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
} from '../../world-consts';
import { findClosestEntity } from '../../utils/world-utils';
import { calculateWrappedDistance, vectorSubtract, vectorNormalize } from '../../utils/math-utils';

export class ParentFeedingChildStrategy implements HumanAIStrategy {
  check(human: HumanEntity, context: UpdateContext): boolean {
    if (!human.isAdult) {
      return false;
    }
    if (human.berries <= 0) {
      return false;
    }
    if (human.feedChildCooldownTime && human.feedChildCooldownTime > 0) {
      return false;
    }

    const hungryChild = findClosestEntity<HumanEntity>(
      human,
      context.gameState,
      'human' as EntityType,
      CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
      (entity) => {
        const childEntity = entity as HumanEntity;
        return (
          !childEntity.isAdult &&
          (childEntity.motherId === human.id || childEntity.fatherId === human.id) &&
          childEntity.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD
        );
      },
    );

    return !!hungryChild;
  }

  execute(human: HumanEntity, context: UpdateContext): void {
    const hungryChild = findClosestEntity<HumanEntity>(
      human,
      context.gameState,
      'human' as EntityType,
      CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS,
      (entity) => {
        const childEntity = entity as HumanEntity;
        return (
          !childEntity.isAdult &&
          (childEntity.motherId === human.id || childEntity.fatherId === human.id) &&
          childEntity.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD
        );
      },
    );

    if (!hungryChild) {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return;
    }

    const childToFeed = hungryChild;
    const distance = calculateWrappedDistance(
      human.position,
      childToFeed.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > PARENT_FEEDING_RANGE) {
      human.activeAction = 'moving';
      human.targetPosition = { ...childToFeed.position };
      const dirToTarget = vectorSubtract(childToFeed.position, human.position);
      human.direction = vectorNormalize(dirToTarget);
    } else {
      human.activeAction = 'idle'; // Interaction will handle feeding
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}
