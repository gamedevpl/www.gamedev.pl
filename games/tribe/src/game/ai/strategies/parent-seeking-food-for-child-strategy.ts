import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { BerryBushEntity } from '../../entities/plants/berry-bush/berry-bush-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../utils/math-utils';
import { findClosestEntity } from '../../utils/world-utils';
import { CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD, HUMAN_INTERACTION_RANGE } from '../../world-consts';
import { EntityType } from '../../entities/entities-types';
import { HumanAIStrategy } from './ai-strategy-types';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { HumanCorpseEntity } from '../../entities/characters/human/human-corpse-types';

type FoodSource = BerryBushEntity | HumanCorpseEntity;

export class ParentSeekingFoodForChildStrategy implements HumanAIStrategy<FoodSource> {
  check(human: HumanEntity, context: UpdateContext): FoodSource | null {
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

    const findBestFoodSource = (searchCenter: { x: number; y: number }, searchRadius: number): FoodSource | null => {
      const closestBush = findClosestEntity<BerryBushEntity>(
        { ...human, position: searchCenter },
        gameState,
        'berryBush' as EntityType,
        searchRadius,
        (b) => b.food.length > 0,
      );

      const closestCorpse = findClosestEntity<HumanCorpseEntity>(
        { ...human, position: searchCenter },
        gameState,
        'humanCorpse' as EntityType,
        searchRadius,
        (c) => c.food.length > 0,
      );

      if (closestBush && closestCorpse) {
        const distToBush = calculateWrappedDistance(
          searchCenter,
          closestBush.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        const distToCorpse = calculateWrappedDistance(
          searchCenter,
          closestCorpse.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        return distToBush <= distToCorpse ? closestBush : closestCorpse;
      }
      return closestBush || closestCorpse;
    };

    // 2. Fallback to global search
    const globalSearchRadius = Math.max(gameState.mapDimensions.width, gameState.mapDimensions.height);
    return findBestFoodSource(human.position, globalSearchRadius);
  }

  execute(human: HumanEntity, context: UpdateContext, target: FoodSource): void {
    if (!target) {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return;
    }

    const distance = calculateWrappedDistance(
      human.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    if (distance < HUMAN_INTERACTION_RANGE) {
      human.activeAction = 'gathering';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    } else {
      human.activeAction = 'moving';
      human.targetPosition = { ...target.position };
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        target.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);
    }
  }
}
