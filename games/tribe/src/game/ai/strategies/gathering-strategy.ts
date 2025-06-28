import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { BerryBushEntity } from '../../entities/plants/berry-bush/berry-bush-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../utils/math-utils';
import { areFamily, findChildren, findClosestEntity } from '../../utils/world-utils';
import {
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  HUMAN_CRITICAL_HUNGER_FOR_STEALING,
  HUMAN_INTERACTION_PROXIMITY,
  KARMA_ENEMY_THRESHOLD,
} from '../../world-consts';
import { EntityType } from '../../entities/entities-types';
import { HumanAIStrategy } from './ai-strategy-types';
import { HumanCorpseEntity } from '../../entities/characters/human/human-corpse-types';
import { IndexedWorldState } from '../../world-index/world-index-types';

export type FoodSource = BerryBushEntity | HumanCorpseEntity;

export class GatheringStrategy implements HumanAIStrategy<FoodSource> {
  check(
    human: HumanEntity,
    context: UpdateContext,
    options: {
      onlyBerries: boolean;
      hungerThreshold: number;
    } = {
      onlyBerries: false,
      hungerThreshold: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
    },
  ): FoodSource | null {
    const hasCapacity = human.food.length < human.maxFood;
    const childrenCount = findChildren(context.gameState, human).length;
    const threshold = childrenCount > 0 ? options.hungerThreshold * 0.5 : options.hungerThreshold;
    if (!human.isAdult || !hasCapacity || human.hunger < threshold) {
      return null;
    }

    const { gameState } = context;
    const indexedState = gameState as IndexedWorldState;

    const findClosest = (sources: FoodSource[], position: { x: number; y: number }): FoodSource | null => {
      let closest: FoodSource | null = null;
      let minDistance = Infinity;
      for (const source of sources) {
        const distance = calculateWrappedDistance(
          position,
          source.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        if (distance < minDistance) {
          minDistance = distance;
          closest = source;
        }
      }
      return closest;
    };

    const findBestFoodSource = (searchRadius: number, searchCenter: { x: number; y: number }): FoodSource | null => {
      const allBushes = indexedState.search.berryBush
        .byRadius(searchCenter, searchRadius)
        .filter((b) => b.food.length > 0);
      const allCorpses = !options.onlyBerries
        ? indexedState.search.humanCorpse.byRadius(searchCenter, searchRadius).filter((c) => c.food.length > 0)
        : [];
      const allFoodSources: FoodSource[] = [...allBushes, ...allCorpses];

      // Tier 1: Unclaimed sources
      const unclaimedSources = allFoodSources.filter((s) => !('ownerId' in s && s.ownerId));
      if (unclaimedSources.length > 0) {
        return findClosest(unclaimedSources, human.position);
      }

      // Tier 2: Family-owned sources
      const familySources = allFoodSources.filter((s) => {
        if ('ownerId' in s && s.ownerId) {
          const owner = gameState.entities.entities.get(s.ownerId) as HumanEntity | undefined;
          return owner && areFamily(human, owner, gameState);
        }
        return false;
      });
      if (familySources.length > 0) {
        return findClosest(familySources, human.position);
      }

      // Tier 3: Critically hungry - steal from non-enemies
      if (human.hunger >= HUMAN_CRITICAL_HUNGER_FOR_STEALING) {
        const nonEnemySources = allFoodSources.filter((s) => {
          if ('ownerId' in s && s.ownerId) {
            const owner = gameState.entities.entities.get(s.ownerId) as HumanEntity | undefined;
            return owner && (owner.karma[human.id] || 0) > KARMA_ENEMY_THRESHOLD;
          }
          return false;
        });
        if (nonEnemySources.length > 0) {
          return findClosest(nonEnemySources, human.position);
        }
      }

      // Tier 4: Last resort - steal from enemies
      const enemySources = allFoodSources.filter((s) => {
        if ('ownerId' in s && s.ownerId) {
          const owner = gameState.entities.entities.get(s.ownerId) as HumanEntity | undefined;
          return owner && (owner.karma[human.id] || 0) <= KARMA_ENEMY_THRESHOLD;
        }
        return false;
      });
      if (enemySources.length > 0) {
        return findClosest(enemySources, human.position);
      }

      return null;
    };

    // --- Main Logic ---

    // 2. Fallback to global search if no food in territory or not in a tribe
    const globalSearchRadius = Math.max(gameState.mapDimensions.width, gameState.mapDimensions.height);
    const globalFoodSource = findBestFoodSource(globalSearchRadius, human.position);
    if (globalFoodSource) {
      return globalFoodSource;
    }

    // 3. Original fallback (should be redundant now but kept as a safeguard)
    const closestBush = findClosestEntity<BerryBushEntity>(
      human,
      gameState,
      'berryBush' as EntityType,
      undefined,
      (b) => b.food.length > 0,
    );

    const closestCorpse = findClosestEntity<HumanCorpseEntity>(
      human,
      gameState,
      'humanCorpse' as EntityType,
      undefined,
      (c) => c.food.length > 0,
    );

    if (closestBush && closestCorpse) {
      const distToBush = calculateWrappedDistance(
        human.position,
        closestBush.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      const distToCorpse = calculateWrappedDistance(
        human.position,
        closestCorpse.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      return distToBush <= distToCorpse ? closestBush : closestCorpse;
    }

    return closestBush || closestCorpse;
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
    if (distance < HUMAN_INTERACTION_PROXIMITY) {
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
