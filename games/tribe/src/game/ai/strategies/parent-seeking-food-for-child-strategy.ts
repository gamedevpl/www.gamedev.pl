import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { BerryBushEntity } from '../../entities/plants/berry-bush/berry-bush-types';
import { vectorDistance, vectorNormalize, getDirectionVectorOnTorus } from '../../utils/math-utils';
import { findClosestEntity } from '../../utils/world-utils';
import { HUMAN_INTERACTION_RANGE, CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD } from '../../world-consts';
import { EntityType } from '../../entities/entities-types';
import { HumanAIStrategy } from './ai-strategy-types';
import { IndexedWorldState } from '../../world-index/world-index-types';

export class ParentSeekingFoodForChildStrategy implements HumanAIStrategy<BerryBushEntity> {
  check(human: HumanEntity, context: UpdateContext): BerryBushEntity | null {
    if (!human.isAdult || human.food.length > 0) {
      return null;
    }

    const { gameState } = context;
    const indexedState = gameState as IndexedWorldState;

    const hungryChildren = indexedState.search.human.byRadius(human.position, 1000).filter((child) => {
      return (
        !child.isAdult &&
        (child.motherId === human.id || child.fatherId === human.id) &&
        child.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD
      );
    });

    if (hungryChildren.length === 0) {
      return null;
    }

    // This parent has hungry children and no food. It should go find some.
    // The logic is similar to GatheringStrategy's check, but without the hunger check for the parent.
    const unclaimedBushes = indexedState.search.berryBush
      .byProperty('ownerId', undefined)
      .filter((b) => b.food.length > 0);

    if (unclaimedBushes.length > 0) {
      return findClosestEntity<BerryBushEntity>(
        human,
        gameState,
        'berryBush' as EntityType,
        undefined,
        (b) => b.food.length > 0 && b.ownerId === undefined,
      );
    }

    // No unclaimed bushes, maybe check for family bushes or any bush as a last resort.
    const anyBush = findClosestEntity<BerryBushEntity>(
      human,
      gameState,
      'berryBush' as EntityType,
      undefined,
      (b) => b.food.length > 0,
    );

    return anyBush;
  }

  execute(human: HumanEntity, _: UpdateContext, targetBush: BerryBushEntity): void {
    if (!targetBush) {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return;
    }

    const distance = vectorDistance(human.position, targetBush.position);
    if (distance < HUMAN_INTERACTION_RANGE) {
      human.activeAction = 'gathering';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    } else {
      human.activeAction = 'moving';
      human.targetPosition = { ...targetBush.position };
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        targetBush.position,
        _.gameState.mapDimensions.width,
        _.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);
    }
  }
}
