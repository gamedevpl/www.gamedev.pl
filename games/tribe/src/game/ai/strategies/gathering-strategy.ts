import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { BerryBushEntity } from '../../entities/plants/berry-bush/berry-bush-types';
import { getDirectionVectorOnTorus, vectorDistance, vectorNormalize } from '../../utils/math-utils';
import { areFamily, findClosestEntity } from '../../utils/world-utils';
import {
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  HUMAN_CRITICAL_HUNGER_FOR_STEALING,
  HUMAN_INTERACTION_RANGE,
  KARMA_ENEMY_THRESHOLD,
} from '../../world-consts';
import { EntityType } from '../../entities/entities-types';
import { HumanAIStrategy } from './ai-strategy-types';
import { HumanCorpseEntity } from '../../entities/characters/human/human-corpse-types';
import { IndexedWorldState } from '../../world-index/world-index-types';

type FoodSource = BerryBushEntity | HumanCorpseEntity;

export class GatheringStrategy implements HumanAIStrategy<FoodSource> {
  check(human: HumanEntity, context: UpdateContext): FoodSource | null {
    const hasCapacity = human.food.length < human.maxFood;
    if (!human.isAdult || !hasCapacity || human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING) {
      return null;
    }

    const { gameState } = context;
    const indexedState = gameState as IndexedWorldState;

    const allBushes = indexedState.search.berryBush.byRadius(human.position, 1000).filter((b) => b.food.length > 0);
    const allCorpses = indexedState.search.humanCorpse.byRadius(human.position, 1000).filter((c) => c.food.length > 0);
    const allFoodSources: FoodSource[] = [...allBushes, ...allCorpses];

    const findClosest = (sources: FoodSource[]): FoodSource | null => {
      let closest: FoodSource | null = null;
      let minDistance = Infinity;
      for (const source of sources) {
        const distance = vectorDistance(human.position, source.position);
        if (distance < minDistance) {
          minDistance = distance;
          closest = source;
        }
      }
      return closest;
    };

    // Tier 1: Unclaimed sources
    const unclaimedSources = allFoodSources.filter((s) => !('ownerId' in s && s.ownerId));
    if (unclaimedSources.length > 0) {
      return findClosest(unclaimedSources);
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
      return findClosest(familySources);
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
        return findClosest(nonEnemySources);
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
      return findClosest(enemySources);
    }

    // Fallback to original logic if no specific tier matches, though unlikely
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
      const distToBush = vectorDistance(human.position, closestBush.position);
      const distToCorpse = vectorDistance(human.position, closestCorpse.position);
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

    const distance = vectorDistance(human.position, target.position);
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
