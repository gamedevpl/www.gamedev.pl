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

export class ParentFeedingChildStrategy implements HumanAIStrategy<HumanEntity> {
  check(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    if (!human.isAdult || human.berries <= 0 || (human.feedChildCooldownTime && human.feedChildCooldownTime > 0)) {
      return null;
    }

    return findClosestEntity<HumanEntity>(
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
  }

  execute(human: HumanEntity, context: UpdateContext, hungryChild: HumanEntity): void {
    if (!hungryChild) {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return;
    }

    const distance = calculateWrappedDistance(
      human.position,
      hungryChild.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > PARENT_FEEDING_RANGE) {
      human.activeAction = 'moving';
      human.targetPosition = { ...hungryChild.position };
      const dirToTarget = vectorSubtract(hungryChild.position, human.position);
      human.direction = vectorNormalize(dirToTarget);
    } else {
      // The interaction system will handle the actual feeding when the parent is idle and close.
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}
